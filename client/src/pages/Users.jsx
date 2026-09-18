import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api } from '../api';

const ROLES = ['agent', 'manager', 'admin'];

export default function Users() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [me, setMe] = useState(null);
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'agent', manager_id: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    try { setUsers(await api('/users')); } catch (e) { setErr(e.message); }
  }
  useEffect(() => {
    api('/me').then(setMe).catch(() => {});
    load();
  }, []);

  const isAdmin = me?.profile && ['admin', 'super_admin'].includes(me.profile.role);
  const managers = users.filter((u) => u.role === 'manager');

  async function create(e) {
    e.preventDefault();
    setSaving(true); setErr(''); setMsg('');
    try {
      const body = { ...form, manager_id: form.manager_id || null };
      await api('/users', { method: 'POST', body: JSON.stringify(body) });
      setMsg(`Created ${form.email}.`);
      setForm({ full_name: '', email: '', password: '', role: 'agent', manager_id: '', phone: '' });
      load();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  return (
    <Layout>
      <div className="page-head"><h1>Users</h1></div>
      {err && <p className="error">{err}</p>}
      {msg && <p className="ok">{msg}</p>}

      <div className="stack">
        {isAdmin && (
          <div className="card">
            <div className="section-title">Add a user</div>
            <form className="form-grid" onSubmit={create}>
              <div className="field"><label>Full name</label>
                <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></div>
              <div className="field"><label>Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
              <div className="field"><label>Temporary password</label>
                <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} /></div>
              <div className="field"><label>Phone</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="field"><label>Role</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select></div>
              <div className="field"><label>Manager</label>
                <select value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value })}>
                  <option value="">— None —</option>
                  {managers.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
                </select></div>
              <div className="field full">
                <button className="btn" type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create user'}</button>
              </div>
            </form>
          </div>
        )}

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Manager</th><th>Active</th></tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={5} className="muted">No users yet.</td></tr>
              ) : users.map((u) => (
                <tr key={u.id} className="clickable" onClick={() => navigate(`/users/${u.id}`)}>
                  <td>{u.full_name || <span className="muted">(no name)</span>}</td>
                  <td>{u.email}</td>
                  <td><span className="badge">{u.role}</span></td>
                  <td>{u.manager?.full_name || <span className="muted">—</span>}</td>
                  <td>{u.is_active ? 'Yes' : <span className="muted">No</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
