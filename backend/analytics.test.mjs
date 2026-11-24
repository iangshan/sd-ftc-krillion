import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { exportLocalGame, loadAdmin, loadRoundStats, saveScore } from '../store.mjs';
import { getRoundStats } from './analytics.mjs';

const game = {
  questions: [{ id: 'z-drive' }, { id: 'a-sensing' }],
  tiers: [{ points: 10 }, { points: 100 }],
};

function setup(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));

  const db = {
    prepare(query) {
      return {
        bind(...values) {
          return { all: async () => ({ results: sqlite.prepare(query).all(...values) }) };
        },
      };
    },
  };

  function addRound(id, points, { revision = 1, completed = true } = {}) {
    const addQuestion = sqlite.prepare(`INSERT INTO question_scores
      (attempt_id, revision, question_id, points) VALUES (?, ?, ?, ?)`);
    points.forEach((value, index) => addQuestion.run(id, revision, game.questions[index].id, value));
    if (!completed) return;

    const score = points.reduce((sum, value) => sum + value, 0);
    const nickname = `private-${id}`;
    sqlite.prepare(`INSERT INTO scores (attempt_id, revision, nickname, score, date)
      VALUES (?, ?, ?, ?, ?)`).run(id, revision, nickname, score, '2026-11-23T00:00:00.000Z');
  }

  return { db, addRound };
}

test('computes aggregate-only buckets for completed attempts in the same revision', async t => {
  const { db, addRound } = setup(t);
  addRound('low', [0, 0]);
  addRound('medium', [100, 25]);
  addRound('max', [100, 100]);
  addRound('unfinished', [50], { completed: false });
  addRound('older', [100, 0], { revision: 2 });

  const result = await getRoundStats(db, 1, game);

  assert.equal(result.count, 3);
  assert.equal(result.averageTotal, 325 / 3);
  assert.deepEqual(result.averagePerQuestion, [200 / 3, 125 / 3]);
  assert.deepEqual(result.distribution.filter(bin => bin.count), [
    { min: 0, max: 19, count: 1 },
    { min: 120, max: 139, count: 1 },
    { min: 180, max: 200, count: 1 },
  ]);
  assert.equal(result.distribution.length, 10);
  assert.doesNotMatch(JSON.stringify(result), /private|attempt|z-drive|a-sensing/);
});

test('withholds live statistics for a small cohort without dropping the round count', async t => {
  const { db, addRound } = setup(t);
  for (let count = 0; count < 3; count += 1) {
    if (count) addRound(`attempt-${count}`, [100, 0]);
    assert.deepEqual(await getRoundStats(db, 1, game), {
      count,
      averageTotal: null,
      averagePerQuestion: [null, null],
      distribution: [],
    });
  }
});

test('practice uses older totals and records prompt averages for new browser-local scores', async t => {
  const storage = new Map([
    ['sdftc:scores:1', JSON.stringify([{ attemptId: 'old', revision: 7, score: 15 }])],
    ['sdftc:game:1', JSON.stringify({ revision: 7, game })],
  ]);
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  });
  t.after(() => {
    if (prior) Object.defineProperty(globalThis, 'localStorage', prior);
    else delete globalThis.localStorage;
  });

  const round = {
    ...game,
    revision: 7,
    attemptId: 'new',
    total: 100,
    results: [{ score: { points: 100 } }, { status: 'miss' }],
  };
  const oldStats = await loadRoundStats(round);
  assert.deepEqual(oldStats.averagePerQuestion, [null, null]);

  await saveScore(round, 'Guest');
  await saveScore(round, 'Guest retry');
  const stats = await loadRoundStats(round);
  assert.equal(stats.count, 2);
  assert.equal(stats.averageTotal, 57.5);
  assert.deepEqual(stats.averagePerQuestion, [100, 0]);
  assert.deepEqual(exportLocalGame(), game);
  await assert.rejects(loadAdmin('token'), /available on the shared game/);
});
