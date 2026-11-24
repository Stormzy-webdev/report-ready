// Turns a teacher's own spreadsheet (one row per learner, one column per
// assessment) into the rows the server imports. Runs in the browser, so
// surnames are dropped here and never leave the teacher's computer.

const LONG_COLUMNS = ['learner_code', 'first_name', 'subject', 'assessment', 'term', 'max_mark', 'mark'];
const NAME_RE = /\b(name|names|learner|learners|leerder|naam|pupil|student)\b/i;
const CODE_RE = /\b(code|no|nr|number|num|adm|admission|ref)\b|#/i;
const SURNAME_RE = /\b(surname|van|last ?name|family)\b/i;
const SKIP_RE = /\b(total|totaal|%|percent|percentage|avg|average|gem|gemiddeld|term mark|final|rank|level|comment|kommentaar|gender|gr|grade|class|klas)\b|%/i;
const MAX_IN_HEADER_RE = /(?:\/|out of|uit|\(|\[)\s*(\d+(?:[.,]\d+)?)\s*[)\]]?\s*$/i;

const normalise = (h) => String(h ?? '').trim().toLowerCase().replace(/\s+/g, '_');
const num = (v) => {
  const t = String(v ?? '').trim().replace(',', '.');
  return t === '' ? null : Number(t);
};
const isNum = (v) => num(v) != null && Number.isFinite(num(v));

// Cells copied from Excel arrive tab-separated, one row per line.
export function parsePasted(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length && !lines.at(-1).trim()) lines.pop();
  const sep = lines.some((l) => l.includes('\t')) ? '\t' : lines.some((l) => l.includes(';')) ? ';' : ',';
  const rows = lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1')));
  const width = Math.max(0, ...rows.map((r) => r.length));
  return rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
}

export function isLongFormat(headers) {
  const have = headers.map(normalise);
  return LONG_COLUMNS.every((c) => have.includes(c));
}

// The header is usually the first row that names the learner column; title
// rows like "Grade 5B Maths, Term 2" above it are skipped.
export function guessHeaderRow(rows) {
  const limit = Math.min(rows.length, 15);
  for (let i = 0; i < limit; i++) {
    const filled = rows[i].filter(Boolean);
    if (filled.length >= 2 && filled.some((c) => NAME_RE.test(c) && !isNum(c))) return i;
  }
  for (let i = 0; i < limit; i++) {
    if (rows[i].filter(Boolean).length >= 2) return i;
  }
  return 0;
}

// Some sheets have a row under the header with the maximum marks
// ("Out of", 50, 30, ...). Returns its index or -1.
export function findMaxRow(rows, headerRow, nameCol) {
  const next = rows[headerRow + 1];
  if (!next) return -1;
  const label = next[nameCol] ?? '';
  const numbers = next.filter((c, i) => i !== nameCol && isNum(c)).length;
  if (numbers === 0) return -1;
  return !label || /max|out of|uit|totaal|total|possible/i.test(label) ? headerRow + 1 : -1;
}

function cleanAssessmentName(header) {
  return header.replace(MAX_IN_HEADER_RE, '').replace(/[\s:–-]+$/, '').trim() || header;
}

