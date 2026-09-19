import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { markWorked } from '../lib/leads.js';

const r = Router();

// POST /api/sales — record a sale for a lead and compute commissions.
// Body: { lead_id, carrier_id, product, policy_number, monthly_premium, annual_premium?, draft_day, effective_date }
r.post('/', async (req, res) => {
  const b = req.body;
  if (!b.lead_id || !b.carrier_id) return res.status(400).json({ error: 'lead_id and carrier_id required' });

  const { data: me } = await supabaseAdmin.from('users').select('id, org_id').eq('id', req.user.id).single();
  const { data: lead } = await supabaseAdmin.from('leads').select('id, org_id, owner_id').eq('id', b.lead_id).single();
  if (!lead) return res.status(404).json({ error: 'lead not found' });

  const { data: carrier } = await supabaseAdmin.from('carriers').select('*').eq('id', b.carrier_id).single();
  if (!carrier) return res.status(400).json({ error: 'carrier not found' });

  const monthly = Number(b.monthly_premium) || 0;
  const annual = b.annual_premium != null ? Number(b.annual_premium) : +(monthly * 12).toFixed(2);
  const agentId = lead.owner_id || me.id;

  // Create the policy (sale) record.
  const { data: policy, error: pErr } = await supabaseAdmin.from('policies').insert({
    lead_id: lead.id, org_id: lead.org_id, agent_id: agentId,
    carrier: carrier.name, carrier_id: carrier.id, product: b.product || null,
    policy_number: b.policy_number || null, monthly_premium: monthly || null, annual_premium: annual,
    draft_day: b.draft_day || null, effective_date: b.effective_date || null,
    status: 'issued', sold_at: new Date().toISOString()
  }).select().single();
  if (pErr) return res.status(400).json({ error: pErr.message });

  // Look up comp levels: agent, and the agent's manager (override).
  const { data: agent } = await supabaseAdmin.from('users').select('id, manager_id').eq('id', agentId).single();
  const rateFor = async (uid) => {
    if (!uid) return 0;
    const { data } = await supabaseAdmin.from('commission_rates').select('pct').eq('carrier_id', carrier.id).eq('user_id', uid).maybeSingle();
    return data ? Number(data.pct) : 0;
  };
  const agentPct = await rateFor(agentId);
  const managerId = agent?.manager_id || null;
  const managerPct = await rateFor(managerId);
  const housePct = Math.max(0, Number(carrier.agency_pct) - agentPct - managerPct);

  const rows = [];
  const amt = (pct) => +(annual * pct / 100).toFixed(2);
  if (agentPct > 0) rows.push({ policy_id: policy.id, org_id: lead.org_id, user_id: agentId, role: 'agent', kind: 'agent', rate: agentPct, amount: amt(agentPct) });
  if (managerId && managerPct > 0) rows.push({ policy_id: policy.id, org_id: lead.org_id, user_id: managerId, role: 'manager', kind: 'manager', rate: managerPct, amount: amt(managerPct) });
  rows.push({ policy_id: policy.id, org_id: lead.org_id, user_id: null, role: null, kind: 'house', rate: housePct, amount: amt(housePct) });
  if (rows.length) await supabaseAdmin.from('commissions').insert(rows);

  // Move the lead to a "Sold" status if one exists, and mark worked.
  const { data: soldStatus } = await supabaseAdmin.from('lead_statuses').select('id').ilike('name', '%sold%').limit(1).maybeSingle();
  if (soldStatus) await supabaseAdmin.from('leads').update({ status_id: soldStatus.id }).eq('id', lead.id);
  await markWorked(supabaseAdmin, lead.id);
  await supabaseAdmin.from('activity_log').insert({
    org_id: lead.org_id, entity_type: 'lead', entity_id: lead.id, actor_id: me.id,
    action: 'sale_recorded', detail: { carrier: carrier.name, annual_premium: annual }
  });

  res.status(201).json({ policy, commissions: rows });
});

// GET /api/sales?lead= — sales/policies for a lead (or the org).
r.get('/', async (req, res) => {
  const { data: me } = await supabaseAdmin.from('users').select('org_id').eq('id', req.user.id).single();
  let q = supabaseAdmin.from('policies')
    .select('*, carriers(name), agent:users(full_name)')
    .eq('org_id', me.org_id).order('sold_at', { ascending: false }).limit(200);
  if (req.query.lead) q = q.eq('lead_id', req.query.lead);
  const { data, error } = await q;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

export default r;
