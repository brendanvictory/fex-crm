import { Router } from 'express';
import { randomBytes } from 'crypto';
import { supabaseAdmin } from '../supabase.js';

const r = Router();

async function admin(userId) {
  const { data } = await supabaseAdmin.from('users').select('id, role, org_id').eq('id', userId).single();
  return data && ['admin', 'super_admin'].includes(data.role) ? data : null;
}
function toE164(raw) {
  if (!raw) return null;
  const d = String(raw).replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return d;
  const digits = d.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return digits ? '+' + digits : null;
}
function cleanStates(v) {
  if (Array.isArray(v)) return v.map((s) => String(s).toUpperCase().slice(0, 2)).filter(Boolean);
  if (typeof v === 'string') return v.split(/[,\s]+/).map((s) => s.toUpperCase().slice(0, 2)).filter(Boolean);
  return [];
}

// GET /api/campaigns — list with vendor name + lifetime counts.
r.get('/', async (req, res) => {
  const me = await admin(req.user.id);
  if (!me) return res.status(403).json({ error: 'admins only' });
  const { data, error } = await supabaseAdmin.from('campaigns')
    .select('*, lead_sources(name)').eq('org_id', me.org_id).order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  const withCounts = await Promise.all((data || []).map(async (c) => {
    const { count: total } = await supabaseAdmin.from('inbound_calls').select('id', { count: 'exact', head: true }).eq('campaign_id', c.id);
    const { count: billable } = await supabaseAdmin.from('inbound_calls').select('id', { count: 'exact', head: true }).eq('campaign_id', c.id).eq('billable', true);
    return { ...c, total_calls: total || 0, billable_calls: billable || 0 };
  }));
  res.json(withCounts);
});

r.get('/:id', async (req, res) => {
  const me = await admin(req.user.id);
  if (!me) return res.status(403).json({ error: 'admins only' });
  const { data, error } = await supabaseAdmin.from('campaigns')
    .select('*').eq('id', req.params.id).eq('org_id', me.org_id).single();
  if (error) return res.status(404).json({ error: error.message });
  res.json(data);
});

r.post('/', async (req, res) => {
  const me = await admin(req.user.id);
  if (!me) return res.status(403).json({ error: 'admins only' });
  const b = req.body;
  if (!b.name) return res.status(400).json({ error: 'name required' });
  const row = {
    org_id: me.org_id,
    source_id: b.source_id || null,
    name: b.name,
    type: b.type === 'direct' ? 'direct' : 'ping',
    cost_per_call: Number(b.cost_per_call) || 0,
    buffer_seconds: Number(b.buffer_seconds) || 90,
    daily_cap: b.daily_cap === '' || b.daily_cap == null ? null : Number(b.daily_cap),
    monthly_cap: b.monthly_cap === '' || b.monthly_cap == null ? null : Number(b.monthly_cap),
    concurrency_cap: b.concurrency_cap === '' || b.concurrency_cap == null ? null : Number(b.concurrency_cap),
    dupe_window_hours: Number(b.dupe_window_hours) || 72,
    states: cleanStates(b.states),
    phone_number: toE164(b.phone_number),
    ping_key: 'png_' + randomBytes(18).toString('hex'),
    is_active: b.is_active !== false
  };
  const { data, error } = await supabaseAdmin.from('campaigns').insert(row).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

r.patch('/:id', async (req, res) => {
  const me = await admin(req.user.id);
  if (!me) return res.status(403).json({ error: 'admins only' });
  const b = req.body;
  const patch = {};
  for (const k of ['name', 'source_id', 'type', 'is_active']) if (k in b) patch[k] = b[k];
  if ('type' in patch) patch.type = patch.type === 'direct' ? 'direct' : 'ping';
  if ('source_id' in patch && !patch.source_id) patch.source_id = null;
  for (const k of ['cost_per_call', 'buffer_seconds', 'dupe_window_hours']) if (k in b) patch[k] = Number(b[k]) || 0;
  for (const k of ['daily_cap', 'monthly_cap', 'concurrency_cap']) if (k in b) patch[k] = (b[k] === '' || b[k] == null) ? null : Number(b[k]);
  if ('states' in b) patch.states = cleanStates(b.states);
  if ('phone_number' in b) patch.phone_number = toE164(b.phone_number);
  const { data, error } = await supabaseAdmin.from('campaigns')
    .update(patch).eq('id', req.params.id).eq('org_id', me.org_id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

r.post('/:id/rotate-key', async (req, res) => {
  const me = await admin(req.user.id);
  if (!me) return res.status(403).json({ error: 'admins only' });
  const { data, error } = await supabaseAdmin.from('campaigns')
    .update({ ping_key: 'png_' + randomBytes(18).toString('hex') })
    .eq('id', req.params.id).eq('org_id', me.org_id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

r.delete('/:id', async (req, res) => {
  const me = await admin(req.user.id);
  if (!me) return res.status(403).json({ error: 'admins only' });
  const { error } = await supabaseAdmin.from('campaigns').delete().eq('id', req.params.id).eq('org_id', me.org_id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

export default r;
