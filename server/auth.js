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
