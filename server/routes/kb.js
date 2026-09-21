import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';

const r = Router();

// Which article audiences a role may read.
function allowedAudiences(role) {
  if (role === 'agent') return ['all', 'agent'];
  return ['all', 'agent', 'manager']; // manager, admin, super_admin
}
function isAdmin(role) { return role === 'admin' || role === 'super_admin'; }
function isManagerUp(role) { return role === 'manager' || isAdmin(role); }

function slugify(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'untitled';
}

// ---- Categories ----
r.get('/categories', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('kb_categories').select('*')
    .eq('org_id', req.profile.org_id)
    .order('sort_order').order('name');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

r.post('/categories', async (req, res) => {
  if (!isManagerUp(req.profile.role)) return res.status(403).json({ error: 'not allowed' });
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  const row = {
    org_id: req.profile.org_id, name,
    slug: slugify(req.body.slug || name),
    sort_order: Number(req.body.sort_order) || 0
  };
  const { data, error } = await supabaseAdmin.from('kb_categories').insert(row).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

r.patch('/categories/:id', async (req, res) => {
  if (!isManagerUp(req.profile.role)) return res.status(403).json({ error: 'not allowed' });
  const patch = {};
  if ('name' in req.body) patch.name = req.body.name;
  if ('sort_order' in req.body) patch.sort_order = Number(req.body.sort_order) || 0;
  const { data, error } = await supabaseAdmin
    .from('kb_categories').update(patch)
    .eq('id', req.params.id).eq('org_id', req.profile.org_id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

r.delete('/categories/:id', async (req, res) => {
  if (!isManagerUp(req.profile.role)) return res.status(403).json({ error: 'not allowed' });
  const { error } = await supabaseAdmin
    .from('kb_categories').delete()
    .eq('id', req.params.id).eq('org_id', req.profile.org_id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

// ---- Articles ----
// GET /articles?category=<id>&q=<search>&manage=1
r.get('/articles', async (req, res) => {
  const manage = req.query.manage === '1' && isManagerUp(req.profile.role);
  let q = supabaseAdmin
    .from('kb_articles')
    .select('id, title, slug, category_id, audience, sort_order, is_published, updated_at')
    .eq('org_id', req.profile.org_id);

  if (!manage) {
    q = q.eq('is_published', true).in('audience', allowedAudiences(req.profile.role));
  }
  if (req.query.category) q = q.eq('category_id', req.query.category);
  if (req.query.q) {
    const term = `%${req.query.q}%`;
    q = q.or(`title.ilike.${term},body.ilike.${term}`);
  }
  q = q.order('sort_order').order('title');
  const { data, error } = await q;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// GET /articles/:idOrSlug — full article body.
r.get('/articles/:key', async (req, res) => {
  const key = req.params.key;
  const isUuid = /^[0-9a-f-]{36}$/i.test(key);
  let q = supabaseAdmin.from('kb_articles').select('*').eq('org_id', req.profile.org_id);
  q = isUuid ? q.eq('id', key) : q.eq('slug', key);
  const { data, error } = await q.maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'not found' });
  // Visibility check for non-managers.
  if (!isManagerUp(req.profile.role)) {
    if (!data.is_published || !allowedAudiences(req.profile.role).includes(data.audience))
      return res.status(404).json({ error: 'not found' });
  }
  res.json(data);
});

r.post('/articles', async (req, res) => {
  if (!isManagerUp(req.profile.role)) return res.status(403).json({ error: 'not allowed' });
  const title = (req.body.title || '').trim();
  if (!title) return res.status(400).json({ error: 'title required' });
  const row = {
    org_id: req.profile.org_id,
    title,
    slug: slugify(req.body.slug || title),
    body: req.body.body || '',
    category_id: req.body.category_id || null,
    audience: ['all', 'agent', 'manager'].includes(req.body.audience) ? req.body.audience : 'all',
    sort_order: Number(req.body.sort_order) || 0,
    is_published: req.body.is_published !== false,
    updated_by: req.user.id
  };
  const { data, error } = await supabaseAdmin.from('kb_articles').insert(row).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

r.patch('/articles/:id', async (req, res) => {
  if (!isManagerUp(req.profile.role)) return res.status(403).json({ error: 'not allowed' });
  const allowed = ['title', 'body', 'category_id', 'audience', 'sort_order', 'is_published'];
  const patch = { updated_by: req.user.id, updated_at: new Date().toISOString() };
  for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
  if ('audience' in patch && !['all', 'agent', 'manager'].includes(patch.audience)) delete patch.audience;
  if ('sort_order' in patch) patch.sort_order = Number(patch.sort_order) || 0;
  if ('category_id' in patch && !patch.category_id) patch.category_id = null;
  const { data, error } = await supabaseAdmin
    .from('kb_articles').update(patch)
    .eq('id', req.params.id).eq('org_id', req.profile.org_id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

r.delete('/articles/:id', async (req, res) => {
  if (!isManagerUp(req.profile.role)) return res.status(403).json({ error: 'not allowed' });
  const { error } = await supabaseAdmin
    .from('kb_articles').delete()
    .eq('id', req.params.id).eq('org_id', req.profile.org_id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

export default r;
