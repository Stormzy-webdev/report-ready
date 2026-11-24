import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSystemPrompt, buildLearnerMessage, checkDraft, fillName, anonymiseExample, MAX_COMMENT_CHARS,
} from '../src/lib/prompt.js';

const learner = {
  learner_id: 7,
  first_name: 'Thandi',
  learner_code: 'L07',
  flag: 'improving',
  subjects: [
    { subject: 'Mathematics', average: 58, level: 4, previous_average: 49 },
    { subject: 'English', average: 71.5, level: 6, previous_average: 74 },
    { subject: 'Life Skills', average: null, level: null, previous_average: null },
  ],
};

test('the learner message has marks but no name or learner code', () => {
  const message = buildLearnerMessage(learner, { grade: 5, term: 2 });
  assert.doesNotMatch(message, /Thandi|L07/);
  assert.match(message, /Grade 5, term 2/);
  assert.match(message, /Mathematics: 58% \(CAPS level 4\), up from 49% last term/);
  assert.match(message, /English: 71.5% \(CAPS level 6\), down from 74% last term/);
  assert.match(message, /Life Skills: no marks this term/);
  assert.match(message, /Overall: improving/);
});

test('the system prompt includes the style examples and the rules', () => {
  const system = buildSystemPrompt(['{name} tries hard.']);
  assert.match(system, /<example>\n\{name\} tries hard\.\n<\/example>/);
  assert.match(system, new RegExp(`at most ${MAX_COMMENT_CHARS} characters`));
});

test('checkDraft requires {name} and a sensible length', () => {
  assert.equal(checkDraft('{name} has done well.'), null);
  assert.match(checkDraft('Thandi has done well.'), /does not use \{name\}/);
  assert.match(checkDraft(''), /empty/);
  assert.match(checkDraft(undefined), /empty/);
  assert.match(checkDraft('{name} ' + 'x'.repeat(500)), /characters/);
});

test('fillName puts the first name back in every place', () => {
  assert.equal(fillName(' {name} works hard. Well done, {name}! ', 'Sipho'), 'Sipho works hard. Well done, Sipho!');
});

test('anonymiseExample swaps known names but not parts of other words', () => {
  const text = anonymiseExample('Thandi worked hard. THANDI should read more; Thandiwe helped.', ['Thandi']);
  assert.equal(text, '{name} worked hard. {name} should read more; Thandiwe helped.');
  assert.equal(anonymiseExample('Zoë has grown.', ['Zoë']), '{name} has grown.');
  assert.equal(anonymiseExample('No names here.', []), 'No names here.');
});