export function guessMapping(rows, headerRow) {
  const headers = rows[headerRow] ?? [];
  const data = rows.slice(headerRow + 1).filter((r) => r.some(Boolean));

  let nameCol = headers.findIndex((h) => NAME_RE.test(h) && !SURNAME_RE.test(h) && !CODE_RE.test(h));
  if (nameCol < 0) nameCol = headers.findIndex((h, i) => data.slice(0, 5).some((r) => r[i] && !isNum(r[i])));
  if (nameCol < 0) nameCol = 0;
  const surnameCol = headers.findIndex((h, i) => i !== nameCol && SURNAME_RE.test(h));
  const codeCol = headers.findIndex((h, i) => i !== nameCol && i !== surnameCol && CODE_RE.test(h) && !NAME_RE.test(h));

  const maxRow = findMaxRow(rows, headerRow, nameCol);
  const sample = data.filter((r) => r !== rows[maxRow]).slice(0, 10);

  const assessments = headers.map((h, col) => {
    if ([nameCol, codeCol, surnameCol].includes(col) || !h) return null;
    const values = sample.map((r) => r[col]).filter(Boolean);
    const numeric = values.length > 0 && values.filter(isNum).length / values.length >= 0.6;
    if (!numeric) return null;
    const fromHeader = h.match(MAX_IN_HEADER_RE);
    const fromRow = maxRow >= 0 && isNum(rows[maxRow][col]) ? num(rows[maxRow][col]) : null;
    const highest = Math.max(...values.filter(isNum).map(num));
    return {
      col,
      header: h,
      include: !SKIP_RE.test(h),
      name: cleanAssessmentName(h),
      max: fromHeader ? num(fromHeader[1]) : fromRow ?? (highest <= 100 && highest > 0 ? (highest > 50 ? 100 : null) : null),
      weight: 1,
    };
  }).filter(Boolean);

  const nameFormat = surnameCol >= 0 ? 'first' : guessNameFormat(data.map((r) => r[nameCol]));
  return { headerRow, maxRow, nameCol, nameFormat, codeCol, surnameCol, assessments };
}

