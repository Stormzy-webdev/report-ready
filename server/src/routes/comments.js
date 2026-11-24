import { Router } from 'express';
import { query } from '../db.js';
import { getClassSummary } from '../lib/summary.js';
import { generateDrafts } from '../lib/generate.js';
import { draftComment, aiConfigured, aiDescription, AiSetupError } from '../lib/ai.js';
import { FORMATS } from '../lib/exporters.js';

function parseTerm(req, res) {
  const term = Number(req.query.term);
  if (!Number.isInteger(term) || term < 1 || term > 4) {
    res.status(400).json({ error: 'term must be 1, 2, 3 or 4' });
    return null;
  }
  return term;
}

// General comments only for now (subject_id IS NULL).
async function listComments(classId, term) {
  const { rows } = await query(
    `SELECT l.id AS learner_id, c.id, c.draft_text, c.final_text, c.status
     FROM learners l
     LEFT JOIN comments c ON c.learner_id = l.id AND c.subject_id IS NULL AND c.term = $2
     WHERE l.class_id = $1`,
    [classId, term],
  );
  return new Map(rows.map((r) => [r.learner_id, r]));
}

// Mounted under /api/classes/:id after the ownership check, so req.class is
// always the logged-in teacher's class.
export const classCommentRoutes = Router();

classCommentRoutes.get('/comments', async (req, res) => {
  const term = parseTerm(req, res);
  if (!term) return;
  const [learners, comments] = await Promise.all([
    getClassSummary(req.class.id, term),
    listComments(req.class.id, term),
  ]);
  const items = learners.map((learner) => {
    const c = comments.get(learner.learner_id);
    return {
      ...learner,
      comment_id: c?.id ?? null,
      draft_text: c?.draft_text ?? null,
      text: c?.final_text ?? c?.draft_text ?? '',
      status: c?.id ? c.status : null,
    };
  });
  res.json({
    term,
    total: items.length,
    approved: items.filter((i) => i.status === 'approved').length,
    ai_configured: aiConfigured(),
    ai_description: aiDescription(),
    learners: items,
  });
});

// Drafts a comment for every learner who doesn't have one yet (or whose
// earlier draft failed). Never overwrites text the teacher has written.
classCommentRoutes.post('/comments/generate', async (req, res) => {
  const term = parseTerm(req, res);
  if (!term) return;
  if (!aiConfigured()) {
    return res.status(503).json({ error: 'AI drafting is not set up: add ANTHROPIC_API_KEY to server/.env, or set AI_PROVIDER=ollama' });
  }

  const { rows: examples } = await query(
    'SELECT text FROM style_examples WHERE teacher_id = $1 ORDER BY id',
    [req.teacherId],
  );
  if (examples.length === 0) {
    return res.status(400).json({ error: 'Add at least one example comment on the My style page first' });
  }

  const [learners, comments] = await Promise.all([
    getClassSummary(req.class.id, term),
    listComments(req.class.id, term),
  ]);
  const todo = learners.filter((l) => {
    const c = comments.get(l.learner_id);
    return !c?.id || (!c.draft_text && !c.final_text);
  });

  let results;
  try {
    results = await generateDrafts(todo, {
      grade: req.class.grade,
      term,
      styleExamples: examples.map((e) => e.text),
      draft: draftComment,
    });
  } catch (err) {
    if (err instanceof AiSetupError) return res.status(503).json({ error: err.message });
    throw err;
  }

  // Failed learners get an empty row so the teacher can write theirs by hand.
  await query(
    `INSERT INTO comments (learner_id, subject_id, term, draft_text)
     SELECT learner_id, NULL, $1, draft_text FROM unnest($2::int[], $3::text[]) AS t(learner_id, draft_text)
     ON CONFLICT (learner_id, subject_id, term) DO UPDATE
       SET draft_text = EXCLUDED.draft_text, updated_at = now()
       WHERE comments.draft_text IS NULL AND comments.final_text IS NULL`,
    [term, results.map((r) => r.learner_id), results.map((r) => r.text)],
  );

  res.json({
    drafted: results.filter((r) => r.text).length,
    failed: results.filter((r) => !r.text).length,
    skipped: learners.length - todo.length,
  });
});

