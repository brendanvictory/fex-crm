import { Router } from 'express';
import { randomBytes } from 'crypto';

const r = Router();

// ---- Lookup data for dropdowns (all respect RLS via req.sb) ----
r.get('/statuses', async (req, res) => {
  const { data, error } = await req.sb.from('lead_statuses').select('*').order('sort_order');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

r.get('/dispositions', async (req, res) => {
  const { data, error } = await req.sb.from('call_dispositions').select('*').order('name');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
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

export default r;
