import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api } from '../api';

const ROLES = ['agent', 'manager', 'admin'];

export default function UserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [managers, setManagers] = useState([]);
  const [licenses, setLicenses] = useState([]);
  const [appts, setAppts] = useState([]);
  const [lic, setLic] = useState({ state: '', license_no: '', expires_at: '' });
  const [appt, setAppt] = useState({ carrier: '', status: 'active' });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [pw, setPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');

  async function resetPw() {
    setErr(''); setPwMsg('');
    if (!pw || pw.length < 6) { setErr('Password must be at least 6 characters.'); return; }
    try {
      await api(`/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password: pw }) });
      setPwMsg('Password updated. Share it with the user securely.');
      setPw('');
    } catch (e) { setErr(e.message); }
  }

  async function loadAll() {
    const [u, all, l, a] = await Promise.all([
      api(`/users/${id}`), api('/users'),
      api(`/users/${id}/licenses`), api(`/users/${id}/appointments`)
    ]);
    setUser(u);
    setManagers(all.filter((m) => m.role === 'manager' && m.id !== id));
    setLicenses(l); setAppts(a);
  }
  useEffect(() => { loadAll().catch((e) => setErr(e.message)); }, [id]);

  const setU = (k) => (e) =>
    setUser((u) => ({ ...u, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function saveProfile(e) {
    e.preventDefault(); setErr(''); setMsg('');
    try {
      await api(`/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          full_name: user.full_name, role: user.role,
          manager_id: user.manager_id || null, phone: user.phone, is_active: user.is_active
        })
      });
      setMsg('Saved.');
    } catch (e) { setErr(e.message); }
  }

  async function addLicense(e) {
    e.preventDefault(); setErr('');
    try {
      await api(`/users/${id}/licenses`, { method: 'POST', body: JSON.stringify(lic) });
      setLic({ state: '', license_no: '', expires_at: '' });
      setLicenses(await api(`/users/${id}/licenses`));
    } catch (e) { setErr(e.message); }
  }
  async function removeLicense(licId) {
    try { await api(`/users/${id}/licenses/${licId}`, { method: 'DELETE' }); setLicenses(await api(`/users/${id}/licenses`)); }
    catch (e) { setErr(e.message); }
  }
  async function addAppt(e) {
    e.preventDefault(); setErr('');
    try {
      await api(`/users/${id}/appointments`, { method: 'POST', body: JSON.stringify(appt) });
      setAppt({ carrier: '', status: 'active' });
      setAppts(await api(`/users/${id}/appointments`));
    } catch (e) { setErr(e.message); }
  }
  async function removeAppt(apptId) {
    try { await api(`/users/${id}/appointments/${apptId}`, { method: 'DELETE' }); setAppts(await api(`/users/${id}/appointments`)); }
    catch (e) { setErr(e.message); }
  }

  if (!user) return <Layout><p className="muted">Loading…</p></Layout>;

  return (
    <Layout>
      <div className="page-head">
        <h1>{user.full_name || user.email}</h1>
        <button className="btn-ghost" onClick={() => navigate('/users')}>← Back to Users</button>
      </div>
      {err && <p className="error">{err}</p>}
      {msg && <p className="ok">{msg}</p>}

      <div className="stack">
        <form className="card" onSubmit={saveProfile}>
          <div className="section-title">Profile</div>
          <div className="form-grid">
            <div className="field"><label>Full name</label>
              <input value={user.full_name || ''} onChange={setU('full_name')} /></div>
            <div className="field"><label>Email</label>
              <input value={user.email || ''} disabled /></div>
            <div className="field"><label>Phone</label>
              <input value={user.phone || ''} onChange={setU('phone')} /></div>
            <div className="field"><label>Role</label>
              <select value={user.role} onChange={setU('role')}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                {user.role === 'super_admin' && <option value="super_admin">super_admin</option>}
              </select></div>
            <div className="field"><label>Manager</label>
              <select value={user.manager_id || ''} onChange={setU('manager_id')}>
                <option value="">— None —</option>
                {managers.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
              </select></div>
            <div className="field"><label>Active</label>
              <div className="checkbox-row">
                <input type="checkbox" checked={!!user.is_active} onChange={setU('is_active')} />
                <span className="muted">Can log in and receive leads</span>
              </div></div>
          </div>
          <div className="row-actions" style={{ marginTop: 18 }}>
            <button className="btn" type="submit">Save profile</button>
          </div>
        </form>

        <div className="card">
          <div className="section-title">Reset password</div>
          <p className="muted" style={{ marginTop: 0 }}>Set a new password for this user and share it with them securely. They can change it later from their own account.</p>
          <div className="filters" style={{ marginBottom: 0 }}>
            <input type="text" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} />
            <button className="btn-ghost btn-sm" type="button" onClick={() => setPw(Math.random().toString(36).slice(2, 10) + 'A1')}>Generate</button>
            <button className="btn" type="button" onClick={resetPw}>Set password</button>
          </div>
          {pwMsg && <p className="ok" style={{ marginBottom: 0 }}>{pwMsg}</p>}
        </div>

        <div className="card">
          <div className="section-title">State licenses</div>
          <p className="muted" style={{ marginTop: 0 }}>Round-robin only assigns state-filtered sources to agents licensed in the lead's state.</p>
          <form className="filters" onSubmit={addLicense}>
            <input type="text" placeholder="State" maxLength={2} style={{ width: 80 }} value={lic.state} onChange={(e) => setLic({ ...lic, state: e.target.value })} required />
            <input type="text" placeholder="License #" value={lic.license_no} onChange={(e) => setLic({ ...lic, license_no: e.target.value })} />
            <input type="date" title="Expires" value={lic.expires_at} onChange={(e) => setLic({ ...lic, expires_at: e.target.value })} />
            <button className="btn" type="submit">Add license</button>
          </form>
          {licenses.length === 0 ? <p className="muted">No licenses.</p> : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>State</th><th>License #</th><th>Expires</th><th></th></tr></thead>
                <tbody>
                  {licenses.map((l) => (
                    <tr key={l.id}>
                      <td>{l.state}</td><td>{l.license_no || '—'}</td>
                      <td>{l.expires_at || '—'}</td>
                      <td><button className="btn-ghost btn-sm" onClick={() => removeLicense(l.id)}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="section-title">Carrier appointments</div>
          <form className="filters" onSubmit={addAppt}>
            <input type="text" placeholder="Carrier" value={appt.carrier} onChange={(e) => setAppt({ ...appt, carrier: e.target.value })} required />
            <select value={appt.status} onChange={(e) => setAppt({ ...appt, status: e.target.value })}>
              <option value="active">active</option>
              <option value="pending">pending</option>
              <option value="inactive">inactive</option>
            </select>
            <button className="btn" type="submit">Add appointment</button>
          </form>
          {appts.length === 0 ? <p className="muted">No appointments.</p> : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Carrier</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {appts.map((a) => (
                    <tr key={a.id}>
                      <td>{a.carrier}</td><td>{a.status}</td>
                      <td><button className="btn-ghost btn-sm" onClick={() => removeAppt(a.id)}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
