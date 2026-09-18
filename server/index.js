import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireAuth } from './auth.js';
import leadsRouter from './routes/leads.js';
import configRouter from './routes/config.js';
import ingestRouter from './routes/ingest.js';
import usersRouter from './routes/users.js';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' })); // bulk uploads can be large

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// PUBLIC: external lead vendors post here (auth is the source's API key).
app.use('/api/ingest', ingestRouter);

app.get('/api/me', requireAuth, async (req, res) => {
  const { data, error } = await req.sb
    .from('users').select('*').eq('id', req.user.id).single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ auth: { id: req.user.id, email: req.user.email }, profile: data });
});

app.use('/api/leads', requireAuth, leadsRouter);
app.use('/api/config', requireAuth, configRouter);
app.use('/api/users', requireAuth, usersRouter);

// ---------------------------------------------------------------------------
// Serve the built React app
// ---------------------------------------------------------------------------
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Coverwise CRM running on port ${port}`));
