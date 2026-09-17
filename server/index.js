import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabaseAdmin, supabaseForToken } from './supabase.js';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// API routes  (everything under /api)
// ---------------------------------------------------------------------------

// Health check — Render pings this, and it's handy for a quick "is it up?"
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// Verify the Supabase JWT the client sends on each request.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing token' });
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: 'invalid token' });
  req.user = data.user;
  req.token = token;
  next();
}

// Return the logged-in user's profile row. We query with a client scoped to
// THEIR token, so Row-Level Security applies exactly as it will everywhere.
app.get('/api/me', requireAuth, async (req, res) => {
  const sb = supabaseForToken(req.token);
  const { data, error } = await sb.from('users').select('*').eq('id', req.user.id).single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ auth: { id: req.user.id, email: req.user.email }, profile: data });
});

// ---------------------------------------------------------------------------
// Serve the built React app (client/dist) for everything else.
// ---------------------------------------------------------------------------
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`FEX CRM running on port ${port}`));
