import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';

const r = Router();

// GET /api/queue — the current agent's worklist:
//   due       — callbacks assigned to them, due today or overdue
//   leads     — their owned leads to work (no future callback, not DNC),
//               ordered by pipeline stage then age
//   available — unassigned leads in their org they can claim
r.get('/', async (req, res) => {
  const meId = req.user.id;
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

  const { data: due, error: de } = await req.sb
    .from('callbacks')
    .select('*, lead:leads(id, first_name, last_name, phone, state, lead_statuses(name))')
    .eq('agent_id', meId).eq('completed', false)
    .lte('scheduled_at', todayEnd.toISOString())
    .order('scheduled_at', { ascending: true });
  if (de) return res.status(400).json({ error: de.message });

  const { data: future } = await req.sb
    .from('callbacks').select('lead_id')
    .eq('agent_id', meId).eq('completed', false).gt('scheduled_at', todayEnd.toISOString());
  const futureSet = new Set((future || []).map((f) => f.lead_id));

  const { data: mine, error: le } = await req.sb
    .from('leads')
    .select('id, first_name, last_name, phone, state, created_at, dnc, status_id, lead_statuses(name, sort_order)')
    .eq('owner_id', meId).eq('dnc', false)
    .limit(200);
  if (le) return res.status(400).json({ error: le.message });

  const leads = (mine || [])
    .filter((l) => !futureSet.has(l.id))
    .sort((a, b) => {
      const sa = a.lead_statuses?.sort_order ?? 999, sb = b.lead_statuses?.sort_order ?? 999;
      if (sa !== sb) return sa - sb;
      return new Date(a.created_at) - new Date(b.created_at);
    });

  const { data: available } = await req.sb
    .from('leads')
    .select('id, first_name, last_name, phone, state, created_at, lead_statuses(name)')
    .is('owner_id', null).eq('dnc', false)
    .order('created_at', { ascending: true })
    .limit(50);

  res.json({ due: due || [], leads, available: available || [] });
});

// POST /api/queue/claim/:leadId — assign an unassigned lead to me.
r.post('/claim/:leadId', async (req, res) => {
  const { data: me } = await supabaseAdmin.from('users').select('org_id').eq('id', req.user.id).single();
  const { data: lead } = await supabaseAdmin.from('leads').select('id, org_id, owner_id').eq('id', req.params.leadId).single();
  if (!lead) return res.status(404).json({ error: 'lead not found' });
  if (lead.org_id !== me.org_id) return res.status(403).json({ error: 'out of scope' });
  if (lead.owner_id) return res.status(409).json({ error: 'already assigned' });

  const { data, error } = await supabaseAdmin
    .from('leads').update({ owner_id: req.user.id }).eq('id', lead.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  await supabaseAdmin.from('activity_log').insert({
    org_id: me.org_id, entity_type: 'lead', entity_id: lead.id,
    actor_id: req.user.id, action: 'claimed'
  });
  res.json(data);
});

export default r;
