import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';

const r = Router();

// GET /api/reports/revenue — premium, house revenue, and commissions, broken
// out by source, by agent, and over time. Org-wide (management view).
r.get('/revenue', async (req, res) => {
  const { from, to } = req.query;
  const { data: me } = await supabaseAdmin.from('users').select('org_id').eq('id', req.user.id).single();

  let pq = supabaseAdmin.from('policies')
    .select('id, annual_premium, agent_id, sold_at, status, lead:leads(source_id)')
    .eq('org_id', me.org_id);
  if (from) pq = pq.gte('sold_at', from);
  if (to) pq = pq.lte('sold_at', to);
  const { data: policies, error } = await pq;
  if (error) return res.status(400).json({ error: error.message });

  const ids = (policies || []).map((p) => p.id);
  let commissions = [];
  if (ids.length) {
    const { data: c } = await supabaseAdmin.from('commissions').select('policy_id, kind, amount, user_id, chargeback').in('policy_id', ids);
    // charged-back commissions are reversed — drop them from revenue
    commissions = (c || []).filter((row) => row.chargeback !== true);
  }
  const [{ data: sources }, { data: users }] = await Promise.all([
    supabaseAdmin.from('lead_sources').select('id, name').eq('org_id', me.org_id),
    supabaseAdmin.from('users').select('id, full_name').eq('org_id', me.org_id)
  ]);
  const sName = new Map((sources || []).map((s) => [s.id, s.name]));
  const uName = new Map((users || []).map((u) => [u.id, u.full_name]));

  let premium = 0, house = 0, agentComp = 0, mgr = 0;
  const houseByPolicy = {};
  for (const p of policies) premium += Number(p.annual_premium || 0);
  for (const c of commissions) {
    const a = Number(c.amount || 0);
    if (c.kind === 'house') { house += a; houseByPolicy[c.policy_id] = (houseByPolicy[c.policy_id] || 0) + a; }
    else if (c.kind === 'agent') agentComp += a;
    else if (c.kind === 'manager') mgr += a;
  }

  const bySrc = {};
  for (const p of policies) {
    const key = p.lead?.source_id || '__none__';
    const label = key === '__none__' ? 'Direct / none' : (sName.get(key) || 'Unknown');
    (bySrc[key] ||= { key, label, premium: 0, house: 0, policies: 0 });
    bySrc[key].premium += Number(p.annual_premium || 0);
    bySrc[key].house += houseByPolicy[p.id] || 0;
    bySrc[key].policies++;
  }
  const byAgent = {};
  for (const p of policies) {
    const key = p.agent_id || '__none__';
    (byAgent[key] ||= { key, label: uName.get(key) || 'Unknown', comp: 0, premium: 0, policies: 0 });
    byAgent[key].policies++;
    byAgent[key].premium += Number(p.annual_premium || 0);
  }
  for (const c of commissions) {
    if (c.kind === 'agent' && c.user_id) {
      (byAgent[c.user_id] ||= { key: c.user_id, label: uName.get(c.user_id) || 'Unknown', comp: 0, premium: 0, policies: 0 });
      byAgent[c.user_id].comp += Number(c.amount || 0);
    }
  }

  const dayMap = {};
  for (const p of policies) { const d = (p.sold_at || '').slice(0, 10); if (d) dayMap[d] = (dayMap[d] || 0) + Number(p.annual_premium || 0); }
  const start = from ? new Date(from) : new Date(Date.now() - 29 * 864e5);
  const end = to ? new Date(to) : new Date();
  const by_day = [];
  for (let d = new Date(start.toISOString().slice(0, 10)); d <= end; d = new Date(d.getTime() + 864e5)) {
    const k = d.toISOString().slice(0, 10);
    by_day.push({ day: k, premium: +(dayMap[k] || 0).toFixed(2) });
  }

  const inForce = policies.filter((p) => ['issued', 'in_force'].includes(p.status)).length;
  const lapsed = policies.filter((p) => ['lapsed', 'nsf', 'cancelled'].includes(p.status)).length;

  res.json({
    totals: {
      policies: policies.length,
      in_force: inForce,
      lapsed,
      premium: +premium.toFixed(2),
      house: +house.toFixed(2),
      agent_comp: +agentComp.toFixed(2),
      manager_override: +mgr.toFixed(2)
    },
    by_source: Object.values(bySrc).sort((a, b) => b.premium - a.premium),
    by_agent: Object.values(byAgent).sort((a, b) => b.premium - a.premium),
    by_day
  });
});

