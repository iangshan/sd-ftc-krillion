import { matchAnswer, scoreAnswer, validateQuestion, validateTiers } from '../core.mjs';
import { SAMPLE_GAME } from '../sample.mjs';
import { requireAdmin, signIn, signOut } from './admin-auth.mjs';
import { getRoundStats } from './analytics.mjs';
import { ApiError } from './api-error.mjs';

const ATTEMPT_ID = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const ANSWER_LIMIT = 160;

function corsHeaders(request, env) {
  const headers = new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin' });
  const origin = request.headers.get('Origin');
  if (!origin) return headers;

  const origins = (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim());
  if (!origins.includes(origin)) throw new ApiError(403, 'Origin is not allowed.');
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  return headers;
}

async function parseJson(request, limit) {
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'Send a JSON object.');

  let size = 0;
  let text = '';
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ApiError(413, 'This request is too large.');
      }
      text += decoder.decode(value, { stream: true });
    }
    const body = JSON.parse(text + decoder.decode());
    if (!body || Array.isArray(body) || typeof body !== 'object') {
      throw new ApiError(400, 'Send a JSON object.');
    }
    return body;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'Send a valid JSON object.');
  } finally {
    reader.releaseLock();
  }
}

async function readGame(db, revision) {
  const latest = () => db.prepare('SELECT revision, content FROM game_revisions ORDER BY revision DESC LIMIT 1').first();
  let row;
  if (revision === undefined) {
    row = await latest();
    if (!row) {
      await db.prepare('INSERT OR IGNORE INTO game_revisions (revision, content) VALUES (1, ?)')
        .bind(JSON.stringify(SAMPLE_GAME)).run();
      row = await latest();
    }
  } else {
    row = await db.prepare('SELECT revision, content FROM game_revisions WHERE revision = ?')
      .bind(revision).first();
    if (!row) throw new ApiError(409, 'This game revision is unavailable. Reload to play the current questions.');
  }
  return { revision: row.revision, game: JSON.parse(row.content) };
}

function lengthWithin(value, limit) {
  return typeof value === 'string' && value.length <= limit;
}

function validatedGame(game) {
  const tiers = game?.tiers;
  const questions = game?.questions;
  const tierErrors = validateTiers(tiers);
  if (tierErrors.length) throw new ApiError(400, tierErrors[0]);
  if (tiers.some(tier => !lengthWithin(tier.id, 60) || !lengthWithin(tier.label, 48)
    || tier.points > 1_000_000)) {
    throw new ApiError(400, 'Use tier names of up to 48 characters and scores up to 1,000,000.');
  }
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 100) {
    throw new ApiError(400, 'Publish between 1 and 100 questions.');
  }

  const ids = new Set();
  for (const [index, question] of questions.entries()) {
    const position = `Question ${index + 1}`;
    if (!lengthWithin(question?.id, 80) || ids.has(question.id)) {
      throw new ApiError(400, `${position} needs a unique ID of up to 80 characters.`);
    }
    ids.add(question.id);
    if (!lengthWithin(question.prompt, 400)
      || (question.hint !== undefined && !lengthWithin(question.hint, 300))) {
      throw new ApiError(400, `${position} needs a prompt of up to 400 characters and a hint of up to 300.`);
    }
    if (!Array.isArray(question.answers) || question.answers.length > 300) {
      throw new ApiError(400, `${position} can have up to 300 accepted answers.`);
    }
    const errors = validateQuestion(question, tiers);
    if (errors.length) throw new ApiError(400, `${position}. ${errors[0]}`);
    for (const answer of question.answers) {
      const aliases = answer.aliases ?? [];
      if (!lengthWithin(answer.text, ANSWER_LIMIT) || aliases.length > 10
        || aliases.some(alias => !lengthWithin(alias, ANSWER_LIMIT))) {
        throw new ApiError(400, `${position} can have up to 10 aliases per answer and ${ANSWER_LIMIT} characters per answer or alias.`);
      }
    }
  }

  return {
    tiers: tiers.map(({ id, label, points }) => ({ id, label: label.trim(), points })),
    questions: questions.map(({ id, prompt, hint, answers }) => ({
      id,
      prompt: prompt.trim(),
      ...(hint?.trim() && { hint: hint.trim() }),
      answers: answers.map(({ text, aliases = [], tierId }) => ({
        text: text.trim(), aliases: aliases.map(alias => alias.trim()), tierId,
      })),
    })),
  };
}

function requireRevision(revision) {
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new ApiError(400, 'The game revision is required.');
  }
}

function requireAttempt(attemptId, revision) {
  requireRevision(revision);
  if (typeof attemptId !== 'string' || !ATTEMPT_ID.test(attemptId)) {
    throw new ApiError(400, 'The attempt ID is invalid.');
  }
}

function lockedAnswer(db, attemptId, revision, questionId) {
  return db.prepare(`SELECT tier_id AS tierId, tier_label AS label, points FROM question_scores
      WHERE attempt_id = ? AND revision = ? AND question_id = ?`)
    .bind(attemptId, revision, questionId).first();
}

function answerResult(score) {
  return score?.tierId ? { status: 'exact', score } : { status: 'miss' };
}

