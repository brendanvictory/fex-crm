import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';

const r = Router();

// Resolve which source the caller may see:
//  - vendor  -> their own linked source
//  - admin/super_admin -> ?source=<id> (for the internal "preview partner view")
async function resolveSource(req, res) {
  const { role, org_id, source_id } = req.profile;
  if (role === 'vendor') {
    if (!source_id) { res.status(403).json({ error: 'no source linked to this login' }); return null; }
    const { data } = await supabaseAdmin.from('lead_sources').select('*').eq('id', source_id).maybeSingle();
    if (!data) { res.status(404).json({ error: 'source not found' }); return null; }
    return data;
  }
  if (role === 'admin' || role === 'super_admin') {
    const sid = req.query.source;
    if (!sid) { res.status(400).json({ error: 'source query param required' }); return null; }
    const { data } = await supabaseAdmin.from('lead_sources').select('*').eq('id', sid).maybeSingle();
    if (!data) { res.status(404).json({ error: 'source not found' }); return null; }
    if (role !== 'super_admin' && data.org_id !== org_id) { res.status(403).json({ error: 'out of scope' }); return null; }
    return data;
  }
  res.status(403).json({ error: 'not allowed' });
  return null;
}

function range(req) {
  const to = req.query.to ? new Date(req.query.to) : new Date();
  const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 30 * 864e5);
  return { fromISO: from.toISOString(), toISO: to.toISOString() };
}

// Public-safe view of the source (never leak internal fields to a vendor).
function sourceCard(s, role) {
  const card = { id: s.id, name: s.name, cost_per_lead: s.cost_per_lead, posting_spec: s.posting_spec };
  // Vendors may see their own API key (it's theirs); admins previewing also see it.
  card.api_key = s.api_key;
  return card;
}

// GET /overview
r.get('/overview', async (req, res) => {
  const s = await resolveSource(req, res); if (!s) return;
  const { fromISO, toISO } = range(req);

  // Post log (volume / acceptance / posting health)
  const { data: posts } = await supabaseAdmin
    .from('lead_posts').select('status, created_at')
    .eq('source_id', s.id).gte('created_at', fromISO).lte('created_at', toISO);
  const P = posts || [];
  const posted = P.length;
  const accepted = P.filter((p) => p.status === 'accepted').length;
  const duplicate = P.filter((p) => p.status === 'duplicate').length;
  const rejected = P.filter((p) => p.status === 'rejected').length;

  // Last post received + 30-day error rate (posting health)
  const { data: lastPost } = await supabaseAdmin
    .from('lead_posts').select('created_at').eq('source_id', s.id)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  const { data: recent } = await supabaseAdmin
    .from('lead_posts').select('status').eq('source_id', s.id)
    .gte('created_at', new Date(Date.now() - 30 * 864e5).toISOString());
  const rec = recent || [];
  const errRate = rec.length ? Math.round((rec.filter((x) => x.status === 'rejected').length / rec.length) * 100) : 0;

  // Accepted leads cohort (works retroactively from the leads table)
  const { count: leadsCount } = await supabaseAdmin
    .from('leads').select('id', { count: 'exact', head: true })
    .eq('source_id', s.id).gte('created_at', fromISO).lte('created_at', toISO);
  const cohort = leadsCount || 0;

  // Calls for that cohort (contact rate + speed-to-contact)
  const { data: calls } = await supabaseAdmin
    .from('calls').select('lead_id, started_at, created_at, leads!inner(source_id, created_at)')
    .eq('leads.source_id', s.id).gte('leads.created_at', fromISO).lte('leads.created_at', toISO);
  const firstByLead = new Map();
  (calls || []).forEach((c) => {
    const t = new Date(c.started_at || c.created_at).getTime();
    const lead0 = new Date(c.leads.created_at).getTime();
    const prev = firstByLead.get(c.lead_id);
    if (prev == null || t < prev.t) firstByLead.set(c.lead_id, { t, lead0 });
  });
  const contacted = firstByLead.size;
  let speedSum = 0, speedN = 0;
  firstByLead.forEach(({ t, lead0 }) => { if (t >= lead0) { speedSum += (t - lead0); speedN++; } });
  const avgSpeedMin = speedN ? Math.round(speedSum / speedN / 60000) : null;

  // Sales / close rate for the cohort
  const { data: pols } = await supabaseAdmin
    .from('policies').select('lead_id, leads!inner(source_id, created_at)')
    .eq('leads.source_id', s.id).gte('leads.created_at', fromISO).lte('leads.created_at', toISO);
  const soldLeads = new Set((pols || []).map((p) => p.lead_id)).size;

  // Returns / credits (all-time tally)
  const { data: rets } = await supabaseAdmin
    .from('lead_returns').select('amount, status').eq('source_id', s.id);
  const credited = (rets || []).filter((x) => x.status === 'approved')
    .reduce((sum, x) => sum + Number(x.amount || 0), 0);
  const returnsCount = (rets || []).filter((x) => x.status === 'approved').length;

  res.json({
    source: sourceCard(s, req.profile.role),
    range: { from: fromISO, to: toISO },
    volume: { posted, accepted, duplicate, rejected,
      acceptance_rate: posted ? Math.round((accepted / posted) * 100) : null },
    engagement: { cohort, contacted,
      contact_rate: cohort ? Math.round((contacted / cohort) * 100) : null,
      avg_speed_to_contact_min: avgSpeedMin },
    conversion: { sold: soldLeads, close_rate: cohort ? Math.round((soldLeads / cohort) * 1000) / 10 : null },
    returns: { count: returnsCount, credited },
    health: { last_post_at: lastPost?.created_at || null, error_rate_30d: errRate }
  });
});

