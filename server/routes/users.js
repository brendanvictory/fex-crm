import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { supabaseAdmin } from '../supabase.js';
import { sendMail } from '../lib/mailer.js';

const r = Router();

// GET /api/users — list (RLS: admins see org, managers see their agents).
r.get('/', async (req, res) => {
  const { data, error } = await req.sb
    .from('users')
    .select('id, full_name, email, role, manager_id, phone, is_active, manager:manager_id(full_name)')
    .order('full_name');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// GET /api/users/:id
r.get('/:id', async (req, res) => {
  const { data, error } = await req.sb
    .from('users').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: error.message });
  res.json(data);
});

// POST /api/users — create a login + profile. Admin only.
r.post('/', requireAdmin, async (req, res) => {
  const { email, password, full_name, role = 'agent', manager_id = null, phone = null, org_id } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  if (!['admin', 'manager', 'agent', 'super_admin'].includes(role))
    return res.status(400).json({ error: 'invalid role' });
  if (role === 'super_admin' && req.profile.role !== 'super_admin')
    return res.status(403).json({ error: 'only a super admin can create a super admin' });

  const targetOrg = req.profile.role === 'super_admin' && org_id ? org_id : req.profile.org_id;

  const { data: created, error: ce } = await supabaseAdmin.auth.admin.createUser({
    email, password, email_confirm: true
  });
  if (ce) return res.status(400).json({ error: ce.message });

  const uid = created.user.id;
  const { data, error } = await supabaseAdmin.from('users').insert({
    id: uid, org_id: targetOrg, role, manager_id, full_name, email, phone, is_active: true
  }).select().single();

  if (error) {
    await supabaseAdmin.auth.admin.deleteUser(uid); // roll back the orphaned auth user
    return res.status(400).json({ error: error.message });
  }

  // Welcome email with sign-in details (non-blocking; no-ops if SMTP is off).
  const appUrl = process.env.PUBLIC_BASE_URL || '';
  sendMail({
    to: email,
    subject: 'Your Coverwise login',
    html: `<p>Hi ${full_name || ''},</p>
      <p>An account has been created for you in Coverwise.</p>
      <p><strong>Sign in:</strong> <a href="${appUrl}">${appUrl}</a><br/>
      <strong>Email:</strong> ${email}<br/>
      <strong>Temporary password:</strong> ${password}</p>
      <p>Please sign in and change your password from Settings.</p>`
  }).catch(() => { /* email is best-effort */ });

  res.status(201).json(data);
});

// PATCH /api/users/:id — update profile fields. Admin only, same-org.
r.patch('/:id', requireAdmin, async (req, res) => {
  const { data: target, error: te } = await supabaseAdmin
    .from('users').select('org_id').eq('id', req.params.id).single();
  if (te) return res.status(404).json({ error: te.message });
  if (req.profile.role !== 'super_admin' && target.org_id !== req.profile.org_id)
    return res.status(403).json({ error: 'out of scope' });

  const allowed = ['full_name', 'role', 'manager_id', 'phone', 'is_active'];
  const patch = {};
  for (const k of allowed) if (k in req.body) patch[k] = req.body[k];

  const { data, error } = await supabaseAdmin
    .from('users').update(patch).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// POST /api/users/:id/reset-password — admin sets a new password for a user.
r.post('/:id/reset-password', requireAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });

  const { data: target, error: te } = await supabaseAdmin.from('users').select('org_id').eq('id', req.params.id).single();
  if (te) return res.status(404).json({ error: te.message });
  if (req.profile.role !== 'super_admin' && target.org_id !== req.profile.org_id)
    return res.status(403).json({ error: 'out of scope' });

  const { error } = await supabaseAdmin.auth.admin.updateUserById(req.params.id, { password });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// ---- Licenses ----
r.get('/:id/licenses', async (req, res) => {
  const { data, error } = await req.sb
    .from('agent_licenses').select('*').eq('user_id', req.params.id).order('state');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});
r.post('/:id/licenses', requireAdmin, async (req, res) => {
  const row = {
    user_id: req.params.id,
    state: String(req.body.state || '').toUpperCase().slice(0, 2),
    license_no: req.body.license_no || null,
    expires_at: req.body.expires_at || null
  };
  if (!row.state) return res.status(400).json({ error: 'state required' });
  const { data, error } = await supabaseAdmin.from('agent_licenses').insert(row).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});
r.delete('/:id/licenses/:licenseId', requireAdmin, async (req, res) => {
  const { error } = await supabaseAdmin.from('agent_licenses').delete().eq('id', req.params.licenseId);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

// ---- Carrier appointments ----
r.get('/:id/appointments', async (req, res) => {
  const { data, error } = await req.sb
    .from('agent_appointments').select('*').eq('user_id', req.params.id).order('carrier');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});
r.post('/:id/appointments', requireAdmin, async (req, res) => {
  const row = {
    user_id: req.params.id,
    carrier: req.body.carrier,
    status: req.body.status || 'active'
  };
  if (!row.carrier) return res.status(400).json({ error: 'carrier required' });
  const { data, error } = await supabaseAdmin.from('agent_appointments').insert(row).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});
r.delete('/:id/appointments/:apptId', requireAdmin, async (req, res) => {
  const { error } = await supabaseAdmin.from('agent_appointments').delete().eq('id', req.params.apptId);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

export default r;
