import { Router } from 'express';

const r = Router();

const withReminder = (scheduled_at, reminder_minutes) => {
  if (!scheduled_at) return null;
  const mins = Number(reminder_minutes || 0);
  return new Date(new Date(scheduled_at).getTime() - mins * 60000).toISOString();
};

// GET /api/callbacks — list. Filters: from, to, agent, kind, lead, completed.
// Default (no from/to): upcoming and not completed.
r.get('/', async (req, res) => {
  const { from, to, agent, kind, lead, completed } = req.query;
  let q = req.sb
    .from('callbacks')
    .select('*, lead:leads(first_name,last_name,phone,state), agent:users(full_name)')
    .order('scheduled_at', { ascending: true })
    .limit(1000);

  if (from) q = q.gte('scheduled_at', from);
  if (to) q = q.lte('scheduled_at', to);
  if (!from && !to) q = q.gte('scheduled_at', new Date(Date.now() - 12 * 3600e3).toISOString());
  if (agent) q = q.eq('agent_id', agent);
  if (kind) q = q.eq('kind', kind);
  if (lead) q = q.eq('lead_id', lead);
  if (completed === 'true') q = q.eq('completed', true);
  if (completed === 'false') q = q.eq('completed', false);

  const { data, error } = await q;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// POST /api/callbacks — schedule a callback or appointment for a lead.
r.post('/', async (req, res) => {
  const { lead_id, kind = 'callback', title, scheduled_at, duration_minutes = 30, reminder_minutes = 30, notes, agent_id } = req.body;
  if (!lead_id || !scheduled_at) return res.status(400).json({ error: 'lead_id and scheduled_at required' });

  const { data: lead, error: le } = await req.sb
    .from('leads').select('org_id, owner_id').eq('id', lead_id).single();
  if (le) return res.status(400).json({ error: le.message });

  const row = {
    lead_id, org_id: lead.org_id, kind, title: title || null,
    scheduled_at, duration_minutes, reminder_minutes,
    remind_at: withReminder(scheduled_at, reminder_minutes),
    notes: notes || null,
    agent_id: agent_id || lead.owner_id || req.user.id,
    completed: false
  };

  const { data, error } = await req.sb.from('callbacks').insert(row).select().single();
  if (error) return res.status(400).json({ error: error.message });

  await req.sb.from('activity_log').insert({
    org_id: lead.org_id, entity_type: 'lead', entity_id: lead_id,
    actor_id: req.user.id, action: `${kind}_scheduled`,
    detail: { scheduled_at, title }
  });
  res.status(201).json(data);
});

// PATCH /api/callbacks/:id — reschedule, complete, edit.
r.patch('/:id', async (req, res) => {
  const patch = { ...req.body };
  delete patch.id;
  delete patch.org_id;
  if ('scheduled_at' in patch || 'reminder_minutes' in patch) {
    const { data: cur } = await req.sb.from('callbacks').select('scheduled_at, reminder_minutes').eq('id', req.params.id).single();
    patch.remind_at = withReminder(
      patch.scheduled_at || cur?.scheduled_at,
      'reminder_minutes' in patch ? patch.reminder_minutes : cur?.reminder_minutes
    );
  }
  const { data, error } = await req.sb
    .from('callbacks').update(patch).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/callbacks/:id
r.delete('/:id', async (req, res) => {
  const { error } = await req.sb.from('callbacks').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

export default r;
