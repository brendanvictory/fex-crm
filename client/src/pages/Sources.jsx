import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import { api } from '../api';

const ingestUrl = `${window.location.origin}/api/ingest`;

export default function Sources() {
  const [sources, setSources] = useState([]);
  const [err, setErr] = useState('');
  const [reveal, setReveal] = useState({});
  const [form, setForm] = useState({ name: '', strategy: 'round_robin', state_license: true, cost_per_lead: '' });
  const [saving, setSaving] = useState(false);

  async function load() {
    try { setSources(await api('/config/sources')); }
    catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    setSaving(true); setErr('');
    try {
      const body = {
        name: form.name,
        assignment_rule: { strategy: form.strategy, state_license: form.state_license },
        cost_per_lead: form.cost_per_lead === '' ? null : Number(form.cost_per_lead),
        is_active: true
      };
      await api('/config/sources', { method: 'POST', body: JSON.stringify(body) });
      setForm({ name: '', strategy: 'round_robin', state_license: true, cost_per_lead: '' });
      load();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  async function toggleActive(s) {
    try { await api(`/config/sources/${s.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !s.is_active }) }); load(); }
    catch (e) { setErr(e.message); }
  }
  async function rotate(s) {
    try { await api(`/config/sources/${s.id}/rotate-key`, { method: 'POST' }); load(); }
    catch (e) { setErr(e.message); }
  }

  return (
    <Layout>
      <div className="page-head"><h1>Lead Sources</h1></div>
      {err && <p className="error">{err}</p>}

      <div className="stack">
        <div className="card">
          <div className="section-title">Add a source</div>
          <form className="form-grid" onSubmit={create}>
            <div className="field">
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Facebook Vendor A" />
            </div>
            <div className="field">
              <label>Assignment strategy</label>
              <select value={form.strategy} onChange={(e) => setForm({ ...form, strategy: e.target.value })}>
                <option value="round_robin">Round-robin (least loaded)</option>
                <option value="manual">Manual (leave unassigned)</option>
              </select>
            </div>
            <div className="field">
              <label>Cost per lead ($)</label>
              <input type="number" step="0.01" value={form.cost_per_lead} onChange={(e) => setForm({ ...form, cost_per_lead: e.target.value })} />
            </div>
            <div className="field">
              <label>State licensing</label>
              <div className="checkbox-row">
                <input type="checkbox" checked={form.state_license} onChange={(e) => setForm({ ...form, state_license: e.target.checked })} />
                <span className="muted">Only assign to agents licensed in the lead's state</span>
              </div>
            </div>
            <div className="field full">
              <button className="btn" type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add source'}</button>
            </div>
          </form>
        </div>

        <div className="callout">
          External vendors post leads to <code className="key">{ingestUrl}</code> with header
          {' '}<code className="key">X-API-Key: &lt;the source's key&gt;</code> and a JSON body
          (first_name, last_name, phone, email, state, dob, tobacco, coverage_amount, …).
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Name</th><th>API key</th><th>Strategy</th><th>State license</th><th>Cost/lead</th><th>Active</th><th></th></tr>
            </thead>
            <tbody>
              {sources.length === 0 ? (
                <tr><td colSpan={7} className="muted">No sources yet. Add one above.</td></tr>
              ) : sources.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>
                    <code className="key">{reveal[s.id] ? s.api_key : '•••••••• ' + (s.api_key || '').slice(-6)}</code>{' '}
                    <button className="btn-ghost btn-sm" onClick={() => setReveal((r) => ({ ...r, [s.id]: !r[s.id] }))}>
                      {reveal[s.id] ? 'Hide' : 'Show'}
                    </button>{' '}
                    <button className="btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(s.api_key)}>Copy</button>
                  </td>
                  <td>{s.assignment_rule?.strategy || '—'}</td>
                  <td>{s.assignment_rule?.state_license ? 'Yes' : 'No'}</td>
                  <td>{s.cost_per_lead != null ? `$${s.cost_per_lead}` : '—'}</td>
                  <td>{s.is_active ? <span className="badge">Active</span> : <span className="muted">Off</span>}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn-ghost btn-sm" onClick={() => toggleActive(s)}>{s.is_active ? 'Disable' : 'Enable'}</button>
                      <button className="btn-ghost btn-sm" onClick={() => rotate(s)}>Rotate key</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
