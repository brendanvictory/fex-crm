import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import { api } from '../api';

const FIELDS = ['first_name', 'last_name', 'age', 'gender', 'state', 'city', 'tobacco', 'beneficiary_name', 'beneficiary_relationship', 'coverage_amount'];

export default function Scripts() {
  const [tab, setTab] = useState('scripts');
  const [err, setErr] = useState('');

  return (
    <Layout>
      <div className="page-head"><h1>Scripts &amp; Rebuttals</h1></div>
      {err && <p className="error">{err}</p>}
      <div className="tabs">
        <button className={'tab' + (tab === 'scripts' ? ' active' : '')} onClick={() => setTab('scripts')}>Scripts</button>
        <button className={'tab' + (tab === 'rebuttals' ? ' active' : '')} onClick={() => setTab('rebuttals')}>Rebuttals</button>
      </div>
      {tab === 'scripts' ? <ScriptsTab setErr={setErr} /> : <RebuttalsTab setErr={setErr} />}
    </Layout>
  );
}

function ScriptsTab({ setErr }) {
  const [scripts, setScripts] = useState([]);
  const [editing, setEditing] = useState(null);

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

  if (editing) {
    return (
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
    );
  }

  return (
    <>
      <div className="row-actions" style={{ justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn" onClick={newScript}>+ New Script</button>
      </div>
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
    </>
  );
}

const BLANK_REB = { title: '', body: '', sort_order: 0, is_active: true };

function RebuttalsTab({ setErr }) {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);

  async function load() { try { setItems(await api('/config/rebuttals')); } catch (e) { setErr(e.message); } }
  useEffect(() => { load(); }, []);

  function newReb() { setEditing({ ...BLANK_REB, sort_order: items.length }); }
  async function save() {
    setErr('');
    try {
      const payload = { title: editing.title, body: editing.body, sort_order: Number(editing.sort_order) || 0, is_active: editing.is_active };
      if (editing.id) await api(`/config/rebuttals/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await api('/config/rebuttals', { method: 'POST', body: JSON.stringify(payload) });
      setEditing(null); load();
    } catch (e) { setErr(e.message); }
  }
  async function remove(id) { try { await api(`/config/rebuttals/${id}`, { method: 'DELETE' }); load(); } catch (e) { setErr(e.message); } }
  async function move(reb, dir) {
    const patch = { sort_order: (Number(reb.sort_order) || 0) + dir };
    try { await api(`/config/rebuttals/${reb.id}`, { method: 'PATCH', body: JSON.stringify(patch) }); load(); } catch (e) { setErr(e.message); }
  }

  if (editing) {
    return (
      <div className="card stack">
        <div className="field">
          <label>Objection (what the prospect says)</label>
          <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="e.g. I can't afford it." />
        </div>
        <div className="field">
          <label>Response</label>
          <textarea style={{ minHeight: 160, fontFamily: 'inherit' }} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} placeholder="What the agent should say back…" />
        </div>
        <div className="form-grid">
          <div className="field"><label>Order</label><input type="number" style={{ width: 100 }} value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: e.target.value })} /></div>
          <div className="field"><label>Active</label>
            <div className="checkbox-row"><input type="checkbox" checked={!!editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} /><span className="muted">Shown on the dialer</span></div>
          </div>
        </div>
        <div className="callout">You can use lead fields like <code className="key">{'{{first_name}}'}</code> here too — they fill in during the call.</div>
        <div className="row-actions">
          <button className="btn" onClick={save} disabled={!editing.title}>Save rebuttal</button>
          <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="row-actions" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <p className="muted" style={{ margin: 0 }}>These show next to the script while agents dial. Keep it to your best 5–7.</p>
        <button className="btn" onClick={newReb}>+ New Rebuttal</button>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th style={{ width: 70 }}>Order</th><th>Objection</th><th>Response</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {items.length === 0 ? <tr><td colSpan={5} className="muted">No rebuttals yet. Add your top objection responses.</td></tr>
              : items.map((rb, i) => (
                <tr key={rb.id}>
                  <td>
                    <div className="row-actions">
                      <button className="btn-ghost btn-sm" disabled={i === 0} onClick={() => move(rb, -1)}>↑</button>
                      <button className="btn-ghost btn-sm" disabled={i === items.length - 1} onClick={() => move(rb, 1)}>↓</button>
                    </div>
                  </td>
                  <td><strong>{rb.title}</strong></td>
                  <td className="muted">{(rb.body || '').slice(0, 70)}{(rb.body || '').length > 70 ? '…' : ''}</td>
                  <td>{rb.is_active ? 'Yes' : 'No'}</td>
                  <td><div className="row-actions">
                    <button className="btn-ghost btn-sm" onClick={() => setEditing(rb)}>Edit</button>
                    <button className="btn-ghost btn-sm" onClick={() => remove(rb.id)}>Delete</button>
                  </div></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
