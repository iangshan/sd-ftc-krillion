import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_TIERS, matchAnswer, normalizeAnswer, scoreAnswer, validateQuestion, validateTiers } from './core.mjs';

const answer = { text: 'RoboGenesis', aliases: ['#26235', 'Robo Genesis'], tierId: '4' };
const question = { id: 'test', prompt: 'Name a team.', answers: [answer] };

test('normalized text and explicitly configured aliases resolve to the canonical answer', () => {
  assert.equal(normalizeAnswer('  López–Robotics  '), 'lopez robotics');
  assert.equal(normalizeAnswer(' # 26235  '), '26235');
  assert.equal(normalizeAnswer('C++'), 'c++');
  for (const input of ['ROBOGENESIS', '#26235', '26235', 'robo genesis']) {
    assert.deepEqual(matchAnswer(question, input), { status: 'exact', answer });
  }
});

test('minor typos and transpositions suggest a correction for explicit confirmation', () => {
  assert.deepEqual(matchAnswer(question, 'RoboGenesiss'), { status: 'suggestion', answer });
  assert.deepEqual(matchAnswer(question, 'Robogenessi'), { status: 'suggestion', answer });
  assert.deepEqual(matchAnswer(question, 'RoboTeam'), { status: 'miss' });
});

test('ambiguous spellings, short words, and number edits receive no suggestions', () => {
  const bots = {
    ...question,
    answers: [
      { text: 'Beach Bots', tierId: '1' },
      { text: 'Beach Bats', tierId: '2' },
      { text: 'Robo', tierId: '3' },
      answer,
    ],
  };

  for (const input of ['Beach Bets', 'Roba', '26253', '2623', '   ']) {
    assert.deepEqual(matchAnswer(bots, input), { status: 'miss' });
  }
});

test('a question rejects aliases that belong to two different answers', () => {
  const duplicate = { text: 'Another team', aliases: ['26235'], tierId: '1' };
  const conflicting = { ...question, answers: [answer, duplicate] };
  assert.deepEqual(validateQuestion(question), []);
  assert.match(validateQuestion(conflicting).join(' '), /duplicates/u);
  assert.deepEqual(matchAnswer(conflicting, '26235'), { status: 'miss' });
  assert.match(validateQuestion({ ...question, answers: [{ ...answer, tierId: '6' }] }).join(' '), /rarity tier/u);
});

test('the five tiers support custom labels and scores', () => {
  const tiers = DEFAULT_TIERS.map(tier => ({ ...tier }));
  tiers[3].label = 'Prototype';
  tiers[3].points = 80;
  assert.deepEqual(validateTiers(tiers), []);
  assert.deepEqual(scoreAnswer(answer, tiers), { tierId: '4', label: 'Prototype', points: 80 });
  assert.equal(scoreAnswer(null, tiers), null);
  assert.match(validateTiers(tiers.slice(1)).join(' '), /five/u);
  tiers[3].points = 101;
  assert.match(validateTiers(tiers).join(' '), /preceding tier/u);
});
