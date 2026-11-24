import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { signToken } from '../middleware/auth.js';

const router = Router();

router.post('/register', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const name = String(req.body?.name ?? '').trim();
  const password = String(req.body?.password ?? '');

  if (!email.includes('@') || !name) {
    return res.status(400).json({ error: 'Name and a valid email are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const { rows } = await query(
      'INSERT INTO teachers (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
      [email, passwordHash, name],
    );
    res.status(201).json({ token: signToken(rows[0]), teacher: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }
    throw err;
  }
});

router.post('/login', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');

  const { rows } = await query('SELECT * FROM teachers WHERE email = $1', [email]);
  const teacher = rows[0];
  if (!teacher || !(await bcrypt.compare(password, teacher.password_hash))) {
    return res.status(401).json({ error: 'Wrong email or password' });
  }
  res.json({
    token: signToken(teacher),
    teacher: { id: teacher.id, email: teacher.email, name: teacher.name },
  });
});

export default router;