// ?format=csv (default) | xlsx | docx. PDF is printed from the browser.
classCommentRoutes.get('/export', async (req, res) => {
  const term = parseTerm(req, res);
  if (!term) return;
  const format = FORMATS[req.query.format ?? 'csv'];
  if (!format) return res.status(400).json({ error: 'format must be csv, xlsx or docx' });
  const { rows } = await query(
    `SELECT l.learner_code, l.first_name, l.initial, c.final_text AS comment
     FROM comments c JOIN learners l ON l.id = c.learner_id
     WHERE l.class_id = $1 AND c.term = $2 AND c.subject_id IS NULL AND c.status = 'approved'
     ORDER BY l.first_name, l.initial NULLS FIRST, l.learner_code`,
    [req.class.id, term],
  );
  const { name, grade, year } = req.class;
  const file = await format.build(rows, { className: name, grade, year, term });
  const filename = `${name}-${year}-term${term}-comments.${format.ext}`.replace(/[^\w.-]/g, '_');
  res.setHeader('Content-Type', format.type);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(file);
});

// /api/comments/:id: edit, approve or redraft a single comment.
export const commentRoutes = Router();

// The comment plus its class, but only if the class belongs to the logged-in teacher.
async function findOwnedComment(req) {
  const commentId = Number(req.params.id);
  if (!Number.isInteger(commentId)) return null;
  const { rows: [comment] } = await query(
    `SELECT c.*, k.id AS class_id, k.grade FROM comments c
     JOIN learners l ON l.id = c.learner_id
     JOIN classes k ON k.id = l.class_id
     WHERE c.id = $1 AND k.teacher_id = $2`,
    [commentId, req.teacherId],
  );
  return comment ?? null;
}

const asResponse = (row) => ({ ...row, text: row.final_text ?? row.draft_text ?? '' });

// Replaces one comment with a fresh AI draft (and un-approves it).
commentRoutes.post('/:id/redraft', async (req, res) => {
  const comment = await findOwnedComment(req);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (!aiConfigured()) return res.status(503).json({ error: 'AI drafting is not set up' });

  const { rows: examples } = await query(
    'SELECT text FROM style_examples WHERE teacher_id = $1 ORDER BY id',
    [req.teacherId],
  );
  if (examples.length === 0) {
    return res.status(400).json({ error: 'Add at least one example comment on the My style page first' });
  }
  const learner = (await getClassSummary(comment.class_id, comment.term))
    .find((l) => l.learner_id === comment.learner_id);

  let result;
  try {
    [result] = await generateDrafts([learner], {
      grade: comment.grade,
      term: comment.term,
      styleExamples: examples.map((e) => e.text),
      draft: draftComment,
    });
  } catch (err) {
    if (err instanceof AiSetupError) return res.status(503).json({ error: err.message });
    throw err;
  }
  if (!result.text) {
    return res.status(502).json({ error: "The AI couldn't write a usable draft this time. Try again, or write it yourself." });
  }

  const { rows: [updated] } = await query(
    `UPDATE comments SET draft_text = $2, final_text = NULL, status = 'draft', updated_at = now()
     WHERE id = $1 RETURNING id, draft_text, final_text, status`,
    [comment.id, result.text],
  );
  res.json(asResponse(updated));
});

commentRoutes.patch('/:id', async (req, res) => {
  const comment = await findOwnedComment(req);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });

  const { text, approved } = req.body ?? {};
  let finalText = comment.final_text;
  if (text !== undefined) {
    if (typeof text !== 'string') return res.status(400).json({ error: 'text must be a string' });
    finalText = text.trim();
  }
  let status = comment.status;
  if (approved !== undefined) {
    status = approved ? 'approved' : 'draft';
    // Approving without editing accepts the AI draft as the final text.
    finalText ||= comment.draft_text?.trim() || '';
    if (approved && !finalText) {
      return res.status(400).json({ error: 'Write a comment before approving it' });
    }
  }

  const { rows: [updated] } = await query(
    `UPDATE comments SET final_text = $2, status = $3, updated_at = now()
     WHERE id = $1 RETURNING id, draft_text, final_text, status`,
    [comment.id, finalText || null, status],
  );
  res.json(asResponse(updated));
});
