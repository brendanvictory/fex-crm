import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { stateTimezone } from '../lib/leads.js';

const r = Router();
const STALE_MS = 5 * 60 * 1000; // a lock older than this is considered abandoned

function localHour(tz) {
  try { return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date()), 10); }
  catch { return null; }
}

// POST /api/dialer/next — release the agent's prior lock, then lock and return
// the next dialable lead in the chosen list (in calling hours, not DNC, not
// locked by someone else). Returns { lead } or { done: true }.
r.post('/next', async (req, res) => {
  const { list_id } = req.body;
  const { data: me } = await supabaseAdmin.from('users').select('id, org_id').eq('id', req.user.id).single();

  await supabaseAdmin.from('leads').update({ locked_by: null, locked_at: null }).eq('locked_by', me.id);

  const staleCut = new Date(Date.now() - STALE_MS).toISOString();
  let q = supabaseAdmin.from('leads')
    .select('*')
    .eq('org_id', me.org_id).eq('dnc', false)
    .or(`locked_by.is.null,locked_at.lt.${staleCut}`)
    .order('last_dialed_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
    .limit(25);
  if (list_id && list_id !== 'all') q = q.eq('list_id', list_id);

  const { data: cands, error } = await q;
  if (error) return res.status(400).json({ error: error.message });

  for (const lead of cands || []) {
    const tz = lead.timezone || stateTimezone(lead.state) || 'America/New_York';
    const h = localHour(tz);
    if (h != null && (h < 8 || h >= 21)) continue; // outside calling hours

    const { data: locked } = await supabaseAdmin.from('leads')
      .update({ locked_by: me.id, locked_at: new Date().toISOString(), last_dialed_at: new Date().toISOString() })
      .eq('id', lead.id)
      .or(`locked_by.is.null,locked_at.lt.${staleCut}`)
      .select('id').maybeSingle();

    if (locked) {
      const { data: full } = await supabaseAdmin.from('leads')
        .select('*, lead_statuses(name)').eq('id', lead.id).single();
      return res.json({ lead: full });
    }
  }
  res.json({ done: true });
});

// POST /api/dialer/stop — release the agent's lock when they stop dialing.
r.post('/stop', async (req, res) => {
  await supabaseAdmin.from('leads').update({ locked_by: null, locked_at: null }).eq('locked_by', req.user.id);
  res.json({ ok: true });
});

export default r;
