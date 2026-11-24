import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessHeaderRow, guessMapping, buildRows, resolveLearners, parsePasted, firstNameFrom } from './mapping.js';

const map = (grid) => guessMapping(grid, guessHeaderRow(grid));
const build = (grid) => buildRows(grid, map(grid), { subject: 'Maths', term: 1 }).rows;

test('reads a typical pasted mark sheet', () => {
  const grid = parsePasted([
    'Grade 5B Mathematics\tTerm 2', '',
    'Learner\tAdm no\tTest 1\tAssignment\tTotal\t%',
    'Out of\t\t50\t30\t80\t100',
    'MOKOENA Thandi\t1021\t38\t22\t60\t75',
    'DLAMINI Sipho\t1022\t41\t\t41\t51',
  ].join('\n'));
  const m = map(grid);
  assert.equal(m.headerRow, 2);
  assert.equal(m.maxRow, 3);
  assert.equal(m.nameFormat, 'last_first');
  assert.deepEqual(m.assessments.map((a) => [a.name, a.max, a.include]),
    [['Test 1', 50, true], ['Assignment', 30, true], ['Total', 80, false], ['%', 100, false]]);
  const { rows, skippedBlanks } = buildRows(grid, m, { subject: 'Maths', term: 2 });
  assert.equal(rows.length, 3);
  assert.equal(skippedBlanks, 1);
  assert.deepEqual([rows[0].first_name, rows[0].learner_code, rows[0].initial], ['Thandi', '1021', null]);
});

test('first names from every common layout', () => {
  assert.equal(firstNameFrom('Mokoena, Thandi', 'last_first'), 'Thandi');
  assert.equal(firstNameFrom('VAN DER MERWE Ruan', 'last_first'), 'Ruan');
  assert.equal(firstNameFrom('Thandi Mokoena', 'first_last'), 'Thandi');
  assert.equal(firstNameFrom('THANDI', 'first'), 'Thandi');
});

test('two learners with the same first name get surname initials and separate codes', () => {
  const rows = build([['Learner', 'Test (50)'], ['MOKOENA Thandi', '38'], ['DLAMINI Thandi', '41'], ['NAIDOO Priya', '30']]);
  assert.deepEqual(rows.map((r) => [r.first_name, r.initial, r.learner_code]), [
    ['Thandi', 'M', 'THANDI-M'], ['Thandi', 'D', 'THANDI-D'], ['Priya', null, 'PRIYA'],
  ]);
});

test('only learners who share a name keep an initial (no surname data otherwise)', () => {
  const { learners } = resolveLearners([['Name', 'Surname', 'Test (10)'], ['Thandi', 'Mokoena', '8'], ['Sipho', 'Dlamini', '9']],
    map([['Name', 'Surname', 'Test (10)'], ['Thandi', 'Mokoena', '8'], ['Sipho', 'Dlamini', '9']]));
  assert.ok([...learners.values()].every((l) => l.initial === null));
});

test('a separate surname column is used for the initial', () => {
  const rows = build([['Name', 'Surname', 'Test (10)'], ['Thandi', 'Mokoena', '8'], ['Thandi', 'Dlamini', '9']]);
  assert.deepEqual(rows.map((r) => r.learner_code), ['THANDI-M', 'THANDI-D']);
});

test('learner codes tell same-named learners apart without needing surnames', () => {
  const grid = [['Name', 'Adm no', 'Test (10)'], ['Thandi', '1021', '8'], ['Thandi', '1022', '9']];
  const { clashes } = resolveLearners(grid, map(grid));
  assert.deepEqual(clashes, [{ firstName: 'Thandi', count: 2, resolved: true, labels: ['Thandi (1021)', 'Thandi (1022)'] }]);
});

test('reports a clash it cannot resolve (same name, no surname, no code)', () => {
  const grid = [['Name', 'Test (10)'], ['Thandi', '8'], ['Thandi', '9']];
  const { clashes } = resolveLearners(grid, map(grid));
  assert.equal(clashes[0].resolved, false);
});

test('same first name and same surname initial is still a clash', () => {
  const grid = [['Learner', 'Test (10)'], ['MOKOENA Thandi', '8'], ['MOLEFE Thandi', '9']];
  const { clashes } = resolveLearners(grid, map(grid));
  assert.equal(clashes[0].resolved, false);
});
