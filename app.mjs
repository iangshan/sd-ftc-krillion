import { renderResults } from './results.mjs';
import { mountArena } from './scene.mjs';
import { loadGame, loadRoundStats, saveScore, submitAnswer } from './store.mjs';
import { escapeHtml as h, setNotice } from './ui.mjs';

const app = document.querySelector('#app');
let activeGame;
let round;
let routeVersion = 0;
let stage;
let scene;
let unmountAdmin;
let openEditor;

function beginRound() {
  const attemptId = crypto.randomUUID();
  round = {
    ...activeGame,
    attemptId,
    index: 0,
    total: 0,
    results: [],
    input: '',
    suggestion: '',
    feedback: null,
    busy: false,
  };
  showQuestion(true, 'start');
}

function mountStage(content, { mode, event, level }) {
  if (!stage) {
    app.innerHTML = `<section class="stage"><div class="photo-backdrop" aria-hidden="true"></div><canvas class="arena" aria-hidden="true"></canvas><div class="stage-content"></div></section>`;
    stage = app.querySelector('.stage');
  }
  stage.className = `stage ${mode === 'home' ? 'hero' : mode}-stage`;
  stage.dataset.mode = mode;
  stage.querySelector('.stage-content').innerHTML = content;
  scene ??= mountArena(stage.querySelector('.arena'));
  scene.setState?.({ mode, event, level });
}

function releaseStage() {
  scene?.();
  scene = undefined;
  stage = undefined;
}

function hero() {
  const count = activeGame.questions.length;
  const label = location.protocol === 'file:' ? 'Practice round' : 'Round';
  mountStage(`<div class="hero">
    <div class="hero-title-group"><h1 class="display-title"><span>San Diego FTC</span><strong>Krillion</strong></h1></div>
    <div class="hero-console">
      <div class="stage-actions"><button type="button" class="button primary" id="start-round" ${count ? '' : 'disabled'}>Start round</button></div>
      <p class="round-meta">${count ? `${label} · ${count} ${count === 1 ? 'prompt' : 'prompts'}` : 'No questions published'}</p>
    </div>
  </div>`, { mode: 'home' });
  app.querySelector('#start-round').addEventListener('click', beginRound);
}

function showQuestion(focus = false, event) {
  const question = round.questions[round.index];
  const feedback = round.feedback;
  const progress = round.questions.map((_, index) => {
    const status = index === round.index ? 'current' : index < round.index ? 'done' : '';
    return `<span class="progress-segment ${status}"></span>`;
  }).join('');
  const result = feedback?.score;
  const index = result ? round.tiers.findIndex(tier => tier.id === result.tierId) + 1 : 0;
  const controls = feedback ? `<div class="result-block${result ? '' : ' result-miss'}" data-level="${index}" role="status">
    <div><strong>${result ? h(result.label) : round.input.trim() ? 'No match' : 'Passed'}</strong>
    ${feedback.answer ? `<span>${h(feedback.answer)}</span>` : ''}</div>
    <strong>+${h(result?.points ?? 0)}</strong>
  </div><div class="stage-actions"><button class="button primary" type="button" id="next-prompt">${round.index + 1 === round.questions.length ? 'See results' : 'Next prompt'}</button></div>` : `
  <form class="answer-form" id="answer-form" ${round.suggestion ? 'hidden' : ''}>
    <label class="sr-only" for="answer-input">Your answer</label>
    <input class="answer-input" id="answer-input" name="answer" placeholder="Type your answer" value="${h(round.input)}" maxlength="160" autocomplete="off" autocapitalize="off" spellcheck="false" required>
    <button class="button primary" type="submit">Submit</button>
    <button class="button quiet" id="pass-prompt" type="button">Pass</button>
  </form>
  ${round.suggestion ? `<div class="suggestion-row"><p>Did you mean <strong>${h(round.suggestion)}</strong>?</p><button type="button" class="button primary" id="accept-suggestion">Use correction</button><button type="button" class="button secondary" id="reject-suggestion">Keep my answer</button></div>` : ''}`;
  mountStage(`<div class="round">
    <div class="round-head"><span class="kicker">PROMPT ${round.index + 1} / ${round.questions.length}</span><span class="score-readout">SCORE <strong>${round.total}</strong></span></div>
    <div class="progress" aria-hidden="true">${progress}</div>
    <div class="prompt-panel${event === 'start' || event === 'prompt' ? ' prompt-enter' : ''}">
      <h1 class="prompt">${h(question.prompt)}</h1>
      ${question.hint ? `<p class="prompt-hint">${h(question.hint)}</p>` : ''}
      ${controls}
      <p class="notice answer-feedback" id="answer-feedback" role="status"></p>
    </div>
  </div>`, { mode: 'round', event, level: index });
  const form = app.querySelector('#answer-form');
  form?.addEventListener('submit', event => {
    event.preventDefault();
    const input = form.elements.answer.value.trim();
    if (input) resolveAnswer(input);
    else form.elements.answer.focus();
  });
  app.querySelector('#pass-prompt')?.addEventListener('click', () => resolveAnswer(''));
  app.querySelector('#accept-suggestion')?.addEventListener('click', () => resolveAnswer(round.input, true));
  app.querySelector('#reject-suggestion')?.addEventListener('click', () => resolveAnswer(round.input, false));
  app.querySelector('#next-prompt')?.addEventListener('click', () => {
    round.index += 1;
    round.input = '';
    round.suggestion = '';
    round.feedback = null;
    if (round.index === round.questions.length) {
      finish(true, 'finish');
      recordScore(round);
    } else showQuestion(true, 'prompt');
  });
  if (focus) app.querySelector('#next-prompt, #accept-suggestion, form:not([hidden]) #answer-input')?.focus({ preventScroll: true });
}

