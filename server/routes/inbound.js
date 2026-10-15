import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { normalizePhone, stateTimezone } from '../lib/leads.js';

const r = Router();

// Match an inbound caller to an existing lead, or create a fresh one tagged to
// the campaign's source, owned by the answering agent.
async function ensureLead(call, agentId) {
  const norm = normalizePhone(call.from_number);
  const { data: src } = call.campaign_id
    ? await supabaseAdmin.from('campaigns').select('source_id').eq('id', call.campaign_id).single()
    : { data: null };
  const sourceId = call.source_id || src?.source_id || null;

  if (norm) {
    const { data: existing } = await supabaseAdmin.from('leads')
      .select('id, owner_id').eq('org_id', call.org_id)
      .not('phone', 'is', null).ilike('phone', `%${norm.slice(-7)}%`).limit(25);
    const match = (existing || []).find((l) => normalizePhone(l.phone) === norm);
    if (match) {
      // Claim an unowned matched lead to the answering agent.
      if (!match.owner_id) await supabaseAdmin.from('leads').update({ owner_id: agentId, worked: true }).eq('id', match.id);
      return match.id;
    }
  }

  const { data: st } = await supabaseAdmin.from('lead_statuses').select('id').eq('is_default', true).limit(1).maybeSingle();
  const { data: created } = await supabaseAdmin.from('leads').insert({
    org_id: call.org_id, source_id: sourceId, owner_id: agentId,
    phone: call.from_number, state: call.caller_state || null, zip: call.caller_zip || null,
    timezone: stateTimezone(call.caller_state), status_id: st?.id || null,
    worked: true, last_activity_at: new Date().toISOString()
  }).select('id').single();
  return created?.id || null;
}

// POST /api/inbound/:id/answered — the agent's softphone reports it accepted this
// campaign call. First-wins (simul-ring); flips the agent to on_call, and
// creates/matches a lead so the agent can qualify it.
r.post('/:id/answered', async (req, res) => {
  const { data: won } = await supabaseAdmin.from('inbound_calls')
    .update({ agent_id: req.user.id, answered_at: new Date().toISOString(), status: 'answered' })
    .eq('id', req.params.id).is('agent_id', null)
    .select('id, org_id, campaign_id, source_id, from_number, caller_state, caller_zip, lead_id').maybeSingle();
  if (!won) return res.json({ won: false, call: null, lead_id: null });

  await supabaseAdmin.from('users')
    .update({ inbound_status: 'on_call', inbound_status_at: new Date().toISOString() }).eq('id', req.user.id);

  let leadId = won.lead_id;
  if (!leadId) {
    leadId = await ensureLead(won, req.user.id);
    if (leadId) await supabaseAdmin.from('inbound_calls').update({ lead_id: leadId }).eq('id', won.id);
  }
  res.json({ won: true, call: won, lead_id: leadId });
});

// GET /api/inbound/recent — recent inbound calls (managers/admins), for testing/QA.
r.get('/recent', async (req, res) => {
  const { data: me } = await supabaseAdmin.from('users').select('role, org_id').eq('id', req.user.id).single();
  if (!me || !['manager', 'admin', 'super_admin'].includes(me.role)) return res.status(403).json({ error: 'not allowed' });
  const { data, error } = await supabaseAdmin.from('inbound_calls')
    .select('*, campaigns(name), agent:users!inbound_calls_agent_id_fkey(full_name)')
    .eq('org_id', me.org_id).order('created_at', { ascending: false }).limit(100);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

export default r;
