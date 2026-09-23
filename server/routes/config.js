import { Router } from 'express';
import { randomBytes } from 'crypto';
import { supabaseAdmin } from '../supabase.js';
import { sendMail, mailConfigured } from '../lib/mailer.js';

const r = Router();

// Gate helper for dialer config writes (lists/scripts): admin/manager/super.
async function canManage(userId) {
  const { data } = await supabaseAdmin.from('users').select('id, role, org_id').eq('id', userId).single();
  return data && ['super_admin', 'admin', 'manager'].includes(data.role) ? data : null;
}
async function myOrg(userId) {
  const { data } = await supabaseAdmin.from('users').select('org_id').eq('id', userId).single();
  return data?.org_id || null;
}

function toE164(raw) {
  if (!raw) return null;
  const d = String(raw).replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return d;
  const digits = d.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return digits ? '+' + digits : null;
}

// ---- Lookup data for dropdowns (all respect RLS via req.sb) ----
r.get('/statuses', async (req, res) => {
  const { data, error } = await req.sb.from('lead_statuses').select('*').order('sort_order');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

r.post('/statuses', async (req, res) => {
  const body = { name: req.body.name, sort_order: req.body.sort_order ?? 0, is_active: req.body.is_active ?? true, is_default: !!req.body.is_default };
  if (body.is_default) await req.sb.from('lead_statuses').update({ is_default: false }).eq('is_default', true);
  const { data, error } = await req.sb.from('lead_statuses').insert(body).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

r.patch('/statuses/:id', async (req, res) => {
  const patch = {};
  for (const k of ['name', 'sort_order', 'is_active', 'is_default']) if (k in req.body) patch[k] = req.body[k];
  if (patch.is_default) await req.sb.from('lead_statuses').update({ is_default: false }).neq('id', req.params.id);
  const { data, error } = await req.sb.from('lead_statuses').update(patch).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

r.delete('/statuses/:id', async (req, res) => {
  const { error } = await req.sb.from('lead_statuses').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

r.get('/dispositions', async (req, res) => {
  const { data, error } = await req.sb.from('call_dispositions').select('*').order('name');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

r.post('/dispositions', async (req, res) => {
  const body = { name: req.body.name, maps_to_status_id: req.body.maps_to_status_id || null, is_active: req.body.is_active ?? true };
  const { data, error } = await req.sb.from('call_dispositions').insert(body).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

r.patch('/dispositions/:id', async (req, res) => {
  const patch = {};
  for (const k of ['name', 'maps_to_status_id', 'is_active']) if (k in req.body) patch[k] = req.body[k];
  const { data, error } = await req.sb.from('call_dispositions').update(patch).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

r.delete('/dispositions/:id', async (req, res) => {
  const { error } = await req.sb.from('call_dispositions').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

r.get('/agents', async (req, res) => {
  const { data, error } = await req.sb.from('users').select('id, full_name, role').order('full_name');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ---- Lead sources (admin-managed; writes gated by RLS) ----
r.get('/sources', async (req, res) => {
  const { data, error } = await req.sb.from('lead_sources').select('*').order('name');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

r.post('/sources', async (req, res) => {
  const { data: me, error: meErr } = await req.sb
    .from('users').select('org_id').eq('id', req.user.id).single();
  if (meErr) return res.status(400).json({ error: meErr.message });

  const body = { ...req.body, org_id: me.org_id };
  if (!body.api_key) body.api_key = 'src_' + randomBytes(18).toString('hex');

  const { data, error } = await req.sb.from('lead_sources').insert(body).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

r.patch('/sources/:id', async (req, res) => {
  const patch = { ...req.body };
  delete patch.id;
  delete patch.org_id;
  const { data, error } = await req.sb
    .from('lead_sources').update(patch).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

r.post('/sources/:id/rotate-key', async (req, res) => {
  const key = 'src_' + randomBytes(18).toString('hex');
  const { data, error } = await req.sb
    .from('lead_sources').update({ api_key: key }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ---- Partner (vendor) logins for a source ----
async function requireAdminRole(userId) {
  const { data } = await supabaseAdmin.from('users').select('role, org_id').eq('id', userId).single();
  return data && ['admin', 'super_admin'].includes(data.role) ? data : null;
}

r.get('/sources/:id/vendors', async (req, res) => {
  const admin = await requireAdminRole(req.user.id);
  if (!admin) return res.status(403).json({ error: 'admins only' });
  const { data, error } = await supabaseAdmin
    .from('users').select('id, full_name, email, is_active, created_at')
    .eq('source_id', req.params.id).eq('role', 'vendor').order('full_name');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

r.post('/sources/:id/vendors', async (req, res) => {
  const admin = await requireAdminRole(req.user.id);
  if (!admin) return res.status(403).json({ error: 'admins only' });
  const { email, password, full_name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const { data: source, error: sErr } = await supabaseAdmin
    .from('lead_sources').select('id, org_id, name').eq('id', req.params.id).single();
  if (sErr) return res.status(404).json({ error: 'source not found' });
  if (admin.role !== 'super_admin' && source.org_id !== admin.org_id)
    return res.status(403).json({ error: 'out of scope' });

  const { data: created, error: ce } = await supabaseAdmin.auth.admin.createUser({
    email, password, email_confirm: true
  });
  if (ce) return res.status(400).json({ error: ce.message });

  const { data, error } = await supabaseAdmin.from('users').insert({
    id: created.user.id, org_id: source.org_id, role: 'vendor',
    source_id: source.id, full_name, email, is_active: true
  }).select().single();
  if (error) {
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    return res.status(400).json({ error: error.message });
  }

  const appUrl = process.env.PUBLIC_BASE_URL || '';
  sendMail({
    to: email,
    subject: `Your ${source.name} partner login`,
    html: `<p>Hi ${full_name || ''},</p>
      <p>A partner portal login has been created for you to track the leads you send.</p>
      <p><strong>Sign in:</strong> <a href="${appUrl}">${appUrl}</a><br/>
      <strong>Email:</strong> ${email}<br/>
      <strong>Temporary password:</strong> ${password}</p>
      <p>Please sign in and change your password.</p>`
  }).catch(() => {});

  res.status(201).json(data);
});

r.patch('/sources/:id/vendors/:uid', async (req, res) => {
  const admin = await requireAdminRole(req.user.id);
  if (!admin) return res.status(403).json({ error: 'admins only' });
  const patch = {};
  if ('is_active' in req.body) patch.is_active = !!req.body.is_active;
  if ('full_name' in req.body) patch.full_name = req.body.full_name;
  const { data, error } = await supabaseAdmin
    .from('users').update(patch)
    .eq('id', req.params.uid).eq('source_id', req.params.id).eq('role', 'vendor').select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ---- Twilio phone numbers (local-presence caller IDs) ----
r.get('/numbers', async (req, res) => {
  const { data, error } = await req.sb.from('phone_numbers').select('*').order('state');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

r.post('/numbers', async (req, res) => {
  const { data: me, error: meErr } = await req.sb
    .from('users').select('org_id').eq('id', req.user.id).single();
  if (meErr) return res.status(400).json({ error: meErr.message });
  const row = {
    org_id: me.org_id,
    number: toE164(req.body.number),
    state: req.body.state ? String(req.body.state).toUpperCase().slice(0, 2) : null,
    label: req.body.label || null,
    is_active: req.body.is_active ?? true
  };
  if (!row.number) return res.status(400).json({ error: 'valid number required' });
  const { data, error } = await req.sb.from('phone_numbers').insert(row).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

r.delete('/numbers/:id', async (req, res) => {
  const { error } = await req.sb.from('phone_numbers').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

// ---- Dial lists (served via service role so agents can pick them) ----
r.get('/lists', async (req, res) => {
  const org = await myOrg(req.user.id);
  const { data, error } = await supabaseAdmin.from('lead_lists')
    .select('*').eq('org_id', org).order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  // attach lead counts so the UI can show which lists actually have leads
  const withCounts = await Promise.all((data || []).map(async (l) => {
    const { count } = await supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }).eq('list_id', l.id);
    return { ...l, lead_count: count || 0 };
  }));
  res.json(withCounts);
});
r.post('/lists', async (req, res) => {
  const me = await canManage(req.user.id);
  if (!me) return res.status(403).json({ error: 'not permitted' });
  const { data, error } = await supabaseAdmin.from('lead_lists')
    .insert({ org_id: me.org_id, name: req.body.name, created_by: me.id }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});
r.delete('/lists/:id', async (req, res) => {
  const me = await canManage(req.user.id);
  if (!me) return res.status(403).json({ error: 'not permitted' });
  const { error } = await supabaseAdmin.from('lead_lists').delete().eq('id', req.params.id).eq('org_id', me.org_id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

// ---- Scripts ----
r.get('/scripts', async (req, res) => {
  const org = await myOrg(req.user.id);
  const { data, error } = await supabaseAdmin.from('scripts')
    .select('*').eq('org_id', org).order('name');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});
r.post('/scripts', async (req, res) => {
  const me = await canManage(req.user.id);
  if (!me) return res.status(403).json({ error: 'not permitted' });
  const { data, error } = await supabaseAdmin.from('scripts')
    .insert({ org_id: me.org_id, name: req.body.name, body: req.body.body || '', is_active: req.body.is_active ?? true })
    .select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});
r.patch('/scripts/:id', async (req, res) => {
  const me = await canManage(req.user.id);
  if (!me) return res.status(403).json({ error: 'not permitted' });
  const patch = {};
  for (const k of ['name', 'body', 'is_active']) if (k in req.body) patch[k] = req.body[k];
  const { data, error } = await supabaseAdmin.from('scripts')
    .update(patch).eq('id', req.params.id).eq('org_id', me.org_id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});
r.delete('/scripts/:id', async (req, res) => {
  const me = await canManage(req.user.id);
  if (!me) return res.status(403).json({ error: 'not permitted' });
  const { error } = await supabaseAdmin.from('scripts').delete().eq('id', req.params.id).eq('org_id', me.org_id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

// ---- Rebuttals (objection/response cards shown on the dialer) ----
r.get('/rebuttals', async (req, res) => {
  const org = await myOrg(req.user.id);
  const { data, error } = await supabaseAdmin.from('rebuttals')
    .select('*').eq('org_id', org).order('sort_order').order('created_at');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});
r.post('/rebuttals', async (req, res) => {
  const me = await canManage(req.user.id);
  if (!me) return res.status(403).json({ error: 'not permitted' });
  const { data, error } = await supabaseAdmin.from('rebuttals')
    .insert({ org_id: me.org_id, title: req.body.title, body: req.body.body || '',
      sort_order: Number(req.body.sort_order) || 0, is_active: req.body.is_active ?? true })
    .select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});
r.patch('/rebuttals/:id', async (req, res) => {
  const me = await canManage(req.user.id);
  if (!me) return res.status(403).json({ error: 'not permitted' });
  const patch = {};
  for (const k of ['title', 'body', 'is_active', 'sort_order']) if (k in req.body) patch[k] = req.body[k];
  if ('sort_order' in patch) patch.sort_order = Number(patch.sort_order) || 0;
  const { data, error } = await supabaseAdmin.from('rebuttals')
    .update(patch).eq('id', req.params.id).eq('org_id', me.org_id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});
r.delete('/rebuttals/:id', async (req, res) => {
  const me = await canManage(req.user.id);
  if (!me) return res.status(403).json({ error: 'not permitted' });
  const { error } = await supabaseAdmin.from('rebuttals').delete().eq('id', req.params.id).eq('org_id', me.org_id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

// ---- Email test ----
r.get('/email-status', async (req, res) => {
  res.json({ configured: mailConfigured() });
});
r.post('/test-email', async (req, res) => {
  const me = await canManage(req.user.id);
  if (!me) return res.status(403).json({ error: 'not permitted' });
  if (!mailConfigured()) return res.status(400).json({ error: 'SMTP is not configured yet' });
  const { data: u } = await supabaseAdmin.from('users').select('email').eq('id', req.user.id).single();
  try {
    await sendMail({ to: u.email, subject: 'Coverwise test email', html: '<p>Your Coverwise email is configured and working.</p>' });
    res.json({ ok: true, to: u.email });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---- Carriers ----
r.get('/carriers', async (req, res) => {
  const org = await myOrg(req.user.id);
  const { data, error } = await supabaseAdmin.from('carriers').select('*').eq('org_id', org).order('name');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});
r.post('/carriers', async (req, res) => {
  const me = await canManage(req.user.id);
  if (!me) return res.status(403).json({ error: 'not permitted' });
  const { data, error } = await supabaseAdmin.from('carriers')
    .insert({ org_id: me.org_id, name: req.body.name, agency_pct: req.body.agency_pct ?? 0 }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});
r.patch('/carriers/:id', async (req, res) => {
  const me = await canManage(req.user.id);
  if (!me) return res.status(403).json({ error: 'not permitted' });
  const patch = {};
  for (const k of ['name', 'agency_pct', 'is_active']) if (k in req.body) patch[k] = req.body[k];
  const { data, error } = await supabaseAdmin.from('carriers').update(patch).eq('id', req.params.id).eq('org_id', me.org_id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});
r.delete('/carriers/:id', async (req, res) => {
  const me = await canManage(req.user.id);
  if (!me) return res.status(403).json({ error: 'not permitted' });
  const { error } = await supabaseAdmin.from('carriers').delete().eq('id', req.params.id).eq('org_id', me.org_id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

// ---- Commission rates (comp level per person per carrier) ----
r.get('/commission-rates', async (req, res) => {
  const org = await myOrg(req.user.id);
  const { data, error } = await supabaseAdmin.from('commission_rates').select('*').eq('org_id', org);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});
r.put('/commission-rates', async (req, res) => {
  const me = await canManage(req.user.id);
  if (!me) return res.status(403).json({ error: 'not permitted' });
  const { carrier_id, user_id, pct } = req.body;
  if (!carrier_id || !user_id) return res.status(400).json({ error: 'carrier_id and user_id required' });
  const { data, error } = await supabaseAdmin.from('commission_rates')
    .upsert({ org_id: me.org_id, carrier_id, user_id, pct: Number(pct) || 0 }, { onConflict: 'carrier_id,user_id' })
    .select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

export default r;
