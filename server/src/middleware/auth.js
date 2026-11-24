import jwt from 'jsonwebtoken';
import { query } from '../db.js';

export function signToken(teacher) {
  return jwt.sign({ sub: teacher.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

export async function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Session expired, please log in again' });
  }
  // A valid token can outlive its account (deleted, or the demo was re-seeded).
  // Treat that as logged out instead of showing an empty account.
  const { rowCount } = await query('SELECT 1 FROM teachers WHERE id = $1', [payload.sub]);
  if (rowCount === 0) {
    return res.status(401).json({ error: 'This account no longer exists, please log in again' });
  }
  req.teacherId = payload.sub;
  next();
}

// Loads :id as req.class, but only if it belongs to the logged-in teacher.
// Answers 404 rather than 403 so other teachers' class ids aren't revealed.
export async function loadOwnedClass(req, res, next) {
  const classId = Number(req.params.id);
  if (!Number.isInteger(classId)) {
    return res.status(404).json({ error: 'Class not found' });
  }
  const { rows } = await query(
    'SELECT * FROM classes WHERE id = $1 AND teacher_id = $2',
    [classId, req.teacherId],
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Class not found' });
  }
  req.class = rows[0];
  next();
}
