import { parse } from 'csv-parse/sync';

// One row per learner per assessment ("long" format), e.g.
// learner_code,first_name,subject,assessment,term,max_mark,mark
// L01,Thandi,Maths,Term 2 test,2,50,38
export const COLUMNS = ['learner_code', 'first_name', 'subject', 'assessment', 'term', 'max_mark', 'mark'];

export function parseCsv(buffer) {
  return parse(buffer, {
    columns: (header) => header.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_')),
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });
}

// Accepts "45", "45.5" and the Excel-in-SA style "45,5".
function toNumber(value) {
  if (value == null) return null;
  const text = String(value).trim().replace(',', '.');
  if (text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : NaN;
}

// Validates parsed records. Used for the preview and again on confirm, so the
// server never trusts rows sent back by the browser.
export function validateRows(records) {
  const errors = [];
  const rows = [];

  if (!Array.isArray(records) || records.length === 0) {
    return { rows, errors: [{ row: null, message: 'The file has no data rows.' }] };
  }

  const missingColumns = COLUMNS.filter((c) => !(c in records[0]));
  if (missingColumns.length) {
    return {
      rows,
      errors: [{ row: null, message: `Missing column(s): ${missingColumns.join(', ')}` }],
    };
  }

  const seen = new Map();          // learner|subject|term|assessment -> row number
  const learnerNames = new Map();  // learner_code -> first_name
  const maxMarks = new Map();      // subject|term|assessment -> max_mark

  records.forEach((record, i) => {
    // Rows built from a spreadsheet in the browser carry their original row number.
    const rowNumber = Number(record.source_row) || i + 2; // row 1 is the header
    const text = (key) => String(record[key] ?? '').trim();
    const problems = [];

    const weight = toNumber(record.weight);
    const row = {
      learner_code: text('learner_code'),
      first_name: text('first_name'),
      subject: text('subject'),
      assessment: text('assessment'),
      term: toNumber(record.term),
      max_mark: toNumber(record.max_mark),
      mark: toNumber(record.mark),
      weight: weight ?? 1,
      // Optional surname initial, only sent when two learners share a first name.
      initial: text('initial').slice(0, 1).toUpperCase() || null,
    };
    if (Number.isNaN(row.weight) || row.weight <= 0) problems.push('weight must be a number above 0');
    if (row.initial && !/^[A-Z]$/.test(row.initial)) problems.push('initial must be a single letter');

    for (const key of ['learner_code', 'first_name', 'subject', 'assessment']) {
      if (!row[key]) problems.push(`${key} is empty`);
    }
    if (!Number.isInteger(row.term) || row.term < 1 || row.term > 4) {
      problems.push('term must be 1, 2, 3 or 4');
    }
    if (row.max_mark == null || Number.isNaN(row.max_mark) || row.max_mark <= 0) {
      problems.push('max_mark must be a number above 0');
    }
    if (row.mark == null) {
      problems.push('missing mark');
    } else if (Number.isNaN(row.mark)) {
      problems.push(`mark "${text('mark')}" is not a number`);
    } else if (row.mark < 0) {
      problems.push('mark is negative');
    } else if (row.max_mark > 0 && row.mark > row.max_mark) {
      problems.push(`mark ${row.mark} is above the maximum of ${row.max_mark}`);
    }

    if (problems.length === 0) {
      const key = [row.learner_code, row.subject, row.term, row.assessment].join('|');
      if (seen.has(key)) {
        problems.push(
          `learner ${row.learner_code} already has a mark for "${row.assessment}" on row ${seen.get(key)}. `
          + 'If these are two different learners, give them different learner codes',
        );
      } else {
        seen.set(key, rowNumber);
      }

      const knownName = learnerNames.get(row.learner_code);
      if (knownName && knownName !== row.first_name) {
        problems.push(`learner ${row.learner_code} is called "${knownName}" on an earlier row`);
      } else {
        learnerNames.set(row.learner_code, row.first_name);
      }

      const assessmentKey = [row.subject, row.term, row.assessment].join('|');
      const knownMax = maxMarks.get(assessmentKey);
      if (knownMax != null && knownMax !== row.max_mark) {
        problems.push(`"${row.assessment}" has max_mark ${knownMax} on an earlier row`);
      } else {
        maxMarks.set(assessmentKey, row.max_mark);
      }
    }

    if (problems.length) {
      errors.push({ row: rowNumber, learner_code: row.learner_code, message: problems.join('; ') });
    } else {
      rows.push(row);
    }
  });

  return { rows, errors };
}

export function summarise(rows) {
  return {
    learners: new Set(rows.map((r) => r.learner_code)).size,
    subjects: [...new Set(rows.map((r) => r.subject))].sort(),
    assessments: new Set(rows.map((r) => [r.subject, r.term, r.assessment].join('|'))).size,
    marks: rows.length,
  };
}
