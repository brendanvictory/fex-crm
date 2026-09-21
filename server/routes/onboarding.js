import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';

const r = Router();

function isAdmin(role) { return role === 'admin' || role === 'super_admin'; }
function isManagerUp(role) { return role === 'manager' || isAdmin(role); }
function allowedAudiences(role) {
  if (role === 'agent') return ['all', 'agent'];
  return ['all', 'agent', 'manager'];
}

// GET /tasks — the caller's onboarding checklist with their completion state.
r.get('/tasks', async (req, res) => {
  const { org_id, role } = req.profile;
  const { data: tasks, error } = await supabaseAdmin
    .from('onboarding_tasks').select('*')
    .eq('org_id', org_id).eq('is_active', true)
    .in('audience', allowedAudiences(role))
    .order('sort_order').order('created_at');
  if (error) return res.status(400).json({ error: error.message });

  const { data: prog } = await supabaseAdmin
    .from('onboarding_progress').select('task_id, completed_at')
    .eq('user_id', req.user.id);
  const done = new Map((prog || []).map((p) => [p.task_id, p.completed_at]));

  res.json(tasks.map((t) => ({ ...t, completed_at: done.get(t.id) || null })));
});

// POST /tasks/:id/complete — mark done for the current user (idempotent).
r.post('/tasks/:id/complete', async (req, res) => {
  const row = {
    org_id: req.profile.org_id, user_id: req.user.id,
    task_id: req.params.id, completed_at: new Date().toISOString()
  };
  const { error } = await supabaseAdmin
    .from('onboarding_progress').upsert(row, { onConflict: 'user_id,task_id' });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// DELETE /tasks/:id/complete — un-check.
r.delete('/tasks/:id/complete', async (req, res) => {
  const { error } = await supabaseAdmin
    .from('onboarding_progress').delete()
    .eq('user_id', req.user.id).eq('task_id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

// ---- Management (managers/admins) ----
r.post('/tasks', async (req, res) => {
  if (!isManagerUp(req.profile.role)) return res.status(403).json({ error: 'not allowed' });
  const title = (req.body.title || '').trim();
  if (!title) return res.status(400).json({ error: 'title required' });
  const row = {
    org_id: req.profile.org_id, title,
    description: req.body.description || '',
    audience: ['all', 'agent', 'manager'].includes(req.body.audience) ? req.body.audience : 'all',
    link: req.body.link || null,
    sort_order: Number(req.body.sort_order) || 0,
    is_active: req.body.is_active !== false
  };
  const { data, error } = await supabaseAdmin.from('onboarding_tasks').insert(row).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

r.patch('/tasks/:id', async (req, res) => {
  if (!isManagerUp(req.profile.role)) return res.status(403).json({ error: 'not allowed' });
  const allowed = ['title', 'description', 'audience', 'link', 'sort_order', 'is_active'];
  const patch = {};
  for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
  if ('audience' in patch && !['all', 'agent', 'manager'].includes(patch.audience)) delete patch.audience;
  if ('sort_order' in patch) patch.sort_order = Number(patch.sort_order) || 0;
  if ('link' in patch && !patch.link) patch.link = null;
  const { data, error } = await supabaseAdmin
    .from('onboarding_tasks').update(patch)
    .eq('id', req.params.id).eq('org_id', req.profile.org_id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

r.delete('/tasks/:id', async (req, res) => {
  if (!isManagerUp(req.profile.role)) return res.status(403).json({ error: 'not allowed' });
  const { error } = await supabaseAdmin
    .from('onboarding_tasks').delete()
    .eq('id', req.params.id).eq('org_id', req.profile.org_id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

// GET /team — completion overview for managers/admins.
// Managers see their downline; admins see the whole org.
r.get('/team', async (req, res) => {
  const { role, org_id } = req.profile;
  if (!isManagerUp(role)) return res.status(403).json({ error: 'not allowed' });

  let usersQ = supabaseAdmin
    .from('users').select('id, full_name, email, role, manager_id')
    .eq('org_id', org_id).eq('is_active', true);
  if (!isAdmin(role)) usersQ = usersQ.eq('manager_id', req.user.id);
  const { data: users, error: ue } = await usersQ.order('full_name');
  if (ue) return res.status(400).json({ error: ue.message });

  const { data: tasks } = await supabaseAdmin
    .from('onboarding_tasks').select('id, audience').eq('org_id', org_id).eq('is_active', true);
  const { data: prog } = await supabaseAdmin
    .from('onboarding_progress').select('user_id, task_id').eq('org_id', org_id);

  const doneByUser = new Map();
  (prog || []).forEach((p) => {
    if (!doneByUser.has(p.user_id)) doneByUser.set(p.user_id, new Set());
    doneByUser.get(p.user_id).add(p.task_id);
  });

  const rows = (users || []).map((u) => {
    const aud = allowedAudiences(u.role);
    const applicable = (tasks || []).filter((t) => aud.includes(t.audience));
    const doneSet = doneByUser.get(u.id) || new Set();
    const completed = applicable.filter((t) => doneSet.has(t.id)).length;
    return { id: u.id, full_name: u.full_name, email: u.email, role: u.role,
      total: applicable.length, completed };
  });
  res.json(rows);
});

export default r;
