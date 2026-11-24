import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import classRoutes from './routes/classes.js';
import styleExampleRoutes from './routes/styleExamples.js';
import { commentRoutes } from './routes/comments.js';
import { requireAuth } from './middleware/auth.js';

export const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/classes', requireAuth, classRoutes);
app.use('/api/style-examples', requireAuth, styleExampleRoutes);
app.use('/api/comments', requireAuth, commentRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Express 5 forwards rejected async handlers here.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});