// "Thandi" → first only; "Thandi Mokoena" → first then surname;
// "Mokoena, Thandi" / "MOKOENA Thandi" → surname first.
function guessNameFormat(names) {
  const sample = names.filter(Boolean).slice(0, 10);
  if (sample.some((n) => n.includes(','))) return 'last_first';
  if (sample.some((n) => /^[A-Z'-]{2,}\s+[A-Z][a-z]/.test(n))) return 'last_first';
  return sample.filter((n) => n.trim().includes(' ')).length > sample.length / 2 ? 'first_last' : 'first';
}

export function firstNameFrom(cell, format) {
  const text = String(cell ?? '').trim();
  if (!text) return '';
  if (text.includes(',')) return text.split(',')[1].trim().split(/\s+/)[0] ?? '';
  const words = text.split(/\s+/);
  const pick = format === 'last_first' ? words.at(-1) : words[0];
  // "THANDI" → "Thandi"
  return pick === pick.toUpperCase() && pick.length > 1 ? pick[0] + pick.slice(1).toLowerCase() : pick;
}

// The surname part of a name cell (or the surname column), used only for an initial.
export function surnameFrom(row, mapping) {
  if (mapping.surnameCol >= 0) return String(row[mapping.surnameCol] ?? '').trim();
  const text = String(row[mapping.nameCol] ?? '').trim();
  if (text.includes(',')) return text.split(',')[0].trim();
  const words = text.split(/\s+/);
  if (words.length < 2 || mapping.nameFormat === 'first') return '';
  return mapping.nameFormat === 'last_first' ? words.slice(0, -1).join(' ') : words.slice(1).join(' ');
}

function initialOf(surname) {
  const letter = surname.normalize('NFD').replace(/[^A-Za-z]/g, '')[0];
  return letter ? letter.toUpperCase() : null;
}

// Works out each learner's first name, code and (only when needed) surname
// initial. Two learners called Thandi become "Thandi M." and "Thandi D.";
// everyone else keeps no initial, so no surname data is kept without need.
// Returns { learners: Map(rowIndex → { firstName, initial, code }), clashes }.
export function resolveLearners(rows, mapping) {
  const list = [];
  rows.forEach((row, index) => {
    if (index <= mapping.headerRow || index === mapping.maxRow) return;
    const firstName = firstNameFrom(row[mapping.nameCol], mapping.nameFormat);
    if (!firstName) return;
    const explicitCode = mapping.codeCol >= 0 ? String(row[mapping.codeCol] ?? '').trim() : '';
    list.push({ index, firstName, explicitCode, surname: surnameFrom(row, mapping) });
  });

  const byName = Map.groupBy(list, (l) => l.firstName.toLowerCase());
  for (const group of byName.values()) {
    for (const l of group) l.initial = group.length > 1 ? initialOf(l.surname) : null;
  }
  for (const l of list) {
    const base = l.firstName.toUpperCase();
    l.code = l.explicitCode || (l.initial ? `${base}-${l.initial}` : base);
  }

  // A clash is a shared first name. It's resolved when codes or initials tell them apart.
  const codeCounts = Map.groupBy(list, (l) => l.code);
  const clashes = [...byName.values()].filter((g) => g.length > 1).map((group) => {
    const resolved = group.every((l) => codeCounts.get(l.code).length === 1);
    return {
      firstName: group[0].firstName,
      count: group.length,
      resolved,
      labels: group.map((l) => (l.initial ? `${l.firstName} ${l.initial}.` : l.explicitCode ? `${l.firstName} (${l.explicitCode})` : l.firstName)),
    };
  });

  return {
    learners: new Map(list.map((l) => [l.index, { firstName: l.firstName, initial: l.initial, code: l.code }])),
    clashes,
  };
}

// Builds import rows from the mapping. Blank cells are skipped (absent,
// not yet marked) rather than counted as zero.
export function buildRows(rows, mapping, { subject, term }) {
  const out = [];
  let skippedBlanks = 0;
  const used = mapping.assessments.filter((a) => a.include);
  const { learners } = resolveLearners(rows, mapping);
  rows.forEach((row, index) => {
    const learner = learners.get(index);
    if (!learner) return;
    const { firstName, initial, code } = learner;
    for (const a of used) {
      const mark = row[a.col];
      if (mark == null || String(mark).trim() === '') {
        skippedBlanks++;
        continue;
      }
      out.push({
        learner_code: code,
        first_name: firstName,
        initial,
        subject,
        assessment: a.name,
        term,
        max_mark: a.max ?? '',
        mark,
        weight: a.weight,
        source_row: index + 1,
      });
    }
  });
  return { rows: out, skippedBlanks };
}

// Rows already in the app's own long format (e.g. the downloadable template).
export function longFormatRows(rows) {
  const headers = rows[0].map(normalise);
  return rows.slice(1).filter((r) => r.some(Boolean)).map((r, i) => {
    const record = Object.fromEntries(headers.map((h, c) => [h, r[c]]));
    return { ...record, source_row: i + 2 };
  });
}

// Remembers a mapping per class so next term's import is one click.
const memoryKey = (classId) => `rca_import_map_${classId}`;

export function rememberMapping(classId, headers, mapping, subject) {
  try {
    localStorage.setItem(memoryKey(classId), JSON.stringify({
      nameHeader: headers[mapping.nameCol],
      nameFormat: mapping.nameFormat,
      codeHeader: mapping.codeCol >= 0 ? headers[mapping.codeCol] : null,
      surnameHeader: mapping.surnameCol >= 0 ? headers[mapping.surnameCol] : null,
      subject,
      assessments: Object.fromEntries(mapping.assessments.map((a) => [a.header, { include: a.include, name: a.name, max: a.max, weight: a.weight }])),
    }));
  } catch { /* nice to have only */ }
}

export function recallMapping(classId, headers, mapping) {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(memoryKey(classId)) ?? 'null'); } catch { saved = null; }
  if (!saved) return { mapping, subject: null, recalled: false };
  const nameCol = headers.indexOf(saved.nameHeader);
  const codeCol = saved.codeHeader ? headers.indexOf(saved.codeHeader) : -1;
  let matched = 0;
  const assessments = mapping.assessments.map((a) => {
    const s = saved.assessments[a.header];
    if (!s) return a;
    matched++;
    return { ...a, ...s };
  });
  if (nameCol < 0 && matched === 0) return { mapping, subject: null, recalled: false };
  return {
    mapping: {
      ...mapping,
      nameCol: nameCol >= 0 ? nameCol : mapping.nameCol,
      nameFormat: saved.nameFormat ?? mapping.nameFormat,
      codeCol: saved.codeHeader ? codeCol : mapping.codeCol,
      surnameCol: saved.surnameHeader ? headers.indexOf(saved.surnameHeader) : mapping.surnameCol,
      assessments,
    },
    subject: saved.subject,
    recalled: true,
  };
}
