export function scoreScale({ questions, tiers }) {
  const maximum = questions.length * Math.max(0, ...tiers.map(tier => tier.points));
  const target = Math.max(1, Math.ceil(maximum / 10));
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const width = [1, 2, 3, 5, 10].map(factor => factor * magnitude).find(step => step >= target);
  const bins = Math.max(1, Math.ceil(maximum / width));

  return {
    width,
    bins: Array.from({ length: bins }, (_, index) => ({
      min: index * width,
      max: index === bins - 1 ? maximum : (index + 1) * width - 1,
      count: 0,
    })),
  };
}

export function unavailableRoundStats(count, questionCount) {
  return {
    count,
    averageTotal: null,
    averagePerQuestion: Array(questionCount).fill(null),
    distribution: [],
  };
}
