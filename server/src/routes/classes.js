import { Router } from 'express';
import multer from 'multer';
import { query, withTransaction } from '../db.js';
import { loadOwnedClass } from '../middleware/auth.js';
import { parseCsv, validateRows, summarise } from '../lib/importCsv.js';
import { readSheets, SheetError } from '../lib/sheets.js';
import { getClassSummary } from '../lib/summary.js';
import { classCommentRoutes } from './comments.js';

const router = Router();
// Excel files with formatting are bigger than plain CSV.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/', async (req, res) => {
  // Includes comment progress for the latest term that has any comments,
  // so the class cards can show where the teacher left off.
  const { rows } = await query(
    `SELECT c.*, (SELECT COUNT(*)::int FROM learners l WHERE l.class_id = c.id) AS learner_count,
            p.term AS comments_term, p.approved AS comments_approved
     FROM classes c
     LEFT JOIN LATERAL (
       SELECT cm.term, COUNT(*) FILTER (WHERE cm.status = 'approved')::int AS approved
       FROM comments cm JOIN learners l ON l.id = cm.learner_id
       WHERE l.class_id = c.id AND cm.subject_id IS NULL
       GROUP BY cm.term ORDER BY cm.term DESC LIMIT 1
     ) p ON true
     WHERE c.teacher_id = $1 ORDER BY c.year DESC, c.name`,
    [req.teacherId],
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  const grade = Number(req.body?.grade);
  const year = Number(req.body?.year);
  if (!name || !Number.isInteger(grade) || grade < 1 || grade > 12 || !Number.isInteger(year)) {
    return res.status(400).json({ error: 'Name, grade (1–12) and year are required' });
  }
  const { rows } = await query(
    'INSERT INTO classes (teacher_id, name, grade, year) VALUES ($1, $2, $3, $4) RETURNING *',
    [req.teacherId, name, grade, year],
  );
  res.status(201).json(rows[0]);
});

// Every route below works on one class and goes through the ownership check.
router.use('/:id', loadOwnedClass);

router.get('/:id', async (req, res) => {
  const { rows: subjects } = await query(
    'SELECT id, name FROM subjects WHERE class_id = $1 ORDER BY name',
    [req.class.id],
  );
  res.json({ ...req.class, subjects });
});

// Removes the class and, via ON DELETE CASCADE, its learners, marks and comments.
router.delete('/:id', async (req, res) => {
  await query('DELETE FROM classes WHERE id = $1', [req.class.id]);
  res.status(204).end();
});

router.post('/:id/subjects', async (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (!name) return res.status(400).json({ error: 'Subject name is required' });
  try {
    const { rows } = await query(
      'INSERT INTO subjects (class_id, name) VALUES ($1, $2) RETURNING id, name',
      [req.class.id, name],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: `${name} is already a subject in this class` });
    }
    throw err;
  }
});

// Step 1 of import: parse and validate, save nothing.
router.post('/:id/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Attach a CSV file as "file"' });
  let records;
  try {
    records = parseCsv(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ error: `Could not read the CSV: ${err.message}` });
  }
  const { rows, errors } = validateRows(records);
  res.json({ rows, errors, summary: summarise(rows) });
});

// Reads an uploaded .xlsx/.csv into plain grids so the browser can match
// columns to learners and marks, whatever layout the teacher uses.
router.post('/:id/import/sheet', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a file to upload' });
  try {
    res.json({ sheets: await readSheets(req.file.buffer, req.file.originalname) });
  } catch (err) {
    if (err instanceof SheetError) return res.status(400).json({ error: err.message });
    throw err;
  }
});

// Checks rows built in the browser (from a mapped spreadsheet or pasted
// cells) without saving anything.
router.post('/:id/import/check', (req, res) => {
  const { rows, errors } = validateRows(req.body?.rows);
  res.json({ rows, errors, summary: summarise(rows) });
});

// Step 2 of import: the browser sends back the previewed rows. They are
// validated again here, then saved in one transaction (all or nothing).
router.post('/:id/import/confirm', async (req, res) => {
  const { rows, errors } = validateRows(req.body?.rows);
  if (errors.length) {
    return res.status(400).json({ error: 'Fix the problems in the file first', errors });
  }

  const classId = req.class.id;
  await withTransaction(async (client) => {
    const learnerIds = new Map();
    for (const row of rows) {
      if (learnerIds.has(row.learner_code)) continue;
      const { rows: [learner] } = await client.query(
        `INSERT INTO learners (class_id, first_name, learner_code, initial) VALUES ($1, $2, $3, $4)
         ON CONFLICT (class_id, learner_code) DO UPDATE
           SET first_name = EXCLUDED.first_name, initial = COALESCE(EXCLUDED.initial, learners.initial)
         RETURNING id`,
        [classId, row.first_name, row.learner_code, row.initial],
      );
      learnerIds.set(row.learner_code, learner.id);
    }

    const subjectIds = new Map();
    for (const row of rows) {
      if (subjectIds.has(row.subject)) continue;
      const { rows: [subject] } = await client.query(
        `INSERT INTO subjects (class_id, name) VALUES ($1, $2)
         ON CONFLICT (class_id, name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [classId, row.subject],
      );
      subjectIds.set(row.subject, subject.id);
    }

    const assessmentIds = new Map();
    for (const row of rows) {
      const key = [row.subject, row.term, row.assessment].join('|');
      if (assessmentIds.has(key)) continue;
      const { rows: [assessment] } = await client.query(
        `INSERT INTO assessments (subject_id, term, name, max_mark, weight) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (subject_id, term, name) DO UPDATE SET max_mark = EXCLUDED.max_mark, weight = EXCLUDED.weight
         RETURNING id`,
        [subjectIds.get(row.subject), row.term, row.assessment, row.max_mark, row.weight ?? 1],
      );
      assessmentIds.set(key, assessment.id);
    }

    await client.query(
      `INSERT INTO marks (assessment_id, learner_id, mark)
       SELECT * FROM unnest($1::int[], $2::int[], $3::numeric[])
       ON CONFLICT (assessment_id, learner_id) DO UPDATE SET mark = EXCLUDED.mark`,
      [
        rows.map((r) => assessmentIds.get([r.subject, r.term, r.assessment].join('|'))),
        rows.map((r) => learnerIds.get(r.learner_code)),
        rows.map((r) => r.mark),
      ],
    );
  });

  res.json({ saved: summarise(rows) });
});

router.get('/:id/summary', async (req, res) => {
  const term = Number(req.query.term);
  if (!Number.isInteger(term) || term < 1 || term > 4) {
    return res.status(400).json({ error: 'term must be 1, 2, 3 or 4' });
  }

  res.json({ term, learners: await getClassSummary(req.class.id, term) });
});

router.use('/:id', classCommentRoutes);

export default router;
