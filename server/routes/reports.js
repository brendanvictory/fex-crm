import { Router } from 'express';

const r = Router();

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