// GET /api/reports/summary — aggregates for the dashboard and reports page.
// Filters: from, to, state, source, status, owner. RLS scopes the data to the
// caller (an agent's report covers their leads; a manager's, their team's).
//
// "Contacted" = a lead that has at least one logged call OR has moved past the
// default "New Lead" status. (Once the dialer ships, calls make this precise.)
r.get('/summary', async (req, res) => {
  const { from, to, state, source, status, owner } = req.query;

  let q = req.sb
    .from('leads')
    .select('id, created_at, state, status_id, source_id, owner_id')
    .limit(10000);
  if (state) q = q.eq('state', state.toUpperCase());
  if (source) q = q.eq('source_id', source);
  if (status) q = q.eq('status_id', status);
  if (owner) q = q.eq('owner_id', owner);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', to);

  const { data: leads, error } = await q;
  if (error) return res.status(400).json({ error: error.message });

  const [{ data: statuses }, { data: sources }, { data: agents }, { data: calls }] = await Promise.all([
    req.sb.from('lead_statuses').select('id, name, is_default, sort_order').order('sort_order'),
    req.sb.from('lead_sources').select('id, name'),
    req.sb.from('users').select('id, full_name'),
    req.sb.from('calls').select('lead_id')
  ]);

  const statusName = new Map((statuses || []).map((s) => [s.id, s.name]));
  const sourceName = new Map((sources || []).map((s) => [s.id, s.name]));
  const agentName = new Map((agents || []).map((a) => [a.id, a.full_name]));
  const defaultStatusId = (statuses || []).find((s) => s.is_default)?.id || null;
  const calledLeads = new Set((calls || []).map((c) => c.lead_id).filter(Boolean));

  const isContacted = (l) =>
    calledLeads.has(l.id) || (l.status_id && l.status_id !== defaultStatusId);

  // --- grouped aggregation helper ---
  function group(keyFn, labelFn) {
    const m = new Map();
    for (const l of leads) {
      const k = keyFn(l) ?? '__none__';
      if (!m.has(k)) m.set(k, { key: k, label: labelFn(k), count: 0, contacted: 0 });
      const row = m.get(k);
      row.count++;
      if (isContacted(l)) row.contacted++;
    }
    return [...m.values()]
      .map((r) => ({ ...r, contact_rate: r.count ? Math.round((r.contacted / r.count) * 100) : 0 }))
      .sort((a, b) => b.count - a.count);
  }

  const by_source = group((l) => l.source_id, (k) => (k === '__none__' ? 'Direct / none' : sourceName.get(k) || 'Unknown'));
  const by_status = group((l) => l.status_id, (k) => (k === '__none__' ? 'No status' : statusName.get(k) || 'Unknown'));
  const by_agent = group((l) => l.owner_id, (k) => (k === '__none__' ? 'Unassigned' : agentName.get(k) || 'Unknown'));

  // --- by day, gap-filled across the range ---
  const dayCount = new Map();
  for (const l of leads) {
    const d = (l.created_at || '').slice(0, 10);
    if (d) dayCount.set(d, (dayCount.get(d) || 0) + 1);
  }
  const start = from ? new Date(from) : new Date(Date.now() - 29 * 864e5);
  const end = to ? new Date(to) : new Date();
  const by_day = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 864e5)) {
    const key = d.toISOString().slice(0, 10);
    by_day.push({ day: key, count: dayCount.get(key) || 0 });
  }

  const total = leads.length;
  const contacted = leads.filter(isContacted).length;
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const last7 = leads.filter((l) => l.created_at >= weekAgo).length;

  res.json({
    totals: {
      leads: total,
      contacted,
      contact_rate: total ? Math.round((contacted / total) * 100) : 0,
      last7
    },
    by_day, by_source, by_status, by_agent
  });
});

export default r;
