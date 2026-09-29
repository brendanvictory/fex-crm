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

// GET /api/reports/activity — per-agent call productivity + trends.
// Filters: from, to, origin ('power_dialer'|'manual'|'lead'|'all'), agent.
// Role-scoped: admins see the org, managers their downline + self, agents self.
r.get('/activity', async (req, res) => {
  const { from, to, origin, agent } = req.query;
  const { data: me } = await supabaseAdmin.from('users').select('id, role, org_id').eq('id', req.user.id).single();
  if (!me) return res.status(400).json({ error: 'no profile' });

  const { data: orgUsers } = await supabaseAdmin
    .from('users').select('id, full_name, role, manager_id').eq('org_id', me.org_id);
  let allowed;
  if (me.role === 'super_admin' || me.role === 'admin') allowed = new Set((orgUsers || []).map((u) => u.id));
  else if (me.role === 'manager') allowed = new Set([me.id, ...(orgUsers || []).filter((u) => u.manager_id === me.id).map((u) => u.id)]);
  else allowed = new Set([me.id]);
  const nameById = new Map((orgUsers || []).map((u) => [u.id, u.full_name]));

  let q = supabaseAdmin.from('calls')
    .select('agent_id, lead_id, duration_seconds, started_at, origin')
    .eq('org_id', me.org_id).eq('direction', 'outbound').limit(100000);
  if (from) q = q.gte('started_at', from);
  if (to) q = q.lte('started_at', to);
  if (origin && origin !== 'all') q = q.eq('origin', origin);
  if (agent) q = q.eq('agent_id', agent);
  const { data: calls, error } = await q;
  if (error) return res.status(400).json({ error: error.message });

  const rows = (calls || []).filter((c) => c.agent_id && allowed.has(c.agent_id));

  const hourFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' });
  const dowFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' });
  const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  const A = new Map();
  const ga = (id) => {
    if (!A.has(id)) A.set(id, { id, name: nameById.get(id) || 'Unknown', dials: 0, leads: new Set(), connected: 0, talk: 0, days: new Map() });
    return A.get(id);
  };
  const byDay = new Map();
  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, dials: 0, connected: 0 }));
  const byDow = Array.from({ length: 7 }, (_, d) => ({ dow: d, dials: 0, connected: 0 }));

  for (const c of rows) {
    const a = ga(c.agent_id);
    a.dials++;
    if (c.lead_id) a.leads.add(c.lead_id);
    const dur = Number(c.duration_seconds || 0);
    const isConn = dur > 0;
    if (isConn) { a.connected++; a.talk += dur; }

    const d = new Date(c.started_at);
    const ms = d.getTime();
    const dayKey = (c.started_at || '').slice(0, 10);
    let dd = a.days.get(dayKey);
    if (!dd) { dd = { min: ms, max: ms }; a.days.set(dayKey, dd); }
    else { if (ms < dd.min) dd.min = ms; if (ms > dd.max) dd.max = ms; }

    const bd = byDay.get(dayKey) || { dials: 0, connected: 0 };
    bd.dials++; if (isConn) bd.connected++; byDay.set(dayKey, bd);

    const h = parseInt(hourFmt.format(d), 10) % 24;
    byHour[h].dials++; if (isConn) byHour[h].connected++;
    const dw = DOW[dowFmt.format(d)] ?? 0;
    byDow[dw].dials++; if (isConn) byDow[dw].connected++;
  }

  const agents = [...A.values()].map((a) => {
    let activeMin = 0;
    a.days.forEach((dd) => { activeMin += Math.max(0, dd.max - dd.min) / 60000; });
    return {
      id: a.id, name: a.name, dials: a.dials, unique_leads: a.leads.size,
      connected: a.connected, connect_rate: a.dials ? Math.round((a.connected / a.dials) * 100) : 0,
      talk_sec: a.talk, avg_duration_sec: a.connected ? Math.round(a.talk / a.connected) : 0,
      active_min: Math.round(activeMin),
      dials_per_hour: activeMin > 0 ? +(a.dials / (activeMin / 60)).toFixed(1) : null
    };
  }).sort((x, y) => y.dials - x.dials);

  const totals = agents.reduce((t, a) => {
    t.dials += a.dials; t.connected += a.connected; t.talk_sec += a.talk_sec;
    t.active_min += a.active_min; t.unique_leads += a.unique_leads; return t;
  }, { dials: 0, connected: 0, talk_sec: 0, active_min: 0, unique_leads: 0 });
  totals.connect_rate = totals.dials ? Math.round((totals.connected / totals.dials) * 100) : 0;
  totals.avg_duration_sec = totals.connected ? Math.round(totals.talk_sec / totals.connected) : 0;
  totals.dials_per_hour = totals.active_min > 0 ? +(totals.dials / (totals.active_min / 60)).toFixed(1) : null;

  const start = from ? new Date(from) : new Date(Date.now() - 29 * 864e5);
  const end = to ? new Date(to) : new Date();
  const by_day = [];
  for (let d = new Date(start.toISOString().slice(0, 10)); d <= end; d = new Date(d.getTime() + 864e5)) {
    const k = d.toISOString().slice(0, 10);
    const bd = byDay.get(k) || { dials: 0, connected: 0 };
    by_day.push({ day: k, dials: bd.dials, connected: bd.connected });
  }

  res.json({ agents, totals, by_day, by_hour: byHour, by_dow: byDow });
});

export default r;
