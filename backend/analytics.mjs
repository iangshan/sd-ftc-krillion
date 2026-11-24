import { scoreScale, unavailableRoundStats } from '../round-stats.mjs';

const MINIMUM_COMPLETED_ROUNDS = 3;

export async function getRoundStats(db, revision, game) {
  const { width, bins } = scoreScale(game);
  const { results } = await db.prepare(`
    WITH selected_round(revision, bucket_width, last_bucket) AS (VALUES (?, ?, ?)),
    completed AS (
      SELECT scores.attempt_id, scores.revision, scores.score
      FROM scores JOIN selected_round USING (revision)
    )
    SELECT 'total' AS metric, NULL AS dimension, COUNT(*) AS count, AVG(score) AS average
    FROM completed
    UNION ALL
    SELECT 'question', question_scores.question_id, COUNT(*), AVG(question_scores.points)
    FROM question_scores JOIN completed USING (attempt_id, revision)
    GROUP BY question_scores.question_id
    UNION ALL
    SELECT 'bucket', MIN(CAST(score / bucket_width AS INTEGER), last_bucket), COUNT(*), NULL
    FROM completed CROSS JOIN selected_round
    GROUP BY MIN(CAST(score / bucket_width AS INTEGER), last_bucket)
  `).bind(revision, width, bins.length - 1).all();

  const total = results.find(row => row.metric === 'total');
  if (total.count < MINIMUM_COMPLETED_ROUNDS) {
    return unavailableRoundStats(total.count, game.questions.length);
  }

  const perQuestion = new Map();
  for (const row of results) {
    if (row.metric === 'question') perQuestion.set(row.dimension, row.average);
    if (row.metric === 'bucket') bins[row.dimension].count = row.count;
  }

  return {
    count: total.count,
    averageTotal: total.average,
    averagePerQuestion: game.questions.map(question => perQuestion.get(question.id) ?? null),
    distribution: bins,
  };
}
