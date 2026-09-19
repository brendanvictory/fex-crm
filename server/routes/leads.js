import { Router } from 'express';
import { normalizeRecord, prepareLead } from '../lib/leads.js';
import { supabaseAdmin } from '../supabase.js';

const r = Router();

// GET /api/leads  — list, with optional filters. RLS decides what's visible.
r.get('/', async (req, res) => {
  const { status, source, owner, state, from, to, search } = req.query;
  let q = req.sb
    .from('leads')
    .select('*, lead_statuses(name), lead_sources(name), owner:users(full_name)')
    .order('created_at', { ascending: false })
    .limit(500);

  if (status) q = q.eq('status_id', status);
  if (source) q = q.eq('source_id', source);
  if (owner) q = q.eq('owner_id', owner);
  if (state) q = q.eq('state', state.toUpperCase());
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', to);
  if (search) {
    const s = search.replace(/[%,]/g, '');
    q = q.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`);
  }

  const { data, error } = await q;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// POST /api/leads/bulk — CSV bulk upload. Body: { rows: [...], source_id? }.
// Uses the same dedupe/assignment path as the ingest API.
r.post('/bulk', async (req, res) => {
  const { rows, source_id, list_name } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows must be an array' });

  const { data: me, error: meErr } = await supabaseAdmin
    .from('users').select('id, org_id').eq('id', req.user.id).single();
  if (meErr) return res.status(400).json({ error: meErr.message });

  let source = null;
  if (source_id) {
    const { data: s } = await supabaseAdmin.from('lead_sources').select('*').eq('id', source_id).maybeSingle();
    source = s;
  }

  let listId = null;
  if (list_name && list_name.trim()) {
    const { data: list } = await supabaseAdmin.from('lead_lists')
      .insert({ org_id: me.org_id, name: list_name.trim(), created_by: me.id }).select('id').single();
    listId = list?.id || null;
  }

  let created = 0, duplicates = 0;
  const errors = [];
  for (let i = 0; i < rows.length; i++) {
    try {
      const input = normalizeRecord(rows[i]);
      const { record, duplicate } = await prepareLead(supabaseAdmin, source, input, me.org_id);
      if (duplicate) { duplicates++; continue; }
      if (listId) record.list_id = listId;
      const { data, error } = await supabaseAdmin.from('leads').insert(record).select('id').single();
      if (error) { errors.push({ row: i + 1, error: error.message }); continue; }
      created++;
      await supabaseAdmin.from('activity_log').insert({
        org_id: me.org_id, entity_type: 'lead', entity_id: data.id,
        actor_id: req.user.id, action: 'created', detail: { via: 'bulk_upload' }
      });
    } catch (e) {
      errors.push({ row: i + 1, error: e.message });
    }
  }
  res.json({ total: rows.length, created, duplicates, errors });
});

// GET /api/leads/:id
r.get('/:id', async (req, res) => {
  const { data, error } = await req.sb
    .from('leads').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: error.message });
  res.json(data);
});

// GET /api/leads/:id/activity
r.get('/:id/activity', async (req, res) => {
  const { data, error } = await req.sb
    .from('activity_log').select('*')
    .eq('entity_type', 'lead').eq('entity_id', req.params.id)
    .order('created_at', { ascending: false }).limit(200);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// POST /api/leads — create one from the UI. Uses the trusted server key and
// forces the lead into the caller's own org (same trust model as ingest), which
// avoids the RLS WITH CHECK on user-session inserts.
r.post('/', async (req, res) => {
  const { data: me, error: meErr } = await supabaseAdmin
    .from('users').select('org_id').eq('id', req.user.id).single();
  if (meErr) return res.status(400).json({ error: meErr.message });

  const body = { ...req.body, org_id: me.org_id };
  delete body.id;
  if (!body.status_id) {
    const { data: st } = await supabaseAdmin
      .from('lead_statuses').select('id').eq('is_default', true).limit(1).maybeSingle();
    if (st) body.status_id = st.id;
  }

  const { data, error } = await supabaseAdmin.from('leads').insert(body).select().single();
  if (error) return res.status(400).json({ error: error.message });
  await supabaseAdmin.from('activity_log').insert({
    org_id: me.org_id, entity_type: 'lead', entity_id: data.id,
    actor_id: req.user.id, action: 'created'
  });
  res.json(data);
});

// PATCH /api/leads/:id
r.patch('/:id', async (req, res) => {
  const patch = { ...req.body, updated_at: new Date().toISOString() };
  delete patch.id;
  delete patch.org_id;

  const { data, error } = await req.sb
    .from('leads').update(patch).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  await req.sb.from('activity_log').insert({
    org_id: data.org_id, entity_type: 'lead', entity_id: data.id,
    actor_id: req.user.id, action: 'updated', detail: req.body
  });
  res.json(data);
});

// POST /api/leads/:id/move — kanban move: change status and/or claim.
// Trusted-key write with authorization enforced in code.
r.post('/:id/move', async (req, res) => {
  const { status_id, claim } = req.body;
  const { data: me, error: me2 } = await supabaseAdmin
    .from('users').select('id, role, org_id').eq('id', req.user.id).single();
  if (me2) return res.status(400).json({ error: me2.message });

  const { data: lead, error: le } = await supabaseAdmin
    .from('leads').select('id, org_id, owner_id').eq('id', req.params.id).single();
  if (le) return res.status(404).json({ error: le.message });
  if (lead.org_id !== me.org_id && me.role !== 'super_admin')
    return res.status(403).json({ error: 'out of scope' });

  let allowed = ['super_admin', 'admin'].includes(me.role)
    || lead.owner_id === me.id
    || (claim && !lead.owner_id);
  if (!allowed && me.role === 'manager' && lead.owner_id) {
    const { data: ag } = await supabaseAdmin
      .from('users').select('id').eq('id', lead.owner_id).eq('manager_id', me.id).maybeSingle();
    allowed = !!ag;
  }
  if (!allowed) return res.status(403).json({ error: 'not permitted' });

  const patch = { updated_at: new Date().toISOString() };
  if (status_id) patch.status_id = status_id;
  const claimed = claim && !lead.owner_id;
  if (claimed) patch.owner_id = me.id;

  const { data, error } = await supabaseAdmin
    .from('leads').update(patch).eq('id', lead.id).select().single();
  if (error) return res.status(400).json({ error: error.message });

  await supabaseAdmin.from('activity_log').insert({
    org_id: lead.org_id, entity_type: 'lead', entity_id: lead.id,
    actor_id: me.id, action: claimed ? 'claimed_and_moved' : 'status_changed',
    detail: { status_id }
  });
  res.json(data);
});

export default r;
