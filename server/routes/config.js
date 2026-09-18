import { Router } from 'express';

const r = Router();

// Lookup data the UI needs for dropdowns. All respect RLS via req.sb.

r.get('/statuses', async (req, res) => {
  const { data, error } = await req.sb
    .from('lead_statuses').select('*').order('sort_order');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

r.get('/dispositions', async (req, res) => {
  const { data, error } = await req.sb
    .from('call_dispositions').select('*').order('name');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

r.get('/sources', async (req, res) => {
  const { data, error } = await req.sb
    .from('lead_sources').select('*').order('name');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

r.get('/agents', async (req, res) => {
  const { data, error } = await req.sb
    .from('users').select('id, full_name, role').order('full_name');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

export default r;
