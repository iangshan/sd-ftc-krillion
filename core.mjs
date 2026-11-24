export const DEFAULT_TIERS = Object.freeze([
  { id: '1', label: 'LM1', points: 10 },
  { id: '2', label: 'League Championship', points: 25 },
  { id: '3', label: 'Regionals', points: 50 },
  { id: '4', label: 'Premier Event', points: 75 },
  { id: '5', label: 'Worlds', points: 100 },
].map(Object.freeze));

export function normalizeAnswer(value) {
  if (typeof value !== 'string') return '';

  return value.normalize('NFKD')
    .toLowerCase()
    .replace(/\p{M}/gu, '')
    .replace(/['’]/gu, '')
    .replace(/^\s*#\s*(?=\d+\s*$)/u, '')
    .replace(/[^\p{L}\p{N}+#&]+/gu, ' ')
    .trim();
}

export function validateTiers(tiers) {
  if (!Array.isArray(tiers) || tiers.length !== DEFAULT_TIERS.length) {
    return ['Configure five rarity tiers.'];
  }

  const errors = [];
  const ids = new Set();
  const labels = new Set();

  for (const [index, tier] of tiers.entries()) {
    const number = index + 1;
    const id = tier?.id;
    const label = normalizeAnswer(tier?.label);
    if (typeof id !== 'string' || !id.trim() || ids.has(id)) {
      errors.push(`Tier ${number} needs a unique ID.`);
    }
    if (!label || labels.has(label)) {
      errors.push(`Tier ${number} needs a unique name.`);
    }
    if (!Number.isSafeInteger(tier?.points) || tier.points < 0) {
      errors.push(`Tier ${number} needs a nonnegative whole-number score.`);
    } else if (index > 0 && tier.points <= tiers[index - 1]?.points) {
      errors.push(`Tier ${number} must be worth more than the preceding tier.`);
    }
    ids.add(id);
    labels.add(label);
  }

  return errors;
}

function answerKeys(answer) {
  const aliases = Array.isArray(answer?.aliases) ? answer.aliases : [];
  return [...new Set([answer?.text, ...aliases].map(normalizeAnswer).filter(Boolean))];
}

export function validateQuestion(question, tiers = DEFAULT_TIERS) {
  const errors = [];

  if (typeof question?.id !== 'string' || !question.id.trim()) {
    errors.push('The question needs an ID.');
  }
  if (typeof question?.prompt !== 'string' || !question.prompt.trim()) {
    errors.push('Enter a question prompt.');
  }
  if (!Array.isArray(question?.answers) || question.answers.length === 0) {
    return [...errors, 'Add at least one accepted answer.'];
  }

  const tierIds = new Set(Array.isArray(tiers) ? tiers.map(tier => tier?.id).filter(Boolean) : []);
  const usedKeys = new Set();
  for (const [index, answer] of question.answers.entries()) {
    const number = index + 1;
    if (!normalizeAnswer(answer?.text)) errors.push(`Enter text for answer ${number}.`);
    if (!tierIds.has(answer?.tierId)) errors.push(`Choose a rarity tier for answer ${number}.`);
    if (answer?.aliases !== undefined && (!Array.isArray(answer.aliases)
      || answer.aliases.some(alias => typeof alias !== 'string' || !normalizeAnswer(alias)))) {
      errors.push(`Enter valid aliases for answer ${number}.`);
    }
    const keys = answerKeys(answer);
    if (keys.some(key => usedKeys.has(key))) {
      errors.push(`Answer ${number} duplicates another answer or alias.`);
    }
    for (const key of keys) usedKeys.add(key);
  }

  return errors;
}

function spellingDistance(left, right) {
  const distances = Array.from({ length: left.length + 1 }, (_, row) => [row]);
  for (let column = 1; column <= right.length; column++) distances[0][column] = column;

  for (let row = 1; row <= left.length; row++) {
    for (let column = 1; column <= right.length; column++) {
      const mismatch = Number(left[row - 1] !== right[column - 1]);
      distances[row][column] = Math.min(
        distances[row - 1][column] + 1,
        distances[row][column - 1] + 1,
        distances[row - 1][column - 1] + mismatch,
      );
      if (row > 1 && column > 1 && left[row - 1] === right[column - 2]
        && left[row - 2] === right[column - 1]) {
        distances[row][column] = Math.min(distances[row][column], distances[row - 2][column - 2] + 1);
      }
    }
  }

  return distances[left.length][right.length];
}

export function matchAnswer(question, input) {
  const key = normalizeAnswer(input);
  const answers = Array.isArray(question?.answers) ? question.answers : [];
  if (!key) return { status: 'miss' };

  const indexed = answers.map(answer => ({ answer, keys: answerKeys(answer) }));
  const exact = indexed.filter(candidate => candidate.keys.includes(key));
  if (exact.length === 1) return { status: 'exact', answer: exact[0].answer };
  if (exact.length > 1 || /\p{N}/u.test(key)) return { status: 'miss' };

  const letters = [...key].filter(character => /\p{L}/u.test(character)).length;
  if (letters < 5 || key.length > 120) return { status: 'miss' };

  const threshold = letters >= 9 ? 2 : 1;
  const suggestions = indexed.filter(candidate => candidate.keys.some(alias => (
    !/\p{N}/u.test(alias) && Math.abs(key.length - alias.length) <= threshold
      && spellingDistance(key, alias) <= threshold
  )));
  if (suggestions.length !== 1) return { status: 'miss' };

  return { status: 'suggestion', answer: suggestions[0].answer };
}

export function scoreAnswer(answer, tiers = DEFAULT_TIERS) {
  if (!answer?.tierId || !Array.isArray(tiers)) return null;
  const tier = tiers.find(candidate => candidate?.id === answer.tierId);
  if (!tier) return null;
  return { tierId: tier.id, label: tier.label, points: tier.points };
}
