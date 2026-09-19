import { useState } from 'react';
import { supabase } from '../supabaseClient';

// Shown when the user arrives from a password-recovery email link.
export default function ResetPassword({ onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function save(e) {
    e.preventDefault();
    setErr('');
    if (password.length < 6) return setErr('Password must be at least 6 characters.');
    if (password !== confirm) return setErr('Passwords do not match.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setErr(error.message);
    setDone(true);
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
      <div className="card" style={{ width: 360 }}>
        <img src="/coverwise-logo.png" alt="Coverwise" style={{ height: 34, display: 'block', margin: '4px auto 20px' }} />
        {done ? (
          <div className="stack">
            <p className="ok" style={{ margin: 0 }}>Your password has been updated.</p>
            <button className="btn" onClick={() => { supabase.auth.signOut(); onDone?.(); }}>Go to sign in</button>
          </div>
        ) : (
          <form onSubmit={save} className="stack">
            <div className="section-title" style={{ margin: 0 }}>Set a new password</div>
            <div className="field"><label>New password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></div>
            <div className="field"><label>Confirm password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></div>
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
            {err && <p className="error" style={{ marginBottom: 0 }}>{err}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
