// Shared helpers for inbound pay-per-call routing & billing.
import { supabaseAdmin } from '../supabase.js';
import { normalizePhone } from './leads.js';
import { etDayStartUTC, etMonthStartUTC } from './time.js';

export const PRESENCE_FRESH_MS = 90 * 1000; // ignore "available" agents whose tab went silent

// Agents eligible to take a call in `state` right now: present=available,
// heartbeat fresh, and (when state is known) licensed in that state.
export async function availableAgents(orgId, state) {
  const freshCut = new Date(Date.now() - PRESENCE_FRESH_MS).toISOString();
  const { data: agents } = await supabaseAdmin
    .from('users').select('id')
    .eq('org_id', orgId).eq('is_active', true).eq('inbound_status', 'available')
    .gte('last_seen_at', freshCut);
  let ids = (agents || []).map((a) => a.id);
  if (!ids.length) return [];

  if (state) {
    const st = String(state).toUpperCase().slice(0, 2);
    const { data: lic } = await supabaseAdmin
      .from('agent_licenses').select('user_id').eq('state', st).in('user_id', ids);
    const licensed = new Set((lic || []).map((l) => l.user_id));
    ids = ids.filter((id) => licensed.has(id));
  }
  return ids;
}

// Is the campaign within its spend/concurrency caps? Returns {ok, reason}.
export async function capsOk(campaign) {
  // Concurrency: live reservations (accepted or ringing or on a call).
  if (campaign.concurrency_cap != null) {
    const { count } = await supabaseAdmin.from('inbound_calls')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id).in('status', ['accepted', 'ringing', 'answered']);
    if ((count || 0) >= campaign.concurrency_cap) return { ok: false, reason: 'cap' };
  }
  const sumCost = async (sinceISO) => {
    const { data } = await supabaseAdmin.from('inbound_calls')
      .select('cost').eq('campaign_id', campaign.id).eq('billable', true).gte('billable_at', sinceISO);
    return (data || []).reduce((s, r) => s + Number(r.cost || 0), 0);
  };
  if (campaign.daily_cap != null) {
    if (await sumCost(etDayStartUTC()) + Number(campaign.cost_per_call || 0) > Number(campaign.daily_cap)) return { ok: false, reason: 'cap' };
  }
  if (campaign.monthly_cap != null) {
    if (await sumCost(etMonthStartUTC()) + Number(campaign.cost_per_call || 0) > Number(campaign.monthly_cap)) return { ok: false, reason: 'cap' };
  }
  return { ok: true };
}

// Same caller to the same campaign within the dupe window = duplicate.
export async function isDuplicate(campaign, fromNumber) {
  const norm = normalizePhone(fromNumber);
  if (!norm) return false;
  const sinceISO = new Date(Date.now() - (campaign.dupe_window_hours || 72) * 3600 * 1000).toISOString();
  const { data } = await supabaseAdmin.from('inbound_calls')
    .select('id, from_number, status')
    .eq('campaign_id', campaign.id)
    .gte('created_at', sinceISO)
    .in('status', ['accepted', 'ringing', 'answered', 'completed', 'voicemail']);
  return (data || []).some((c) => normalizePhone(c.from_number) === norm);
}

// Compute billing given talk time.
export function billableFor(campaign, talkSeconds) {
  const billable = talkSeconds != null && talkSeconds >= (campaign.buffer_seconds || 90);
  return { billable, cost: billable ? Number(campaign.cost_per_call || 0) : 0 };
}

// Pull the caller's state/zip/ref out of a ping payload (flexible field names).
export function pingFields(body) {
  const get = (...keys) => {
    for (const k of Object.keys(body || {})) {
      const n = k.toLowerCase().replace(/[\s\-_]+/g, '');
      if (keys.includes(n)) { const v = body[k]; if (v != null && String(v).trim() !== '') return String(v).trim(); }
    }
    return null;
  };
  return {
    from: get('from', 'caller', 'callerid', 'phone', 'phonenumber', 'ani', 'number'),
    state: get('state', 'st', 'callerstate', 'region'),
    zip: get('zip', 'zipcode', 'postal', 'postalcode'),
    vendorCallId: get('callid', 'call_id', 'id', 'ref', 'reference', 'transactionid', 'subid', 'vendorcallid')
  };
}