async function submitAnswer(db, body) {
  const { attemptId, revision, questionId, input, acceptSuggestion } = body;
  requireAttempt(attemptId, revision);
  if (!lengthWithin(questionId, 80) || !lengthWithin(input, ANSWER_LIMIT)
    || (acceptSuggestion !== undefined && typeof acceptSuggestion !== 'boolean')) {
    throw new ApiError(400, `Enter an answer of up to ${ANSWER_LIMIT} characters.`);
  }

  const { game } = await readGame(db, revision);
  const question = game.questions.find(question => question.id === questionId);
  if (!question) throw new ApiError(404, 'Question not found.');

  const prior = await lockedAnswer(db, attemptId, revision, questionId);
  if (prior) return answerResult(prior);

  const match = matchAnswer(question, input);
  if (match.status === 'suggestion' && acceptSuggestion === undefined) {
    return { status: 'suggestion', suggestion: match.answer.text };
  }

  const accepted = match.status === 'exact' || acceptSuggestion === true;
  const score = accepted ? scoreAnswer(match.answer, game.tiers) : null;
  const write = await db.prepare(`INSERT INTO question_scores
      (attempt_id, revision, question_id, tier_id, tier_label, points)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (attempt_id, revision, question_id) DO NOTHING`)
    .bind(attemptId, revision, questionId, score?.tierId ?? null, score?.label ?? null,
      score?.points ?? 0).run();
  if (!write.meta.changes) {
    const existing = await lockedAnswer(db, attemptId, revision, questionId);
    return answerResult(existing);
  }

  return score ? { status: 'exact', score, answer: match.answer.text } : { status: 'miss' };
}

function submittedScore(db, attemptId, revision) {
  return db.prepare(`SELECT nickname, score, date, revision FROM scores
      WHERE attempt_id = ? AND revision = ?`).bind(attemptId, revision).first();
}

async function submitScore(db, body) {
  const { attemptId, revision } = body;
  requireAttempt(attemptId, revision);
  const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
  if (!nickname || nickname.length > 36 || /\p{Cc}/u.test(nickname)) {
    throw new ApiError(400, 'Enter a nickname of up to 36 characters.');
  }

  const existing = await submittedScore(db, attemptId, revision);
  if (existing) return existing;

  const { game } = await readGame(db, revision);
  await db.prepare(`INSERT INTO scores (attempt_id, revision, nickname, score, date)
      SELECT ?, ?, ?, COALESCE(SUM(points), 0), ? FROM question_scores
      WHERE attempt_id = ? AND revision = ?
      HAVING COUNT(*) = ?
      ON CONFLICT (attempt_id, revision) DO NOTHING`)
    .bind(attemptId, revision, nickname, new Date().toISOString(), attemptId, revision,
      game.questions.length).run();

  const saved = await submittedScore(db, attemptId, revision);
  if (saved) return saved;
  throw new ApiError(409, 'Answer or skip every question before saving your score.');
}

async function saveGame(db, body) {
  const { revision } = body;
  requireRevision(revision);
  const game = validatedGame(body.game);
  await readGame(db);
  const write = await db.prepare(`INSERT INTO game_revisions (revision, content)
      SELECT revision + 1, ? FROM game_revisions
      WHERE revision = ? AND revision = (SELECT MAX(revision) FROM game_revisions)`)
    .bind(JSON.stringify(game), revision).run();
  if (!write.meta.changes) {
    throw new ApiError(409, 'The game was updated elsewhere. Reload before saving again.');
  }
  return { revision: revision + 1 };
}

export default {
  async fetch(request, env) {
    let headers = new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin' });

    try {
      headers = corsHeaders(request, env);
      const method = request.method;
      if (method === 'OPTIONS') return new Response(null, { status: 204, headers });

      const url = new URL(request.url);
      const { pathname: path } = url;
      const db = env.DB;
      let payload;

      if (path === '/api/game' && method === 'GET') {
        const { revision, game } = await readGame(db);
        const { tiers, questions } = game;
        payload = { revision, tiers, questions: questions.map(({ id, prompt, hint }) => ({ id, prompt, hint })) };
      } else if (path === '/api/answer' && method === 'POST') {
        payload = await submitAnswer(db, await parseJson(request, 2_048));
      } else if (path === '/api/scores' && method === 'POST') {
        payload = await submitScore(db, await parseJson(request, 2_048));
      } else if (path === '/api/stats' && method === 'GET') {
        const requestedRevision = url.searchParams.get('revision');
        const revision = /^\d+$/.test(requestedRevision ?? '') ? Number(requestedRevision) : NaN;
        requireRevision(revision);
        const { game } = await readGame(db, revision);
        payload = await getRoundStats(db, revision, game);
      } else if (path === '/api/admin/login' && method === 'POST') {
        payload = await signIn(request, env, await parseJson(request, 4_096));
      } else if (path === '/api/admin/logout' && method === 'POST') {
        payload = await signOut(request, env);
      } else if (path === '/api/admin' && method === 'GET') {
        await requireAdmin(request, env);
        const { results: scores } = await db.prepare(`SELECT nickname, score, date, revision FROM scores
            ORDER BY date DESC, rowid DESC`).all();
        payload = { ...await readGame(db), scores };
      } else if (path === '/api/admin/game' && method === 'PUT') {
        await requireAdmin(request, env);
        payload = await saveGame(db, await parseJson(request, 524_288));
      } else {
        throw new ApiError(404, 'Endpoint not found.');
      }

      return Response.json(payload, { headers });
    } catch (error) {
      if (error instanceof ApiError) {
        return Response.json({ error: error.message }, { status: error.status, headers });
      }
      return Response.json({ error: 'The game service could not complete this request.' }, { status: 500, headers });
    }
  },
};
