import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';

const r = Router();

// GET /api/presence/me — current agent's inbound status.
r.get('/me', async (req, res) => {
  const { data } = await supabaseAdmin.from('users')
    .select('inbound_status, inbound_status_at').eq('id', req.user.id).single();
  res.json(data || { inbound_status: 'away' });
});

// POST /api/presence — set my status ('available' | 'away'). Also a heartbeat.
r.post('/', async (req, res) => {
  const status = ['available', 'away'].includes(req.body.status) ? req.body.status : null;
  const patch = { last_seen_at: new Date().toISOString() };
  if (status) { patch.inbound_status = status; patch.inbound_status_at = patch.last_seen_at; }
  const { data, error } = await supabaseAdmin.from('users')
    .update(patch).eq('id', req.user.id).select('inbound_status').single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// POST /api/presence/heartbeat — keep "available" from going stale while idle.
r.post('/heartbeat', async (req, res) => {
  await supabaseAdmin.from('users').update({ last_seen_at: new Date().toISOString() }).eq('id', req.user.id);
  res.json({ ok: true });
});

// GET /api/presence/roster — who's available (managers/admins).
r.get('/roster', async (req, res) => {
  const { data: me } = await supabaseAdmin.from('users').select('role, org_id').eq('id', req.user.id).single();
  if (!me || !['manager', 'admin', 'super_admin'].includes(me.role)) return res.status(403).json({ error: 'not allowed' });
  const { data } = await supabaseAdmin.from('users')
    .select('id, full_name, inbound_status, inbound_status_at')
    .eq('org_id', me.org_id).eq('is_active', true).order('full_name');
  res.json(data || []);
});

export default r;
