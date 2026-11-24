import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDrafts } from '../src/lib/generate.js';
import { AiSetupError } from '../src/lib/ai.js';

const learners = Array.from({ length: 12 }, (_, i) => ({
  learner_id: i + 1,
  first_name: `Learner${i + 1}`,
  learner_code: `L${i + 1}`,
  flag: 'steady',
  subjects: [{ subject: 'Maths', average: 60, level: 5, previous_average: 60 }],
}));
const options = { grade: 5, term: 2, styleExamples: ['{name} tries hard.'] };

test('drafts every learner and fills in first names', async () => {
  const seen = [];
  const draft = async ({ message }) => {
    seen.push(message);
    return '{name} has had a steady term.';
  };
  const results = await generateDrafts(learners, { ...options, draft });
  assert.equal(results.length, 12);
  const first = results.find((r) => r.learner_id === 1);
  assert.equal(first.text, 'Learner1 has had a steady term.');
  // The model never saw a name or learner code.
  assert.ok(seen.every((m) => !/Learner\d|L\d+\b/.test(m)));
});

test('retries once, then leaves the learner for the teacher', async () => {
  const calls = new Map();
  const draft = async ({ message }) => {
    const n = (calls.get(message) ?? 0) + 1;
    calls.set(message, n);
    return 'No placeholder here.';
  };
  const [result] = await generateDrafts(learners.slice(0, 1), { ...options, draft });
  assert.equal(result.text, null);
  assert.equal([...calls.values()][0], 2);
});

test('a failed first attempt can succeed on the retry', async () => {
  let attempt = 0;
  const draft = async () => {
    attempt += 1;
    if (attempt === 1) throw new Error('overloaded');
    return '{name} is doing well.';
  };
  const [result] = await generateDrafts(learners.slice(0, 1), { ...options, draft });
  assert.equal(result.text, 'Learner1 is doing well.');
});

test('a bad API key stops the whole run', async () => {
  let calls = 0;
  const draft = async () => {
    calls += 1;
    throw new AiSetupError('bad key');
  };
  await assert.rejects(generateDrafts(learners, { ...options, draft }), AiSetupError);
  assert.ok(calls <= 5, `expected at most one call per worker, got ${calls}`);
});

test('runs at most 5 drafts at once', async () => {
  let running = 0;
  let peak = 0;
  const draft = async () => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    running -= 1;
    return '{name} is fine.';
  };
  await generateDrafts(learners, { ...options, draft });
  assert.equal(peak, 5);
});
