import { supabaseAdmin, supabaseForToken } from './supabase.js';

// Verifies the Supabase JWT and attaches:
//   req.user  — the authenticated auth user
//   req.token — the raw JWT
//   req.sb    — a Supabase client scoped to this user (RLS applies as them)
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing token' });

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: 'invalid token' });

  req.user = data.user;
  req.token = token;
  req.sb = supabaseForToken(token);
  next();
}

// Load the caller's profile (role, org_id, full_name) into req.profile for any
// authenticated user. Use on routers that scope by org but aren't admin-only.
export async function loadProfile(req, res, next) {
  if (req.profile) return next();
  const { data, error } = await req.sb
    .from('users').select('id, role, org_id, full_name').eq('id', req.user.id).single();
  if (error) return res.status(400).json({ error: error.message });
  req.profile = data;
  next();
}

// Gate a route to admins / super_admins. Loads the caller's profile into
// req.profile (role + org_id) for downstream org-scoping checks.
export async function requireAdmin(req, res, next) {
  const { data, error } = await req.sb
    .from('users').select('role, org_id').eq('id', req.user.id).single();
  if (error) return res.status(400).json({ error: error.message });
  if (!['admin', 'super_admin'].includes(data.role)) {
    return res.status(403).json({ error: 'admins only' });
  }
  req.profile = data;
  next();
}
