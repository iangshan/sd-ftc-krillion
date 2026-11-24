import { escapeHtml as h } from './ui.mjs';

const pointNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

function isScore(value) {
  return Number.isFinite(value) && value >= 0;
}

function points(value) {
  return pointNumber.format(value);
}

function describeBin({ min, max, count }) {
  const range = min === max ? points(min) : `${points(min)}–${points(max)}`;
  return `${range} points, ${points(count)} ${count === 1 ? 'round' : 'rounds'}`;
}

function histogram(distribution, total, average) {
  const bins = (distribution ?? []).filter(bin => isScore(bin?.min)
    && isScore(bin.max) && bin.max >= bin.min && isScore(bin.count));
  const peak = Math.max(0, ...bins.map(bin => bin.count));
  if (!peak) return '';

  const start = Math.min(total, average, ...bins.map(bin => bin.min));
  const end = Math.max(total, average, ...bins.map(bin => bin.max));
  const width = end - start + 1;
  const position = value => ((value - start + 0.5) / width * 100).toFixed(4);
  const bars = bins.map(bin => {
    const range = ((bin.max - bin.min + 1) / width * 100).toFixed(4);
    const height = (bin.count / peak * 100).toFixed(4);
    return `<span class="score-chart__bin" style="--left:${position(bin.min - 0.5)}%;--range:${range}%;--height:${height}%" title="${h(describeBin(bin))}"></span>`;
  }).join('');
  const coincident = Math.abs(Number(position(average)) - Number(position(total))) < 1;
  const axis = start === end
    ? `<span>${h(points(start))} points</span>`
    : `<span>${h(points(start))} points</span><span>${h(points(end))} points</span>`;

  return `<figure class="score-chart" aria-label="Distribution of completed round scores">
    <div class="score-chart__plot" aria-hidden="true">
      ${bars}
      <span class="score-chart__marker score-chart__marker--average${coincident ? ' score-chart__marker--near' : ''}" style="--left:${position(average)}%"></span>
      <span class="score-chart__marker score-chart__marker--you" style="--left:${position(total)}%"></span>
    </div>
    <div class="score-chart__axis" aria-hidden="true">${axis}</div>
    <figcaption class="sr-only">${h(bins.filter(bin => bin.count).map(describeBin).join('. '))}.</figcaption>
  </figure>`;
}

function comparison({ stats, statsStatus, total }) {
  const count = isScore(stats?.count) ? stats.count : 0;
  const average = isScore(stats?.averageTotal) ? stats.averageTotal : null;
  let body;

  if (statsStatus === 'loading') {
    body = '<p class="round-results__muted" role="status">Loading score comparison…</p>';
  } else if (statsStatus === 'error') {
    body = '<p class="round-results__muted" role="status">Score comparison is temporarily unavailable.</p>';
  } else if (average === null || count === 0) {
    body = '<p class="round-results__muted">Complete a round to see the comparison for this browser.</p>';
  } else {
    body = `${histogram(stats.distribution, total, average)}
      <dl class="score-chart__key">
        <div class="score-chart__key--you"><dt>Your score</dt><dd>${h(points(total))} pts</dd></div>
        <div class="score-chart__key--average"><dt>Average</dt><dd>${h(points(average))} pts</dd></div>
      </dl>
      <p class="round-results__muted">Based on rounds saved in this browser.</p>`;
  }

  const rounds = count === 1 ? 'completed round' : 'completed rounds';
  return `<section class="round-results__section" aria-labelledby="round-comparison-title">
    <div class="round-results__section-heading">
      <h2 id="round-comparison-title">Score comparison</h2>
      ${statsStatus === 'ready' && count ? `<p class="round-results__sample">${h(points(count))} ${rounds}</p>` : ''}
    </div>
    ${body}
  </section>`;
}

function answerRows(questions, results, averagePerQuestion) {
  return questions.map((question, index) => {
    const result = results[index];
    const entered = result?.input?.trim() || '';
    const scoredAs = result?.answer?.trim() || '';
    const answer = entered || scoredAs;
    const score = result?.score;
    const earned = isScore(score?.points) ? score.points : 0;
    const average = averagePerQuestion?.[index];
    const note = entered && scoredAs && entered !== scoredAs
      ? `Scored as ${scoredAs}`
      : answer && !score ? 'No match' : '';

    return `<li class="answer-recap__row">
      <div class="answer-recap__line">
        <div class="answer-recap__entry">
          <h3>${h(question.prompt)}</h3>
          <p>${answer ? `<span class="sr-only">Your answer </span><strong>${h(answer)}</strong>` : '<strong>Passed</strong>'}</p>
          ${note ? `<p class="answer-recap__note">${h(note)}</p>` : ''}
        </div>
        <dl class="answer-recap__scores">
          <div><dt class="sr-only">Points earned</dt><dd class="answer-recap__earned${earned ? '' : ' answer-recap__earned--zero'}">+${h(points(earned))} pts</dd></div>
          ${isScore(average) ? `<div class="answer-recap__average"><dt>Avg</dt><dd>${h(points(average))} pts</dd></div>` : ''}
        </dl>
      </div>
    </li>`;
  }).join('');
}

export function renderResults({ round, stats, statsStatus = 'loading' }) {
  const accepted = round.results.filter(result => result?.score).length;
  const total = isScore(round.total) ? round.total : 0;
  const averages = statsStatus === 'ready' ? stats?.averagePerQuestion : undefined;

  return `<section class="round-results" aria-labelledby="round-results-title">
    <header class="round-results__header">
      <div>
        <h1 id="round-results-title">Round complete</h1>
        <p class="round-results__total">${h(points(total))} <span>points</span></p>
      </div>
      <p class="round-results__accepted">${accepted} of ${round.questions.length} accepted</p>
    </header>
    ${comparison({ stats, statsStatus, total })}
    <section class="round-results__section" aria-labelledby="round-answers-title">
      <h2 id="round-answers-title">Your answers</h2>
      <ol class="answer-recap">${answerRows(round.questions, round.results, averages)}</ol>
    </section>
  </section>`;
}
