import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Dashboard() {
  const [me, setMe] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setErr('Could not load profile (is your users row set up?)'); return; }
      setMe(await res.json());
    })();
  }, []);

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Dashboard</h1>
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
      {err && <p style={{ color: 'crimson' }}>{err}</p>}
      {me ? (
        <>
          <p>Signed in as <strong>{me.auth.email}</strong></p>
          <p>Role: <strong>{me.profile?.role ?? '—'}</strong></p>
          <p style={{ color: '#666' }}>Phase 0 shell is working. Lead screens come next.</p>
        </>
      ) : (!err && <p>Loading…</p>)}
    </div>
  );
}
