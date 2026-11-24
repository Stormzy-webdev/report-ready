import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCsv } from '../src/lib/csv.js';
import { parseCsv } from '../src/lib/importCsv.js';

test('toCsv quotes commas, quotes and new lines, and round-trips', () => {
  const rows = [
    { learner_code: 'L01', first_name: 'Zoë', comment: 'Zoë works hard, and says "thank you".\nWell done!' },
  ];
  const csv = toCsv(['learner_code', 'first_name', 'comment'], rows);
  assert.ok(csv.startsWith('﻿'));
  assert.deepEqual(parseCsv(Buffer.from(csv)), rows);
});

test('toCsv stops cells being read as formulas', () => {
  const csv = toCsv(['comment'], [{ comment: '=HYPERLINK("x")' }]);
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
});