// GET /timeseries — daily posted vs accepted
r.get('/timeseries', async (req, res) => {
  const s = await resolveSource(req, res); if (!s) return;
  const { fromISO, toISO } = range(req);
  const { data: posts } = await supabaseAdmin
    .from('lead_posts').select('status, created_at')
    .eq('source_id', s.id).gte('created_at', fromISO).lte('created_at', toISO)
    .order('created_at');
  const byDay = {};
  (posts || []).forEach((p) => {
    const d = p.created_at.slice(0, 10);
    byDay[d] = byDay[d] || { date: d, posted: 0, accepted: 0, rejected: 0, duplicate: 0 };
    byDay[d].posted++; byDay[d][p.status] = (byDay[d][p.status] || 0) + 1;
  });
  res.json(Object.values(byDay));
});

// GET /dispositions — outcome breakdown for the cohort
r.get('/dispositions', async (req, res) => {
  const s = await resolveSource(req, res); if (!s) return;
  const { fromISO, toISO } = range(req);
  const { data: calls } = await supabaseAdmin
    .from('calls').select('disposition_id, leads!inner(source_id, created_at)')
    .eq('leads.source_id', s.id).gte('leads.created_at', fromISO).lte('leads.created_at', toISO);
  const { data: disps } = await supabaseAdmin.from('call_dispositions').select('id, name');
  const nameById = new Map((disps || []).map((d) => [d.id, d.name]));
  const counts = {};
  (calls || []).forEach((c) => {
    const label = c.disposition_id ? (nameById.get(c.disposition_id) || 'Other') : 'No disposition';
    counts[label] = (counts[label] || 0) + 1;
  });
  res.json(Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count));
});

// GET /rejections — masked list of rejected/duplicate posts
r.get('/rejections', async (req, res) => {
  const s = await resolveSource(req, res); if (!s) return;
  const { fromISO, toISO } = range(req);
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const { data } = await supabaseAdmin
    .from('lead_posts').select('created_at, status, reason, posting_ref, phone_last4, state')
    .eq('source_id', s.id).neq('status', 'accepted')
    .gte('created_at', fromISO).lte('created_at', toISO)
    .order('created_at', { ascending: false }).limit(limit);
  res.json(data || []);
});

// GET /returns — credits ledger (masked)
r.get('/returns', async (req, res) => {
  const s = await resolveSource(req, res); if (!s) return;
  const { data: rets } = await supabaseAdmin
    .from('lead_returns')
    .select('id, created_at, reason, status, amount, note, lead_id, leads(phone, state)')
    .eq('source_id', s.id).order('created_at', { ascending: false });
  // Map posting_ref best-effort from the post log.
  const leadIds = (rets || []).map((x) => x.lead_id).filter(Boolean);
  let refByLead = new Map();
  if (leadIds.length) {
    const { data: lp } = await supabaseAdmin
      .from('lead_posts').select('lead_id, posting_ref').in('lead_id', leadIds);
    (lp || []).forEach((p) => { if (p.posting_ref && !refByLead.has(p.lead_id)) refByLead.set(p.lead_id, p.posting_ref); });
  }
  const out = (rets || []).map((x) => {
    const phone = x.leads?.phone || '';
    const last4 = String(phone).replace(/\D/g, '').slice(-4) || null;
    return {
      id: x.id, created_at: x.created_at, reason: x.reason, status: x.status,
      amount: x.amount, note: x.note, state: x.leads?.state || null,
      phone_last4: last4, posting_ref: refByLead.get(x.lead_id) || null
    };
  });
  res.json(out);
});

export default r;
