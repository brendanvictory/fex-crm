import { useState } from 'react';
import { supabase } from '../supabaseClient';
import PartnerDashboard from '../partner/PartnerDashboard.jsx';

export default function PartnerPortal() {
  const [showPw, setShowPw] = useState(false);
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function changePw() {
    setMsg(''); setErr('');
    if (!pw || pw.length < 6) { setErr('Password must be at least 6 characters.'); return; }
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) setErr(error.message); else { setMsg('Password updated.'); setPw(''); setShowPw(false); }
  }

  return (
    <div className="partner-shell">
      <header className="partner-top">
        <div className="partner-brand">
          <img src="/coverwise-logo.png" alt="Coverwise" />
          <span className="partner-tag">Partner Portal</span>
        </div>
        <div className="row-actions">
          <button className="btn-ghost" onClick={() => setShowPw((s) => !s)}>Change password</button>
          <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>

      <main className="partner-main">
        {showPw && (
          <div className="card" style={{ maxWidth: 420 }}>
            <div className="section-title">Change your password</div>
            <div className="filters" style={{ marginBottom: 0 }}>
              <input type="password" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
              <button className="btn" onClick={changePw}>Update</button>
            </div>
            {msg && <p className="ok" style={{ marginBottom: 0 }}>{msg}</p>}
            {err && <p className="error" style={{ marginBottom: 0 }}>{err}</p>}
          </div>
        )}

        <div className="page-head"><h1>Your lead performance</h1></div>
        <PartnerDashboard />
      </main>
    </div>
  );
}
