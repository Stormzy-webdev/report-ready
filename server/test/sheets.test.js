import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { readSheets, SheetError } from '../src/lib/sheets.js';
import { FORMATS } from '../src/lib/exporters.js';
import { validateRows } from '../src/lib/importCsv.js';

async function workbookBuffer(build) {
  const workbook = new ExcelJS.Workbook();
  build(workbook);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test('reads a teacher-style .xlsx: title rows, formulas, several sheets', async () => {
  const buffer = await workbookBuffer((wb) => {
    const maths = wb.addWorksheet('Maths');
    maths.addRow(['Grade 5B Mathematics, Term 2']);
    maths.addRow([]);
    maths.addRow(['Name', 'Test 1 (50)', 'Assignment (30)', 'Total']);
    maths.addRow(['Thandi Mokoena', 38, 22.5, { formula: 'B4+C4', result: 60.5 }]);
    maths.addRow(['Sipho Dlamini', 41, 25, { formula: 'B5+C5', result: 66 }]);
    wb.addWorksheet('English').addRow(['Name', 'Oral']);
  });
  const sheets = await readSheets(buffer, 'marks.xlsx');
  assert.deepEqual(sheets.map((s) => s.name), ['Maths', 'English']);
  const rows = sheets[0].rows;
  assert.deepEqual(rows[2], ['Name', 'Test 1 (50)', 'Assignment (30)', 'Total']);
  assert.deepEqual(rows[3], ['Thandi Mokoena', '38', '22.5', '60.5']);
  assert.equal(rows[0].length, 4, 'every row is padded to the same width');
});

test('reads CSV into a grid without needing special headers', async () => {
  const [sheet] = await readSheets(Buffer.from('Name,Test\nThandi,38\n'), 'marks.csv');
  assert.deepEqual(sheet.rows, [['Name', 'Test'], ['Thandi', '38']]);
});

test('explains old .xls files instead of failing silently', async () => {
  await assert.rejects(readSheets(Buffer.from('x'), 'marks.xls'), SheetError);
});

test('validateRows keeps surname initials and rejects anything longer than a letter', () => {
  const base = { first_name: 'Thandi', subject: 'Maths', assessment: 'Test', term: 1, max_mark: 50, mark: 30 };
  const { rows, errors } = validateRows([
    { ...base, learner_code: 'THANDI-M', initial: 'm' },
    { ...base, learner_code: 'THANDI-D', initial: 'Dlamini' },
    { ...base, learner_code: 'SIPHO', first_name: 'Sipho' },
  ]);
  assert.deepEqual(rows.map((r) => r.initial), ['M', 'D', null]);
  assert.deepEqual(errors, []);
});

test('the same learner twice in one assessment explains how to fix it', () => {
  const base = { learner_code: 'THANDI', first_name: 'Thandi', subject: 'Maths', assessment: 'Test', term: 1, max_mark: 50 };
  const { errors } = validateRows([{ ...base, mark: 30 }, { ...base, mark: 41 }]);
  assert.match(errors[0].message, /already has a mark for "Test" on row 2.*different learner codes/);
});

test('validateRows keeps weights and spreadsheet row numbers', () => {
  const base = { learner_code: 'L1', first_name: 'Thandi', subject: 'Maths', assessment: 'Test', term: 2, max_mark: 50 };
  const { rows, errors } = validateRows([
    { ...base, mark: 38, weight: 2, source_row: 4 },
    { ...base, assessment: 'Quiz', mark: 60, source_row: 9 },
  ]);
  assert.equal(rows[0].weight, 2);
  assert.equal(errors[0].row, 9);
});

const sampleRows = [
  { learner_code: 'L01', first_name: 'Zoë', comment: 'Zoë has worked hard, and it shows.' },
  { learner_code: 'L02', first_name: 'Sipho', comment: 'Sipho should read every night.' },
];
const meta = { className: '5B', grade: 5, year: 2026, term: 2 };

test('Excel export opens with the comments in it', async () => {
  const buffer = await FORMATS.xlsx.build(sampleRows, meta);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.worksheets[0];
  assert.equal(sheet.name, 'Term 2 comments');
  assert.equal(sheet.getCell('B2').value, 'Zoë');
  assert.equal(sheet.getCell('D3').value, 'Sipho should read every night.');
});

test('Word export is a valid .docx (a zip file)', async () => {
  const buffer = await FORMATS.docx.build(sampleRows, meta);
  assert.equal(buffer.subarray(0, 2).toString(), 'PK');
  assert.ok(buffer.length > 2000);
});
