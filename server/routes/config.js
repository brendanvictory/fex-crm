import { Router } from 'express';
import { randomBytes } from 'crypto';
import { supabaseAdmin } from '../supabase.js';

const r = Router();

// Gate helper for dialer config writes (lists/scripts): admin/manager/super.
async function canManage(userId) {
  const { data } = await supabaseAdmin.from('users').select('id, role, org_id').eq('id', userId).single();
  return data && ['super_admin', 'admin', 'manager'].includes(data.role) ? data : null;
}
async function myOrg(userId) {
  const { data } = await supabaseAdmin.from('users').select('org_id').eq('id', userId).single();
  return data?.org_id || null;
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

// ---- Lookup data for dropdowns (all respect RLS via req.sb) ----
r.get('/statuses', async (req, res) => {
  const { data, error } = await req.sb.from('lead_statuses').select('*').order('sort_order');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

r.post('/statuses', async (req, res) => {
  const body = { name: req.body.name, sort_order: req.body.sort_order ?? 0, is_active: req.body.is_active ?? true, is_default: !!req.body.is_default };
  if (body.is_default) await req.sb.from('lead_statuses').update({ is_default: false }).eq('is_default', true);
  const { data, error } = await req.sb.from('lead_statuses').insert(body).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

r.patch('/statuses/:id', async (req, res) => {
  const patch = {};
  for (const k of ['name', 'sort_order', 'is_active', 'is_default']) if (k in req.body) patch[k] = req.body[k];
  if (patch.is_default) await req.sb.from('lead_statuses').update({ is_default: false }).neq('id', req.params.id);
  const { data, error } = await req.sb.from('lead_statuses').update(patch).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

r.delete('/statuses/:id', async (req, res) => {
  const { error } = await req.sb.from('lead_statuses').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

r.get('/dispositions', async (req, res) => {
  const { data, error } = await req.sb.from('call_dispositions').select('*').order('name');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

r.post('/dispositions', async (req, res) => {
  const body = { name: req.body.name, maps_to_status_id: req.body.maps_to_status_id || null, is_active: req.body.is_active ?? true };
  const { data, error } = await req.sb.from('call_dispositions').insert(body).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

r.patch('/dispositions/:id', async (req, res) => {
  const patch = {};
  for (const k of ['name', 'maps_to_status_id', 'is_active']) if (k in req.body) patch[k] = req.body[k];
  const { data, error } = await req.sb.from('call_dispositions').update(patch).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

r.delete('/dispositions/:id', async (req, res) => {
  const { error } = await req.sb.from('call_dispositions').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

r.get('/agents', async (req, res) => {
  const { data, error } = await req.sb.from('users').select('id, full_name, role').order('full_name');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ---- Lead sources (admin-managed; writes gated by RLS) ----
r.get('/sources', async (req, res) => {
  const { data, error } = await req.sb.from('lead_sources').select('*').order('name');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

r.post('/sources', async (req, res) => {
  const { data: me, error: meErr } = await req.sb
    .from('users').select('org_id').eq('id', req.user.id).single();
  if (meErr) return res.status(400).json({ error: meErr.message });

  const body = { ...req.body, org_id: me.org_id };
  if (!body.api_key) body.api_key = 'src_' + randomBytes(18).toString('hex');

  const { data, error } = await req.sb.from('lead_sources').insert(body).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

r.patch('/sources/:id', async (req, res) => {
  const patch = { ...req.body };
  delete patch.id;
  delete patch.org_id;
  const { data, error } = await req.sb
    .from('lead_sources').update(patch).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

r.post('/sources/:id/rotate-key', async (req, res) => {
  const key = 'src_' + randomBytes(18).toString('hex');
  const { data, error } = await req.sb
    .from('lead_sources').update({ api_key: key }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ---- Twilio phone numbers (local-presence caller IDs) ----
r.get('/numbers', async (req, res) => {
  const { data, error } = await req.sb.from('phone_numbers').select('*').order('state');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

r.post('/numbers', async (req, res) => {
  const { data: me, error: meErr } = await req.sb
    .from('users').select('org_id').eq('id', req.user.id).single();
  if (meErr) return res.status(400).json({ error: meErr.message });
  const row = {
    org_id: me.org_id,
    number: toE164(req.body.number),
    state: req.body.state ? String(req.body.state).toUpperCase().slice(0, 2) : null,
    label: req.body.label || null,
    is_active: req.body.is_active ?? true
  };
  if (!row.number) return res.status(400).json({ error: 'valid number required' });
  const { data, error } = await req.sb.from('phone_numbers').insert(row).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

r.delete('/numbers/:id', async (req, res) => {
  const { error } = await req.sb.from('phone_numbers').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

// ---- Dial lists (served via service role so agents can pick them) ----
r.get('/lists', async (req, res) => {
  const org = await myOrg(req.user.id);
  const { data, error } = await supabaseAdmin.from('lead_lists')
    .select('*').eq('org_id', org).order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  // attach lead counts so the UI can show which lists actually have leads
  const withCounts = await Promise.all((data || []).map(async (l) => {
    const { count } = await supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }).eq('list_id', l.id);
    return { ...l, lead_count: count || 0 };
  }));
  res.json(withCounts);
});
r.post('/lists', async (req, res) => {
  const me = await canManage(req.user.id);
  if (!me) return res.status(403).json({ error: 'not permitted' });
  const { data, error } = await supabaseAdmin.from('lead_lists')
    .insert({ org_id: me.org_id, name: req.body.name, created_by: me.id }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});
r.delete('/lists/:id', async (req, res) => {
  const me = await canManage(req.user.id);
  if (!me) return res.status(403).json({ error: 'not permitted' });
  const { error } = await supabaseAdmin.from('lead_lists').delete().eq('id', req.params.id).eq('org_id', me.org_id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

// ---- Scripts ----
r.get('/scripts', async (req, res) => {
  const org = await myOrg(req.user.id);
  const { data, error } = await supabaseAdmin.from('scripts')
    .select('*').eq('org_id', org).order('name');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});
r.post('/scripts', async (req, res) => {
  const me = await canManage(req.user.id);
  if (!me) return res.status(403).json({ error: 'not permitted' });
  const { data, error } = await supabaseAdmin.from('scripts')
    .insert({ org_id: me.org_id, name: req.body.name, body: req.body.body || '', is_active: req.body.is_active ?? true })
    .select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});
r.patch('/scripts/:id', async (req, res) => {
  const me = await canManage(req.user.id);
  if (!me) return res.status(403).json({ error: 'not permitted' });
  const patch = {};
  for (const k of ['name', 'body', 'is_active']) if (k in req.body) patch[k] = req.body[k];
  const { data, error } = await supabaseAdmin.from('scripts')
    .update(patch).eq('id', req.params.id).eq('org_id', me.org_id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});
r.delete('/scripts/:id', async (req, res) => {
  const me = await canManage(req.user.id);
  if (!me) return res.status(403).json({ error: 'not permitted' });
  const { error } = await supabaseAdmin.from('scripts').delete().eq('id', req.params.id).eq('org_id', me.org_id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

export default r;
