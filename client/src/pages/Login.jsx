import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Login() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function signIn(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setErr(error.message);
    setBusy(false);
  }

  async function sendReset(e) {
    e.preventDefault();
    setErr(''); setMsg(''); setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    setBusy(false);
    if (error) setErr(error.message);
    else setMsg('If that email is on file, a reset link is on its way. Check your inbox.');
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
      <div className="card" style={{ width: 340 }}>
        <img src="/coverwise-logo.png" alt="Coverwise" style={{ height: 34, display: 'block', margin: '4px auto 20px' }} />

        {mode === 'signin' ? (
          <>
            <form onSubmit={signIn} className="stack">
              <div className="field"><label>Email</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></div>
              <div className="field"><label>Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></div>
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
            </form>
            <button className="link-btn" onClick={() => { setMode('forgot'); setErr(''); setMsg(''); }}>Forgot password?</button>
          </>
        ) : (
          <>
            <form onSubmit={sendReset} className="stack">
              <div className="section-title" style={{ margin: 0 }}>Reset your password</div>
              <div className="field"><label>Email</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></div>
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
            </form>
            <button className="link-btn" onClick={() => { setMode('signin'); setErr(''); setMsg(''); }}>← Back to sign in</button>
          </>
        )}

        {msg && <p className="ok" style={{ marginBottom: 0 }}>{msg}</p>}
        {err && <p className="error" style={{ marginBottom: 0 }}>{err}</p>}
      </div>
    </div>
  );
}
