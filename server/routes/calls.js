import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { stateTimezone } from '../lib/leads.js';

const r = Router();

function toE164(raw) {
  if (!raw) return null;
  const d = String(raw).replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return d;
  const digits = d.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return digits ? '+' + digits : null;
}

// Current hour (0–23) in a timezone, or null if it can't be resolved.
function localHour(tz) {
  try {
    return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date()), 10);
  } catch { return null; }
}

// Pick a local-presence caller ID for the lead's state.
async function pickCallerId(orgId, state) {
  if (state) {
    const { data } = await supabaseAdmin.from('phone_numbers')
      .select('number').eq('org_id', orgId).eq('state', state).eq('is_active', true).limit(1).maybeSingle();
    if (data) return data.number;
  }
  const { data: any } = await supabaseAdmin.from('phone_numbers')
    .select('number').eq('org_id', orgId).eq('is_active', true).limit(1).maybeSingle();
  return any?.number || process.env.TWILIO_CALLER_ID || null;
}

// POST /api/calls/start — compliance gate + create the call record.
// Returns { call_id, to, caller_id } or 403 with a reason.
r.post('/start', async (req, res) => {
  const { lead_id } = req.body;
  if (!lead_id) return res.status(400).json({ error: 'lead_id required' });

  const { data: me } = await supabaseAdmin.from('users').select('id, org_id').eq('id', req.user.id).single();
  const { data: lead } = await supabaseAdmin
    .from('leads').select('id, phone, state, timezone, dnc, org_id').eq('id', lead_id).single();
  if (!lead) return res.status(404).json({ error: 'lead not found' });

  if (lead.dnc) return res.status(403).json({ error: 'This lead is on the Do Not Call list.', reason: 'dnc' });

  const tz = lead.timezone || stateTimezone(lead.state) || 'America/New_York';
  const hour = localHour(tz);
  if (hour != null && (hour < 8 || hour >= 21)) {
    return res.status(403).json({
      error: `Outside calling hours for this lead (it's ${hour}:00 their time). Calling is allowed 8am–9pm local.`,
      reason: 'window'
    });
  }

  const to = toE164(lead.phone);
  if (!to) return res.status(400).json({ error: 'This lead has no valid phone number.' });

  const callerId = await pickCallerId(lead.org_id, lead.state);

  const { data: call, error } = await supabaseAdmin.from('calls').insert({
    lead_id: lead.id, org_id: lead.org_id, agent_id: me.id,
    direction: 'outbound', from_number: callerId, to_number: to, started_at: new Date().toISOString()
  }).select('id').single();
  if (error) return res.status(400).json({ error: error.message });

  res.json({ call_id: call.id, to, caller_id: callerId });
});

// PATCH /api/calls/:id/disposition — log outcome; advance lead status if mapped.
r.patch('/:id/disposition', async (req, res) => {
  const { disposition_id } = req.body;
  const { data: call, error } = await supabaseAdmin
    .from('calls').update({ disposition_id: disposition_id || null }).eq('id', req.params.id).select('*').single();
  if (error) return res.status(400).json({ error: error.message });

  let advanced = null;
  if (disposition_id) {
    const { data: disp } = await supabaseAdmin
      .from('call_dispositions').select('name, maps_to_status_id').eq('id', disposition_id).single();
    if (disp?.maps_to_status_id && call.lead_id) {
      await supabaseAdmin.from('leads')
        .update({ status_id: disp.maps_to_status_id, updated_at: new Date().toISOString() }).eq('id', call.lead_id);
      advanced = disp.maps_to_status_id;
    }
    if (call.lead_id) {
      await supabaseAdmin.from('activity_log').insert({
        org_id: call.org_id, entity_type: 'lead', entity_id: call.lead_id,
        actor_id: req.user.id, action: 'call_logged', detail: { disposition: disp?.name || null }
      });
    }
  }
  res.json({ ok: true, advanced });
});

// GET /api/calls?lead= — call history for a lead.
r.get('/', async (req, res) => {
  const { lead } = req.query;
  let q = req.sb.from('calls')
    .select('*, disposition:call_dispositions(name), agent:users(full_name)')
    .order('started_at', { ascending: false }).limit(200);
  if (lead) q = q.eq('lead_id', lead);
  const { data, error } = await q;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

export default r;
