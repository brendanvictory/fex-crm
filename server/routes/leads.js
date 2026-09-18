import { Router } from 'express';

const r = Router();

// GET /api/leads  — list, with optional filters. RLS decides what's visible.
//   ?status= &source= &owner= &state= &from= &to= &search=
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
    q = q.or(
      `first_name.ilike.%${s}%,last_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`
    );
  }

  const { data, error } = await q;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// GET /api/leads/:id
r.get('/:id', async (req, res) => {
  const { data, error } = await req.sb
    .from('leads')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: error.message });
  res.json(data);
});

// GET /api/leads/:id/activity — the lead's timeline.
r.get('/:id/activity', async (req, res) => {
  const { data, error } = await req.sb
    .from('activity_log')
    .select('*')
    .eq('entity_type', 'lead')
    .eq('entity_id', req.params.id)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// POST /api/leads — create. org_id comes from the creator; default status applied.
r.post('/', async (req, res) => {
  const { data: me, error: meErr } = await req.sb
    .from('users').select('org_id').eq('id', req.user.id).single();
  if (meErr) return res.status(400).json({ error: meErr.message });

  const body = { ...req.body, org_id: me.org_id };
  delete body.id;

  if (!body.status_id) {
    const { data: st } = await req.sb
      .from('lead_statuses').select('id').eq('is_default', true).limit(1).maybeSingle();
    if (st) body.status_id = st.id;
  }

  const { data, error } = await req.sb.from('leads').insert(body).select().single();
  if (error) return res.status(400).json({ error: error.message });

  await req.sb.from('activity_log').insert({
    org_id: me.org_id, entity_type: 'lead', entity_id: data.id,
    actor_id: req.user.id, action: 'created'
  });
  res.json(data);
});

// PATCH /api/leads/:id — update any fields. Logs the change.
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

export default r;
