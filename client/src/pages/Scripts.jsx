import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import { api } from '../api';

const FIELDS = ['first_name', 'last_name', 'age', 'gender', 'state', 'city', 'tobacco', 'beneficiary_name', 'beneficiary_relationship', 'coverage_amount'];

export default function Scripts() {
  const [scripts, setScripts] = useState([]);
  const [editing, setEditing] = useState(null); // {id?, name, body}
  const [err, setErr] = useState('');

  async function load() { try { setScripts(await api('/config/scripts')); } catch (e) { setErr(e.message); } }
  useEffect(() => { load(); }, []);

  function newScript() { setEditing({ name: '', body: 'Hi {{first_name}}, this is [your name] with Coverwise on a recorded line.\n\nI see you requested info on final expense coverage. I have you at {{age}} years old in {{state}} — is that right?\n\nAnd your beneficiary would be {{beneficiary_name}} ({{beneficiary_relationship}})?' }); }
  async function save() {
    setErr('');
    try {
      if (editing.id) await api(`/config/scripts/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ name: editing.name, body: editing.body }) });
      else await api('/config/scripts', { method: 'POST', body: JSON.stringify({ name: editing.name, body: editing.body }) });
      setEditing(null); load();
    } catch (e) { setErr(e.message); }
  }
  async function remove(id) { try { await api(`/config/scripts/${id}`, { method: 'DELETE' }); load(); } catch (e) { setErr(e.message); } }

  return (
    <Layout>
      <div className="page-head">
        <h1>Call Scripts</h1>
        {!editing && <button className="btn" onClick={newScript}>+ New Script</button>}
      </div>
      {err && <p className="error">{err}</p>}

      {editing ? (
        <div className="card stack">
          <div className="field">
            <label>Script name</label>
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Final Expense — Intro" />
          </div>
          <div className="field">
            <label>Script</label>
            <textarea style={{ minHeight: 240, fontFamily: 'inherit' }} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
          </div>
          <div className="callout">
            Insert lead fields with double braces — they fill in automatically on the call. Available:{' '}
            {FIELDS.map((f) => <code key={f} className="key" style={{ marginRight: 6 }}>{`{{${f}}}`}</code>)}
          </div>
          <div className="row-actions">
            <button className="btn" onClick={save} disabled={!editing.name}>Save script</button>
            <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Name</th><th>Preview</th><th></th></tr></thead>
            <tbody>
              {scripts.length === 0 ? <tr><td colSpan={3} className="muted">No scripts yet. Create one for agents to use on the dialer.</td></tr>
                : scripts.map((s) => (
                  <tr key={s.id}>
                    <td><strong>{s.name}</strong></td>
                    <td className="muted">{(s.body || '').slice(0, 80)}{(s.body || '').length > 80 ? '…' : ''}</td>
                    <td><div className="row-actions">
                      <button className="btn-ghost btn-sm" onClick={() => setEditing(s)}>Edit</button>
                      <button className="btn-ghost btn-sm" onClick={() => remove(s.id)}>Delete</button>
                    </div></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
