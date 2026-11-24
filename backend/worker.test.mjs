import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import worker from './worker.mjs';

const origin = 'https://example.github.io';
const ownerName = 'test-owner';
const ownerPassword = 'test-only-owner-password';
const ownerCredentials = { username: ownerName, password: ownerPassword };

function setup(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));

  const database = {
    prepare(query) {
      const statement = sqlite.prepare(query);
      function withValues(values) {
        return {
          first: async () => statement.get(...values),
          run: async () => ({ meta: statement.run(...values) }),
          all: async () => ({ results: statement.all(...values) }),
        };
      }
      return { bind: (...values) => withValues(values), ...withValues([]) };
    },
  };

  const env = { DB: database, ALLOWED_ORIGINS: origin, ADMIN_USERNAME: ownerName, ADMIN_PASSWORD: ownerPassword };
  let session;

  async function request(path, options = {}) {
    const { method = 'GET', body, admin = false, token, requestOrigin = origin, address = '192.0.2.10' } = options;
    const headers = new Headers({ Origin: requestOrigin, 'CF-Connecting-IP': address });
    if (admin) {
      session ??= (await request('/api/admin/login', { method: 'POST', body: ownerCredentials })).body.token;
      headers.set('Authorization', `Bearer ${session}`);
    } else if (token) headers.set('Authorization', `Bearer ${token}`);
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    const req = new Request(new URL(path, 'https://api.example.com'), {
      method, headers, body: JSON.stringify(body),
    });
    const response = await worker.fetch(req, env);
    return {
      status: response.status,
      body: response.status === 204 ? null : await response.json(),
      headers: response.headers,
    };
  }

  return { request, sqlite, env };
}

test('public read hides accepted answers and admin routes require authorization', async t => {
  const { request } = setup(t);
  const game = await request('/api/game');
  assert.equal(game.status, 200);
  assert.equal(game.body.revision, 1);
  assert.equal(game.body.tiers.length, 5);
  assert.ok(game.body.questions.every(question => !Object.hasOwn(question, 'answers')));

  assert.equal((await request('/api/admin')).status, 401);
  assert.equal((await request('/api/admin/game', { method: 'PUT', body: {} })).status, 401);
  const admin = await request('/api/admin', { admin: true });
  assert.equal(admin.status, 200);
  assert.ok(admin.body.game.questions.every(question => question.answers.length));
});

test('allows configured browser origins, rejecting others', async t => {
  const { request } = setup(t);
  const preflight = await request('/api/admin/game', { method: 'OPTIONS' });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
  assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /Authorization/);
  const foreignOrigin = await request('/api/game', { requestOrigin: 'https://another.example' });
  assert.equal(foreignOrigin.status, 403);
  assert.equal(foreignOrigin.headers.get('Access-Control-Allow-Origin'), null);
});

test('owner login issues a hashed session, rejects it after logout or expiry, and disables old key access', async t => {
  const { request, sqlite, env } = setup(t);
  const login = body => request('/api/admin/login', { method: 'POST', body });
  const failedPassword = await login({ username: ownerName, password: 'incorrect-password' });
  const failedUsername = await login({ username: 'someone-else', password: ownerPassword });
  assert.deepEqual(failedPassword.body, failedUsername.body);
  assert.equal(failedPassword.status, 401);
  assert.equal(failedUsername.status, 401);

  assert.equal((await request('/api/admin', { token: ownerPassword })).status, 401);
  const first = await login(ownerCredentials);
  assert.equal(first.status, 200);
  const { token } = first.body;
  assert.match(token, /^[0-9a-f]{64}$/);
  const stored = sqlite.prepare('SELECT token_hash FROM admin_sessions').get().token_hash;
  assert.match(stored, /^[0-9a-f]{64}$/);
  assert.notEqual(stored, token);
  assert.equal((await request('/api/admin', { token })).status, 200);

  const logout = await request('/api/admin/logout', { method: 'POST', token });
  assert.deepEqual(logout.body, { ok: true });
  assert.equal((await request('/api/admin', { token })).status, 401);
  const second = (await login(ownerCredentials)).body.token;
  assert.notEqual(second, token);
  sqlite.prepare('UPDATE admin_sessions SET expires_at = ?').run(Math.floor(Date.now() / 1_000) - 1);
  assert.equal((await request('/api/admin', { token: second })).status, 401);

  const third = (await login(ownerCredentials)).body.token;
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM admin_sessions').get().count, 1);
  env.ADMIN_PASSWORD = 'new-test-only-owner-password';
  assert.equal((await request('/api/admin', { token: third })).status, 401);
  delete env.ADMIN_USERNAME;
  assert.equal((await login(ownerCredentials)).status, 503);
});

test('owner login throttles unsuccessful guesses without storing a raw network address', async t => {
  const { request, sqlite } = setup(t);
  const address = '192.0.2.33';
  const login = (body, from = address) => request('/api/admin/login', { method: 'POST', body, address: from });
  const badCredentials = { username: ownerName, password: 'test-incorrect-password' };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    assert.equal((await login(badCredentials)).status, 401);
  }
  assert.equal((await login(ownerCredentials)).status, 429);
  assert.equal((await login(ownerCredentials, '192.0.2.34')).status, 200);
  const records = sqlite.prepare('SELECT attempt_key AS key, attempts FROM admin_signin_attempts').all();
  assert.equal(records.length, 1);
  assert.match(records[0].key, /^[0-9a-f]{64}$/);
  assert.equal(records[0].attempts, 8);
  assert.doesNotMatch(JSON.stringify(records), /192\.0\.2\.33|test-owner|test-incorrect-password/);
  sqlite.prepare('UPDATE admin_signin_attempts SET expires_at = ?').run(Math.floor(Date.now() / 1_000) - 1);
  assert.equal((await login(ownerCredentials)).status, 200);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM admin_signin_attempts').get().count, 0);
});

