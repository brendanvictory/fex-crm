import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';

const r = Router();

// POST /api/inbound/:id/answered — the agent's softphone reports it accepted this
// campaign call. First-wins (simul-ring); flips the agent to on_call.
r.post('/:id/answered', async (req, res) => {
  const { data: won } = await supabaseAdmin.from('inbound_calls')
    .update({ agent_id: req.user.id, answered_at: new Date().toISOString(), status: 'answered' })
    .eq('id', req.params.id).is('agent_id', null)
    .select('id, campaign_id, from_number, caller_state, caller_zip, lead_id').maybeSingle();
  if (won) {
    await supabaseAdmin.from('users')
      .update({ inbound_status: 'on_call', inbound_status_at: new Date().toISOString() }).eq('id', req.user.id);
  }
  res.json({ won: !!won, call: won || null });
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
