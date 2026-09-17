import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  async function signIn(e) {
    e.preventDefault();
    setErr('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setErr(error.message);
  }

  return (
    <div style={{ maxWidth: 320, margin: '80px auto', fontFamily: 'system-ui' }}>
      <h1>FEX CRM</h1>
      <form onSubmit={signIn}>
        <input placeholder="Email" value={email}
               onChange={e => setEmail(e.target.value)}
               style={{ display: 'block', width: '100%', margin: '8px 0', padding: 8 }} />
        <input placeholder="Password" type="password" value={password}
               onChange={e => setPassword(e.target.value)}
               style={{ display: 'block', width: '100%', margin: '8px 0', padding: 8 }} />
        <button type="submit" style={{ padding: '8px 16px' }}>Sign in</button>
      </form>
      {err && <p style={{ color: 'crimson' }}>{err}</p>}
    </div>
  );
}