test('scores accepted corrections, counts skips, locks retries, and stores no raw answers', async t => {
  const { request, sqlite } = setup(t);
  const attemptId = crypto.randomUUID();
  const { body: { revision, questions } } = await request('/api/game');
  const submission = { attemptId, nickname: 'WireWhiz', revision, score: 9000 };
  const firstAnswer = { attemptId, revision, questionId: questions[0].id, input: 'swevre' };
  const answer = body => request('/api/answer', { method: 'POST', body });
  const finish = body => request('/api/scores', { method: 'POST', body });

  assert.equal((await finish(submission)).status, 409);
  assert.deepEqual((await answer(firstAnswer)).body, { status: 'suggestion', suggestion: 'Swerve drive' });
  const accepted = (await answer({ ...firstAnswer, acceptSuggestion: true })).body;
  assert.equal(accepted.status, 'exact');
  assert.equal(accepted.score.points, 75);

  const repeat = (await answer({ ...firstAnswer, input: 'kiwi' })).body;
  assert.deepEqual(repeat, { status: 'exact', score: accepted.score });
  assert.deepEqual((await answer({ ...firstAnswer, input: '', questionId: questions[1].id })).body, { status: 'miss' });

  const saved = await finish(submission);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.score, 75);
  assert.deepEqual((await finish({ ...submission, nickname: 'Changed' })).body, saved.body);
  assert.deepEqual((await request('/api/admin', { admin: true })).body.scores, [saved.body]);

  const report = await request(`/api/stats?revision=${revision}`);
  assert.equal(report.status, 200);
  assert.equal(report.body.count, 1);
  assert.doesNotMatch(JSON.stringify(report.body), /WireWhiz|swevre|Swerve drive/);
  assert.equal((await request('/api/stats')).status, 400);

  const stored = JSON.stringify(sqlite.prepare('SELECT * FROM question_scores').all());
  assert.doesNotMatch(stored, /swevre|Swerve drive/);
});

test('rejecting a suggested correction locks a miss', async t => {
  const { request } = setup(t);
  const attemptId = crypto.randomUUID();
  const { body: { revision, questions } } = await request('/api/game');
  const body = { attemptId, revision, questionId: questions[0].id, input: 'swevre' };
  const answer = payload => request('/api/answer', { method: 'POST', body: payload });

  assert.equal((await answer(body)).body.status, 'suggestion');
  assert.equal((await answer({ ...body, acceptSuggestion: false })).body.status, 'miss');
  assert.equal((await answer({ ...body, input: 'Swerve' })).body.status, 'miss');
});

test('publishing validates questions, rejects obsolete edits, and preserves in-progress rounds', async t => {
  const { request } = setup(t);
  const { body: { game, revision } } = await request('/api/admin', { admin: true });
  const update = body => request('/api/admin/game', { method: 'PUT', admin: true, body });
  const answer = body => request('/api/answer', { method: 'POST', body });
  const attemptId = crypto.randomUUID();
  const [drive, sensing] = game.questions;
  const invalid = await update({ revision, game: { ...game, questions: [] } });
  assert.equal(invalid.status, 400);

  const first = await answer({ attemptId, revision, questionId: drive.id, input: 'Mecanum' });
  assert.equal(first.body.score.points, 10);

  game.tiers[4].label = 'Precision Machined';
  game.tiers[4].points = 150;
  game.questions.pop();
  const published = await update({ game, revision });
  assert.deepEqual(published.body, { revision: revision + 1 });
  const latest = (await request('/api/game')).body;
  assert.equal(latest.tiers[4].label, 'Precision Machined');
  assert.equal(latest.questions.length, 1);
  assert.equal((await update({ game, revision })).status, 409);

  const second = await answer({ attemptId, revision, questionId: sensing.id, input: 'Magnetic sensor' });
  assert.deepEqual(second.body.score, { tierId: '5', label: 'Tier 5', points: 100 });
  const saved = await request('/api/scores', { method: 'POST', body: { attemptId, revision, nickname: 'Pit crew' } });
  assert.equal(saved.body.score, 110);
  const unknownRevision = await answer({ attemptId, revision: revision + 2, questionId: drive.id, input: 'Mecanum' });
  assert.equal(unknownRevision.status, 409);
});

test('supports 160-character answers and aliases and validates longer values', async t => {
  const { request } = setup(t);
  const { body: { game, revision } } = await request('/api/admin', { admin: true });
  const update = game => request('/api/admin/game', { method: 'PUT', admin: true, body: { game, revision } });
  const answer = game.questions[0].answers[0];
  const alias = 'b'.repeat(160);
  answer.text = 'a'.repeat(161);
  assert.equal((await update(game)).status, 400);
  answer.text = 'a'.repeat(160);
  answer.aliases = [alias];

  const published = await update(game);
  assert.equal(published.status, 200);
  const body = { attemptId: crypto.randomUUID(), revision: published.body.revision, questionId: game.questions[0].id };
  assert.equal((await request('/api/answer', { method: 'POST', body: { ...body, input: `${alias}b` } })).status, 400);
  assert.equal((await request('/api/answer', { method: 'POST', body: { ...body, input: alias } })).body.status, 'exact');
});
