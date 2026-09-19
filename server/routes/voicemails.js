import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';

const r = Router();

// Scope voicemails to the caller: agents see their own, managers their team's,
// admins the whole org. Served via the service role (no client RLS needed).
async function scopeIds(me) {
  if (['super_admin', 'admin'].includes(me.role)) return null; // null = whole org
  if (me.role === 'manager') {
    const { data: team } = await supabaseAdmin.from('users').select('id').eq('manager_id', me.id);
    return [me.id, ...(team || []).map((t) => t.id)];
  }
  return [me.id];
}

r.get('/', async (req, res) => {
  const { data: me } = await supabaseAdmin.from('users').select('id, role, org_id').eq('id', req.user.id).single();
  let q = supabaseAdmin.from('voicemails')
    .select('*, lead:leads(id, first_name, last_name)')
    .eq('org_id', me.org_id).order('created_at', { ascending: false }).limit(200);
  const ids = await scopeIds(me);
  if (ids) q = q.in('agent_id', ids);
  const { data, error } = await q;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

r.get('/unread-count', async (req, res) => {
  const { data: me } = await supabaseAdmin.from('users').select('id, role, org_id').eq('id', req.user.id).single();
  let q = supabaseAdmin.from('voicemails').select('id', { count: 'exact', head: true })
    .eq('org_id', me.org_id).eq('is_read', false);
  const ids = await scopeIds(me);
  if (ids) q = q.in('agent_id', ids);
  const { count } = await q;
  res.json({ count: count || 0 });
});

r.patch('/:id/read', async (req, res) => {
  const { data: me } = await supabaseAdmin.from('users').select('id, role, org_id').eq('id', req.user.id).single();
  const { data, error } = await supabaseAdmin.from('voicemails')
    .update({ is_read: req.body.is_read !== false }).eq('id', req.params.id).eq('org_id', me.org_id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// GET /api/voicemails/:id/audio — stream the Twilio recording (auth-protected
// upstream) through our server so the browser can play it.
r.get('/:id/audio', async (req, res) => {
  const { data: me } = await supabaseAdmin.from('users').select('org_id').eq('id', req.user.id).single();
  const { data: vm } = await supabaseAdmin.from('voicemails')
    .select('recording_url').eq('id', req.params.id).eq('org_id', me.org_id).single();
  if (!vm?.recording_url) return res.status(404).json({ error: 'not found' });
  const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const upstream = await fetch(vm.recording_url, { headers: { Authorization: `Basic ${auth}` } });
  if (!upstream.ok) return res.status(502).json({ error: 'recording unavailable' });
  res.setHeader('Content-Type', 'audio/mpeg');
  res.send(Buffer.from(await upstream.arrayBuffer()));
});

r.delete('/:id', async (req, res) => {
  const { data: me } = await supabaseAdmin.from('users').select('org_id').eq('id', req.user.id).single();
  const { error } = await supabaseAdmin.from('voicemails').delete().eq('id', req.params.id).eq('org_id', me.org_id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

export default r;
