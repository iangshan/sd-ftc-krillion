import { matchAnswer, scoreAnswer, validateQuestion, validateTiers } from './core.mjs';
import { scoreScale, unavailableRoundStats } from './round-stats.mjs';
import { SAMPLE_GAME } from './sample.mjs';

const gameKey = 'sdftc:game:1';
const scoresKey = 'sdftc:scores:1';

function read(key, fallback) {
  const value = localStorage.getItem(key);
  return value === null ? structuredClone(fallback) : JSON.parse(value);
}

function sampleSnapshot() {
  return { game: structuredClone(SAMPLE_GAME), revision: 1 };
}

function readLocalDraft() {
  return read(gameKey, null);
}

function snapshotError(snapshot) {
  const { game, revision } = snapshot ?? {};
  if (!Number.isSafeInteger(revision) || revision < 1) return 'Use a positive whole-number revision.';

  const tierErrors = validateTiers(game?.tiers);
  if (tierErrors.length) return tierErrors[0];
  if (!Array.isArray(game.questions) || !game.questions.length) return 'Add at least one question.';
  if (!Number.isSafeInteger(game.tiers.at(-1).points * game.questions.length)) return 'Reduce the maximum possible score.';

  const ids = new Set();
  for (const [index, question] of game.questions.entries()) {
    const errors = validateQuestion(question, game.tiers);
    if (errors.length) return `Question ${index + 1}. ${errors[0]}`;
    if (ids.has(question.id)) return `Question ${index + 1} needs a unique ID.`;
    ids.add(question.id);
  }
}

function publishedGameUrl() {
  if (typeof document === 'undefined') return null;
  const url = new URL('./game.json', document.baseURI);
  return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
}

async function readPublishedGame(url) {
  let response;
  try {
    response = await fetch(url, { cache: 'no-cache', credentials: 'omit' });
  } catch {
    return null;
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`The published game.json could not be loaded (${response.status}).`);

  let snapshot;
  try {
    snapshot = await response.json();
  } catch {
    throw new Error('The published game.json is not valid JSON. Export the round again from the private editor.');
  }
  const error = snapshotError(snapshot);
  if (error) throw new Error(`The published game.json is invalid. ${error}`);
  return snapshot;
}

export async function loadGame() {
  const url = publishedGameUrl();
  const snapshot = url ? await readPublishedGame(url) : readLocalDraft();
  const { game, revision } = snapshot ?? sampleSnapshot();
  return { ...game, revision };
}

export async function submitAnswer(round, question, input, acceptSuggestion) {
  const match = matchAnswer(question, input);
  if (match.status === 'suggestion' && acceptSuggestion === undefined) {
    return { status: 'suggestion', suggestion: match.answer.text };
  }
  if (match.status === 'exact' || (match.status === 'suggestion' && acceptSuggestion)) {
    return { status: 'exact', score: scoreAnswer(match.answer, round.tiers), answer: match.answer.text };
  }
  return { status: 'miss' };
}

export async function saveScore(round) {
  const scores = read(scoresKey, []);
  const existing = scores.find(score => score.attemptId === round.attemptId);
  if (existing) return existing;
  const entry = {
    attemptId: round.attemptId,
    nickname: 'Guest',
    score: round.total,
    date: new Date().toISOString(),
    revision: round.revision,
    questionPoints: round.results.map(result => result.score?.points ?? 0),
  };
  localStorage.setItem(scoresKey, JSON.stringify([entry, ...scores]));
  return entry;
}

export async function loadRoundStats(round) {
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

export async function loadEditorData() {
  let snapshot = readLocalDraft();
  if (!snapshot) {
    const url = publishedGameUrl();
    snapshot = url ? await readPublishedGame(url) : null;
  }
  return { ...(snapshot ?? sampleSnapshot()), scores: read(scoresKey, []) };
}

export async function saveLocalGame(game, revision, minimumRevision) {
  let activeRevision = readLocalDraft()?.revision;
  if (activeRevision === undefined) {
    const url = publishedGameUrl();
    const published = url ? await readPublishedGame(url) : null;
    activeRevision = readLocalDraft()?.revision ?? published?.revision ?? 1;
  }
  if (activeRevision !== revision) throw new Error('Another tab changed this game. Reload before saving.');
  if (minimumRevision !== undefined && !Number.isSafeInteger(minimumRevision)) {
    throw new Error('Use a whole-number revision.');
  }

  const snapshot = { game, revision: Math.max(revision + 1, minimumRevision ?? 0) };
  const error = snapshotError(snapshot);
  if (error) throw new Error(error);
  localStorage.setItem(gameKey, JSON.stringify(snapshot));
  return { revision: snapshot.revision };
}

