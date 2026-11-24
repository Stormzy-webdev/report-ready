import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCsv, validateRows, summarise } from '../src/lib/importCsv.js';

const HEADER = 'learner_code,first_name,subject,assessment,term,max_mark,mark\n';
const check = (body) => validateRows(parseCsv(Buffer.from(HEADER + body)));

test('accepts a clean file', () => {
  const { rows, errors } = check('L01,Thandi,Maths,Test,2,50,38\nL02,Sipho,Maths,Test,2,50,"45,5"\n');
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].mark, 45.5);
});

test('flags missing marks and marks above the maximum', () => {
  const { rows, errors } = check('L01,Thandi,Maths,Test,2,50,\nL02,Sipho,Maths,Test,2,50,60\n');
  assert.equal(rows.length, 0);
  assert.match(errors[0].message, /missing mark/);
  assert.equal(errors[0].row, 2);
  assert.match(errors[1].message, /above the maximum of 50/);
});

test('flags a bad term and a missing column', () => {
  assert.match(check('L01,Thandi,Maths,Test,5,50,30\n').errors[0].message, /term must be/);
  const noMark = validateRows(parseCsv(Buffer.from('learner_code,first_name,subject,assessment,term,max_mark\nL01,T,M,T,1,50\n')));
  assert.match(noMark.errors[0].message, /Missing column\(s\): mark/);
});

test('flags duplicates and conflicting names or maximums', () => {
  const { errors } = check([
    'L01,Thandi,Maths,Test,2,50,38',
    'L01,Thandi,Maths,Test,2,50,40',
    'L01,Thandeka,Maths,Quiz,2,10,8',
    'L02,Sipho,Maths,Test,2,40,30',
  ].join('\n'));
  assert.equal(errors.length, 3);
  assert.match(errors[0].message, /already has a mark for "Test" on row 2/);
  assert.match(errors[1].message, /called "Thandi"/);
  assert.match(errors[2].message, /max_mark 50/);
});

test('tolerates header spacing and capitals', () => {
  const records = parseCsv(Buffer.from('Learner Code,First Name,Subject,Assessment,Term,Max Mark,Mark\nL01,Thandi,Maths,Test,1,50,30\n'));
  assert.deepEqual(validateRows(records).errors, []);
});

test('sample-import.csv shows a missing mark and a mark above the maximum', async () => {
  const buffer = await readFile(new URL('../db/sample-import.csv', import.meta.url));
  const { rows, errors } = validateRows(parseCsv(buffer));
  assert.deepEqual(errors.map((e) => e.learner_code), ['L32', 'L33']);
  assert.deepEqual(summarise(rows), { learners: 2, subjects: ['Mathematics'], assessments: 2, marks: 3 });
});
