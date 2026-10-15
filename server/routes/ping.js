import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { availableAgents, capsOk, isDuplicate, pingFields } from '../lib/inbound.js';

// PUBLIC — ping/post. A vendor POSTs call metadata here BEFORE routing the call.
// We accept (and return the number to route to) or reject with a reason.
// Auth: the campaign's ping_key via X-Ping-Key header or ping_key in the body.
const r = Router();

r.post('/', async (req, res) => {
  const key = req.headers['x-ping-key'] || req.body.ping_key || req.body.key;
  if (!key) return res.status(401).json({ decision: 'reject', reason: 'missing_key' });

  const { data: campaign } = await supabaseAdmin
    .from('campaigns').select('*').eq('ping_key', key).maybeSingle();
  if (!campaign) return res.status(401).json({ decision: 'reject', reason: 'invalid_key' });

  const f = pingFields(req.body);
  const state = f.state ? f.state.toUpperCase().slice(0, 2) : null;

  // Log helper — records the ping outcome for reporting/billing.
  async function log(status, reason) {
    const { data } = await supabaseAdmin.from('inbound_calls').insert({
      org_id: campaign.org_id, campaign_id: campaign.id, source_id: campaign.source_id,
      from_number: f.from, caller_state: state, caller_zip: f.zip, vendor_call_id: f.vendorCallId,
      status, reject_reason: reason || null,
      is_duplicate: reason === 'duplicate', ping_at: new Date().toISOString()
    }).select('id').single();
    return data?.id || null;
  }

  if (!campaign.is_active) { await log('rejected', 'inactive'); return res.json({ decision: 'reject', reason: 'inactive' }); }

  // Ping campaigns require the caller's state (to enforce licensing).
  if (campaign.type === 'ping' && !state) { await log('rejected', 'state'); return res.json({ decision: 'reject', reason: 'missing_state' }); }

  // State allowed for this campaign?
  if (state && campaign.states && campaign.states.length && !campaign.states.includes(state)) {
    await log('rejected', 'state'); return res.json({ decision: 'reject', reason: 'state_not_allowed' });
  }

  // Budget / concurrency caps.
  const caps = await capsOk(campaign);
  if (!caps.ok) { await log('rejected', caps.reason); return res.json({ decision: 'reject', reason: caps.reason }); }

  // Duplicate caller within the window.
  if (await isDuplicate(campaign, f.from)) { await log('rejected', 'duplicate'); return res.json({ decision: 'reject', reason: 'duplicate' }); }

  // At least one available, licensed agent.
  const agents = await availableAgents(campaign.org_id, state);
  if (!agents.length) { await log('rejected', 'no_agent'); return res.json({ decision: 'reject', reason: 'no_agent' }); }

  if (!campaign.phone_number) { await log('rejected', 'bad_request'); return res.json({ decision: 'reject', reason: 'no_route_number' }); }

  const id = await log('accepted', null);
  res.json({
    decision: 'accept',
    number: campaign.phone_number,   // route the call here
    cost: Number(campaign.cost_per_call || 0),
    buffer_seconds: campaign.buffer_seconds,
    call_id: id
  });
});

export default r;