async function resolveAnswer(input, confirm) {
  const current = round;
  if (current.busy || current.feedback) return;
  current.busy = true;
  current.input = input;
  const notice = app.querySelector('#answer-feedback');
  const buttons = [...app.querySelectorAll('.round button')];
  for (const button of buttons) button.disabled = true;
  setNotice(notice);
  try {
    const response = await submitAnswer(current, current.questions[current.index], input, confirm);
    if (round !== current) return;
    if (response.status === 'suggestion') current.suggestion = response.suggestion;
    else {
      const accepted = response.answer ?? (confirm && response.score ? current.suggestion : undefined);
      current.suggestion = '';
      current.feedback = { ...response, answer: accepted };
      current.results.push({ ...current.feedback, input });
      current.total += response.score?.points ?? 0;
    }
    showQuestion(true, response.status === 'suggestion' ? undefined : response.score ? 'hit' : 'miss');
  } catch (error) {
    if (notice.isConnected) setNotice(notice, error.message, true);
  } finally {
    current.busy = false;
    for (const button of buttons) button.disabled = false;
  }
}

function finish(focus = false, event) {
  const current = round;
  mountStage(`<div class="finish">
    <div id="results-content">${resultsMarkup(current)}</div>
    <div class="stage-actions"><button class="button primary" id="play-again" type="button">Play again</button></div>
  </div>`, { mode: 'finish', event });
  bindResultsActions(current);
  app.querySelector('#play-again').addEventListener('click', () => { round = null; window.scrollTo(0, 0); showRoute(); });
  if (focus) {
    window.scrollTo(0, 0);
    app.querySelector('#results-content h1')?.setAttribute('tabindex', '-1');
    app.querySelector('#results-content h1')?.focus({ preventScroll: true });
  }
}

function resultsMarkup(current) {
  return `${renderResults({ round: current, stats: current.stats, statsStatus: current.statsStatus ?? 'loading' })}
    <div class="results-status">
      <p class="notice ${current.saveError ? 'error' : ''}" id="score-status" role="status">${current.saved ? '' : current.saveError ? h(current.saveError) : 'Saving your score…'}</p>
      ${current.saveError ? '<button class="button secondary" id="retry-score" type="button">Retry saving</button>' : ''}
      ${current.statsStatus === 'error' ? '<button class="button secondary" id="retry-stats" type="button">Reload score comparison</button>' : ''}
    </div>`;
}

function bindResultsActions(current) {
  app.querySelector('#retry-score')?.addEventListener('click', () => recordScore(current));
  app.querySelector('#retry-stats')?.addEventListener('click', () => refreshRoundStats(current));
}

function updateResults(current) {
  const target = app.querySelector('#results-content');
  if (round !== current || !target) return;
  const focusedId = target.contains(document.activeElement) ? document.activeElement.id : null;
  const hadHeadingFocus = document.activeElement === target.querySelector('h1');
  target.innerHTML = resultsMarkup(current);
  bindResultsActions(current);
  if (hadHeadingFocus) {
    const heading = target.querySelector('h1');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus({ preventScroll: true });
  } else if (focusedId) (document.getElementById(focusedId) ?? app.querySelector('#play-again'))?.focus({ preventScroll: true });
}

async function refreshRoundStats(current) {
  const request = (current.statsRequest ?? 0) + 1;
  current.statsRequest = request;
  current.statsStatus = 'loading';
  updateResults(current);
  try {
    const stats = await loadRoundStats(current);
    if (current.statsRequest !== request) return;
    current.stats = stats;
    current.statsStatus = 'ready';
  } catch {
    if (current.statsRequest !== request) return;
    current.statsStatus = 'error';
  }
  updateResults(current);
}

async function recordScore(current) {
  if (current.recording || current.saved) return;
  current.recording = true;
  current.saveError = '';
  const retry = app.querySelector('#retry-score');
  if (retry) retry.disabled = true;
  setNotice(app.querySelector('#score-status'), 'Saving your score…');
  try {
    const saved = await saveScore(current);
    current.total = saved.score;
    current.saved = true;
  } catch (error) {
    current.saveError = error.message || 'Could not save the score.';
  } finally {
    current.recording = false;
    if (round === current) refreshRoundStats(current);
  }
}

async function showRoute() {
  const version = ++routeVersion;
  unmountAdmin?.();
  unmountAdmin = null;
  const isAdmin = Boolean(openEditor && location.hash === '#admin');
  document.body.classList.toggle('play-view', !isAdmin);
  if (isAdmin) {
    releaseStage();
    round = null;
    unmountAdmin = openEditor(app);
    return;
  }
  if (round && round.index === round.questions.length) return finish();
  if (round) return showQuestion();
  try {
    const game = await loadGame();
    if (version !== routeVersion) return;
    activeGame = game;
    hero();
  } catch (error) {
    if (version !== routeVersion) return;
    releaseStage();
    app.innerHTML = '<section class="admin"><h1>Game unavailable</h1><p class="notice error" role="alert"></p><button class="button secondary" type="button">Try again</button></section>';
    setNotice(app.querySelector('.notice'), error.message, true);
    app.querySelector('button').addEventListener('click', showRoute);
  }
}

export function startGame(editor) {
  openEditor = editor;
  window.addEventListener('hashchange', showRoute);
  showRoute();
}
