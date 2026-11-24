import { API_ORIGIN } from './config.mjs';
import { matchAnswer, scoreAnswer } from './core.mjs';
import { scoreScale, unavailableRoundStats } from './round-stats.mjs';
import { SAMPLE_GAME } from './sample.mjs';

const gameKey = 'sdftc:game:1';
const scoresKey = 'sdftc:scores:1';
export const isShared = Boolean(API_ORIGIN);

function read(key, fallback) {
  const value = localStorage.getItem(key);
  return value === null ? structuredClone(fallback) : JSON.parse(value);
}

function readGame() {
  return read(gameKey, { game: SAMPLE_GAME, revision: 1 });
}

async function api(path, { method = 'GET', body, token } = {}) {
  if (!isShared) throw new Error('Admin sign-in is available on the shared game.');
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(new URL(path, API_ORIGIN), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    credentials: 'omit',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function loadGame() {
  if (isShared) return api('/api/game');
  const { game, revision } = readGame();
  return { ...game, revision };
}

export async function submitAnswer(round, question, input, acceptSuggestion) {
  if (isShared) {
    return api('/api/answer', {
      method: 'POST',
      body: { attemptId: round.attemptId, questionId: question.id, input, revision: round.revision, acceptSuggestion },
    });
  }
  const match = matchAnswer(question, input);
  if (match.status === 'suggestion' && acceptSuggestion === undefined) {
    return { status: 'suggestion', suggestion: match.answer.text };
  }
  if (match.status === 'exact' || (match.status === 'suggestion' && acceptSuggestion)) {
    return { status: 'exact', score: scoreAnswer(match.answer, round.tiers), answer: match.answer.text };
  }
  return { status: 'miss' };
}

export async function saveScore(round, nickname) {
  if (isShared) {
    return api('/api/scores', {
      method: 'POST',
      body: { attemptId: round.attemptId, nickname, revision: round.revision },
    });
  }
  const scores = read(scoresKey, []);
  const existing = scores.find(score => score.attemptId === round.attemptId);
  if (existing) return existing;
  const entry = {
    attemptId: round.attemptId,
    nickname,
    score: round.total,
    date: new Date().toISOString(),
    revision: round.revision,
    questionPoints: round.results.map(result => result.score?.points ?? 0),
  };
  localStorage.setItem(scoresKey, JSON.stringify([entry, ...scores]));
  return entry;
}

export async function loadRoundStats(round) {
  if (isShared) return api(`/api/stats?revision=${encodeURIComponent(round.revision)}`);

  const scores = read(scoresKey, []).filter(entry => entry.revision === round.revision);
  if (!scores.length) return unavailableRoundStats(0, round.questions.length);

  const { width, bins } = scoreScale(round);
  const questions = round.questions.map(() => ({ total: 0, count: 0 }));
  let total = 0;
  for (const entry of scores) {
    total += entry.score;
    const bucket = Math.min(Math.floor(entry.score / width), bins.length - 1);
    bins[bucket].count += 1;
    for (const [index, question] of questions.entries()) {
      const points = entry.questionPoints?.[index];
      if (!Number.isFinite(points)) continue;
      question.total += points;
      question.count += 1;
    }
  }

  return {
    count: scores.length,
    averageTotal: total / scores.length,
    averagePerQuestion: questions.map(question => question.count ? question.total / question.count : null),
    distribution: bins,
  };
}

export async function signIn(username, password) {
  return api('/api/admin/login', { method: 'POST', body: { username, password } });
}

export async function signOut(token) {
  return api('/api/admin/logout', { method: 'POST', token });
}

export async function loadAdmin(token) {
  return api('/api/admin', { token });
}

export async function saveGame(game, revision, token) {
  return api('/api/admin/game', { method: 'PUT', token, body: { game, revision } });
}

export function exportLocalGame() {
  return read(gameKey, null)?.game ?? null;
}
