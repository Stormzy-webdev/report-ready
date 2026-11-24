import { Router } from 'express';
import { query } from '../db.js';
import { anonymiseExample, NAME } from '../lib/prompt.js';

const MAX_EXAMPLES = 10;
const MAX_LENGTH = 1000;

const router = Router();

router.get('/', async (req, res) => {
  const { rows } = await query(
    'SELECT id, text FROM style_examples WHERE teacher_id = $1 ORDER BY id',
    [req.teacherId],
  );
  res.json(rows);
});

// Names of the teacher's own learners are swapped for {name} automatically.
// Any other name must be replaced by the teacher, because examples are sent
// to the AI.
router.post('/', async (req, res) => {
  const raw = String(req.body?.text ?? '').trim();
  if (!raw) return res.status(400).json({ error: 'Paste a comment first' });
  if (raw.length > MAX_LENGTH) {
    return res.status(400).json({ error: `Keep each example under ${MAX_LENGTH} characters` });
  }

  const { rows: [{ count }] } = await query(
    'SELECT COUNT(*)::int AS count FROM style_examples WHERE teacher_id = $1',
    [req.teacherId],
  );
  if (count >= MAX_EXAMPLES) {
    return res.status(400).json({ error: `You can keep up to ${MAX_EXAMPLES} examples. Delete one first.` });
  }

  const { rows: names } = await query(
    `SELECT DISTINCT l.first_name FROM learners l
     JOIN classes c ON c.id = l.class_id WHERE c.teacher_id = $1`,
    [req.teacherId],
  );
  const text = anonymiseExample(raw, names.map((n) => n.first_name));
  if (!text.includes(NAME)) {
    return res.status(400).json({
      error: `Replace the learner's name with ${NAME} so no real names are sent to the AI`,
    });
  }

  const { rows: [example] } = await query(
    'INSERT INTO style_examples (teacher_id, text) VALUES ($1, $2) RETURNING id, text',
    [req.teacherId, text],
  );
  res.status(201).json(example);
});

router.delete('/:id', async (req, res) => {
  const { rowCount } = await query(
    'DELETE FROM style_examples WHERE id = $1 AND teacher_id = $2',
    [Number(req.params.id) || 0, req.teacherId],
  );
  if (rowCount === 0) return res.status(404).json({ error: 'Example not found' });
  res.status(204).end();
});

export default router;
