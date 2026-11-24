import { validateQuestion, validateTiers } from './core.mjs';
import { exportLocalGame, isShared, loadAdmin, saveGame, signIn, signOut } from './store.mjs';
import { escapeHtml as h, setNotice } from './ui.mjs';

const formatDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const newAnswer = tierId => ({ text: '', aliases: [], tierId });

function downloadQuestions(game) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(game, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'sdftc-questions.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function setupAdmin(root) {
  let alive = true;
  let token = '';
  let game;
  let revision;
  let scores = [];
  let tab = 'questions';
  let selectedId;
  let dirty = false;
  let busy = false;

  function renderGate(message = '', error = false) {
    root.innerHTML = `<section class="admin admin-auth"><header class="admin-head"><h1>Admin sign-in</h1><a class="button quiet" href="#play">Back to game</a></header>
      <section class="admin-section"><form class="stack" id="admin-login">
        <label class="field">Username<input name="username" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="128" required></label>
        <label class="field">Password<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label>
        <div><button class="button primary" type="submit">Sign in</button></div>
        <p class="notice" id="admin-notice" role="status"></p>
      </form></section></section>`;
    const form = root.querySelector('#admin-login');
    const notice = root.querySelector('#admin-notice');
    setNotice(notice, message, error);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const username = form.elements.username.value;
      const password = form.elements.password.value;
      if (!username || !password) return;
      form.querySelector('button').disabled = true;
      setNotice(notice, 'Checking access…');
      let session;
      try {
        ({ token: session } = await signIn(username, password));
        if (!alive) { void signOut(session).catch(() => {}); return; }
        const data = await loadAdmin(session);
        if (!alive) { void signOut(session).catch(() => {}); return; }
        token = session;
        if (!dirty || revision !== data.revision) applyData(data);
        else scores = data.scores;
        render();
      } catch (error) {
        if (session) void signOut(session).catch(() => {});
        if (alive) setNotice(notice, error.message, true);
      } finally {
        form.elements.password.value = '';
        form.querySelector('button').disabled = false;
      }
    });
  }

  function applyData(data) {
    game = structuredClone(data.game);
    revision = data.revision;
    scores = data.scores;
    selectedId = game.questions[0]?.id;
    dirty = false;
  }

  function render(message = '', error = false) {
    if (!alive) return;
    const tabs = [['questions', 'Questions'], ['tiers', 'Rarity tiers'], ['scores', 'Scores']];
    root.innerHTML = `<section class="admin">
      <header class="admin-head"><div><h1>Admin</h1><p class="muted">Manage questions, rarity tiers, and completed scores.</p></div>
        <div class="admin-head-actions"><a class="button quiet" href="#play">Back to game</a><button class="button quiet" type="button" data-action="lock">Sign out</button></div>
      </header>
      <div class="admin-tabs" aria-label="Admin sections">${tabs.map(([id, label]) => `<button type="button" class="button" data-tab="${id}" aria-pressed="${tab === id}">${label}</button>`).join('')}</div>
      <section class="admin-section">${tab === 'questions' ? questionPanel() : tab === 'tiers' ? tiersPanel() : scoresPanel()}</section>
      ${tab !== 'scores' ? `<div class="admin-toolbar publish-toolbar"><button class="button primary" type="button" data-action="save" ${dirty && !busy ? '' : 'disabled'}>Publish changes</button><span id="change-state" class="muted">${dirty ? 'Unsaved changes' : ''}</span>
        <button class="button quiet" type="button" data-action="export">Export questions</button><button class="button quiet" type="button" data-action="import">Import questions</button><input id="game-file" type="file" accept=".json,application/json" hidden></div>` : ''}
      <p class="notice" id="admin-notice" role="status"></p>
    </section>`;
    setNotice(root.querySelector('#admin-notice'), message, error);
  }

  function questionPanel() {
    const selected = game.questions.find(question => question.id === selectedId);
    return `<div class="admin-toolbar"><h2>Questions</h2><button class="button secondary" type="button" data-action="add-question">Add question</button></div>
      <div class="question-workspace"><div class="question-list" aria-label="Questions">${game.questions.map((question, index) => `
        <button class="question-item" type="button" data-question="${h(question.id)}" aria-pressed="${question.id === selectedId}" title="${h(question.prompt)}"><span>${String(index + 1).padStart(2, '0')}</span><strong>${h(question.prompt || 'Untitled question')}</strong></button>`).join('')}</div>
      ${selected ? `<div class="stack question-editor">
        <label class="field">Prompt<textarea data-field="prompt" rows="3" maxlength="300">${h(selected.prompt)}</textarea></label>
        <label class="field">Hint <span class="muted">Optional</span><input data-field="hint" value="${h(selected.hint || '')}" maxlength="160"></label>
        <div class="admin-toolbar answer-toolbar"><h3>Accepted answers</h3><button class="button secondary" type="button" data-action="add-answer">Add answer</button></div>
        <div class="stack answer-list">${selected.answers.map((answer, index) => answerRow(answer, index)).join('')}</div>
        <div><button class="button quiet danger" type="button" data-action="remove-question">Remove question</button></div>
      </div>` : '<p class="muted">Add a question to start building your round.</p>'}</div>`;
  }

  function answerRow(answer, index) {
    return `<div class="answer-row" data-answer="${index}">
      <label class="field">Answer ${index + 1}<input data-field="text" value="${h(answer.text)}" maxlength="160" placeholder="Team name or answer"></label>
      <label class="field">Aliases <span class="muted">One per line</span><textarea data-field="aliases" rows="2" maxlength="2000" placeholder="Alternate names or team numbers">${h(answer.aliases.join('\n'))}</textarea></label>
      <label class="field">Rarity<select data-field="tierId">${game.tiers.map(tier => `<option value="${h(tier.id)}" ${tier.id === answer.tierId ? 'selected' : ''}>${h(tier.label)}</option>`).join('')}</select></label>
      <button class="button quiet danger" type="button" data-action="remove-answer" aria-label="Remove answer ${index + 1}">Remove</button>
    </div>`;
  }

  function tiersPanel() {
    return `<div class="stack"><h2>Rarity tiers</h2><p class="muted">Give the five tiers names and assign points from lowest to highest.</p>
      ${game.tiers.map((tier, index) => `<div class="form-row tier-editor-row" data-tier="${index}">
        <span class="tier-token" data-level="${index + 1}">Tier ${index + 1}</span>
        <label class="field">Name<input data-field="label" value="${h(tier.label)}" maxlength="40"></label>
        <label class="field">Points<input data-field="points" type="number" value="${h(tier.points)}" min="1" step="1"></label>
      </div>`).join('')}</div>`;
  }

  function scoresPanel() {
    const entries = [...scores].sort((first, second) => second.score - first.score || String(second.date).localeCompare(String(first.date)));
    return `<div class="admin-toolbar"><h2>Scores</h2><button class="button secondary" type="button" data-action="refresh-scores">Refresh</button></div>
      ${entries.length ? `<div class="table-scroll"><table class="score-table"><thead><tr><th scope="col">Player</th><th scope="col">Points</th><th scope="col">Played</th><th scope="col">Round</th></tr></thead><tbody>
        ${entries.map(entry => `<tr><td>${h(entry.nickname)}</td><td>${h(entry.score)}</td><td>${h(formatDate.format(new Date(entry.date)))}</td><td>${h(entry.revision)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">No scores yet. Players appear here after they finish a round and save their score.</p>'}`;
  }

  function changed() {
    dirty = true;
    root.querySelector('[data-action="save"]').disabled = busy;
    root.querySelector('#change-state').textContent = 'Unsaved changes';
    setNotice(root.querySelector('#admin-notice'));
  }

  function onInput(event) {
    const input = event.target;
    const field = input.dataset.field;
    if (!field || !game) return;
    const tier = input.closest('[data-tier]');
    const question = game.questions.find(item => item.id === selectedId);
    if (tier) {
      game.tiers[Number(tier.dataset.tier)][field] = field === 'points' ? input.valueAsNumber : input.value;
    } else if (question) {
      const row = input.closest('[data-answer]');
      if (row) {
        const answer = question.answers[Number(row.dataset.answer)];
        answer[field] = field === 'aliases' ? input.value.split('\n') : input.value;
      } else {
        question[field] = input.value;
        if (field === 'prompt') {
          const item = root.querySelector('.question-item[aria-pressed="true"]');
          item.title = input.value;
          item.querySelector('strong').textContent = input.value || 'Untitled question';
        }
      }
    }
    changed();
  }

  function gameErrors(candidate) {
    const errors = validateTiers(candidate?.tiers);
    if (!Array.isArray(candidate?.questions) || !candidate.questions.length) return [...errors, 'Add at least one question.'];
    const ids = new Set();
    candidate.questions.forEach((question, index) => {
      if (typeof question?.id !== 'string' || !question.id || ids.has(question.id)) errors.push(`Question ${index + 1} needs a unique ID.`);
      else ids.add(question.id);
      for (const error of validateQuestion(question, candidate.tiers)) errors.push(`Question ${index + 1}. ${error}`);
    });
    return errors;
  }

  async function importQuestions(event) {
    if (event.target.id !== 'game-file') return;
    const file = event.target.files[0];
    if (!file) return;
    const notice = root.querySelector('#admin-notice');
    if (dirty && !window.confirm('Replace your unsaved changes with the imported questions?')) {
      event.target.value = '';
      return;
    }
    try {
      if (file.size > 524_288) throw new Error('Use a question file smaller than 512 KB.');
      const candidate = JSON.parse(await file.text());
      if (!alive || !notice.isConnected) return;
      const errors = gameErrors(candidate);
      if (errors.length) throw new Error(errors[0]);
      game = {
        tiers: candidate.tiers.map(({ id, label, points }) => ({ id, label, points })),
        questions: candidate.questions.map(({ id, prompt, hint, answers }) => ({
          id, prompt, hint: typeof hint === 'string' ? hint : '',
          answers: answers.map(({ text, aliases = [], tierId }) => ({ text, aliases, tierId })),
        })),
      };
      selectedId = game.questions[0].id;
      dirty = true;
      render('Questions imported. Save changes to apply them.');
    } catch (error) {
      if (alive && notice.isConnected) setNotice(notice, error.message || 'Could not import questions.', true);
    } finally {
      event.target.value = '';
    }
  }

  function exportQuestions() {
    const notice = root.querySelector('#admin-notice');
    const errors = gameErrors(game);
    if (errors.length) return setNotice(notice, errors[0], true);
    downloadQuestions(game);
  }

  function expireSession() {
    token = '';
    renderGate('Your session expired. Sign in again to continue.', true);
  }

  async function publish() {
    const notice = root.querySelector('#admin-notice');
    const cleaned = {
      tiers: game.tiers.map(tier => ({ ...tier, label: tier.label.trim() })),
      questions: game.questions.map(question => ({
        ...question,
        prompt: question.prompt.trim(),
        hint: (question.hint || '').trim(),
        answers: question.answers.map(answer => ({ ...answer, text: answer.text.trim(), aliases: answer.aliases.map(alias => alias.trim()).filter(Boolean) })),
      })),
    };
    const errors = gameErrors(cleaned);
    if (errors.length) return setNotice(notice, errors[0], true);
    busy = true;
    const controls = [...root.querySelectorAll('button, input, select, textarea')].filter(element => !element.disabled);
    for (const control of controls) control.disabled = true;
    setNotice(notice, 'Saving…');
    try {
      const saved = await saveGame(cleaned, revision, token);
      if (!alive) return;
      revision = saved.revision;
      game = cleaned;
      dirty = false;
      render('Your changes are live for new rounds.');
    } catch (error) {
      if (alive && error.status === 401) expireSession();
      else if (alive) setNotice(notice, error.message, true);
    } finally {
      busy = false;
      for (const control of controls) control.disabled = false;
    }
  }

  async function refreshScores() {
    const notice = root.querySelector('#admin-notice');
    const session = token;
    setNotice(notice, 'Loading scores…');
    try {
      const data = await loadAdmin(session);
      if (!alive || token !== session || tab !== 'scores') return;
      scores = data.scores;
      render('Scores updated.');
    } catch (error) {
      if (alive && token === session && error.status === 401) expireSession();
      else if (alive && notice.isConnected) setNotice(notice, error.message, true);
    }
  }

  function logout() {
    const session = token;
    token = '';
    game = undefined;
    scores = [];
    dirty = false;
    tab = 'questions';
    renderGate('Signed out.');
    const notice = root.querySelector('#admin-notice');
    if (session) void signOut(session).catch(() => {
      if (alive && notice.isConnected) setNotice(notice, 'Signed out in this tab. The server could not be reached.', true);
    });
  }

  function onClick(event) {
    const button = event.target.closest('button');
    if (!button || !token || !game || busy) return;
    const { tab: nextTab, action, question: nextQuestion } = button.dataset;
    if (nextTab) {
      tab = nextTab;
      render();
      root.querySelector('[aria-pressed="true"]')?.focus();
      if (tab === 'scores') refreshScores();
      return;
    }
    if (nextQuestion) {
      selectedId = nextQuestion;
      render();
      root.querySelector('[data-field="prompt"]')?.focus();
      return;
    }
    const question = game.questions.find(item => item.id === selectedId);
    switch (action) {
      case 'add-question':
        selectedId = crypto.randomUUID();
        game.questions.push({ id: selectedId, prompt: '', hint: '', answers: [newAnswer(game.tiers[0].id)] });
        dirty = true;
        render();
        root.querySelector('[data-field="prompt"]')?.focus();
        break;
      case 'remove-question':
        game.questions = game.questions.filter(item => item.id !== selectedId);
        selectedId = game.questions[0]?.id;
        dirty = true;
        render();
        break;
      case 'add-answer':
        question.answers.push(newAnswer(game.tiers[0].id));
        dirty = true;
        render();
        root.querySelector('.answer-row:last-child input')?.focus();
        break;
      case 'remove-answer':
        question.answers.splice(Number(button.closest('[data-answer]').dataset.answer), 1);
        dirty = true;
        render();
        break;
      case 'save': publish(); break;
      case 'export': exportQuestions(); break;
      case 'import': root.querySelector('#game-file').click(); break;
      case 'refresh-scores': refreshScores(); break;
      case 'lock': logout(); break;
    }
  }

  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  root.addEventListener('change', importQuestions);
  if (isShared) renderGate();
  else {
    let draft;
    try { draft = exportLocalGame(); } catch { /* Leave the public game available if browser storage is blocked. */ }
    root.innerHTML = `<section class="admin admin-auth"><header class="admin-head"><h1>Admin sign-in</h1><a class="button quiet" href="#play">Back to game</a></header>
      <div class="admin-section"><p class="muted">Admin sign-in is available when this game is connected to its server.</p>
      ${draft ? '<button class="button secondary" id="export-preview-draft" type="button">Export questions saved in this browser</button>' : ''}</div></section>`;
    root.querySelector('#export-preview-draft')?.addEventListener('click', () => downloadQuestions(draft));
  }

  return () => {
    alive = false;
    if (token) void signOut(token).catch(() => {});
    token = '';
    root.removeEventListener('click', onClick);
    root.removeEventListener('input', onInput);
    root.removeEventListener('change', importQuestions);
  };
}
