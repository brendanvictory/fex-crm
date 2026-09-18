import { supabase } from './supabaseClient';

// Authenticated fetch against our /api. Adds the Supabase JWT and JSON headers,
// throws on non-2xx with the server's error message.
export async function api(path, opts = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {})
    }
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(e.error || 'Request failed');
  }
  return res.status === 204 ? null : res.json();
}
