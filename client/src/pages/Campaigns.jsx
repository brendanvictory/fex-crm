import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import { api } from '../api';
import { openVendorSpec } from '../lib/vendorSpec.js';

const BLANK = {
  name: '', source_id: '', type: 'ping', cost_per_call: '', buffer_seconds: 90,
  daily_cap: '', monthly_cap: '', concurrency_cap: '', dupe_window_hours: 72,
  states: '', phone_number: '', is_active: true
};

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [sources, setSources] = useState([]);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() { try { setCampaigns(await api('/campaigns')); } catch (e) { setErr(e.message); } }
  useEffect(() => { load(); api('/config/sources').then(setSources).catch(() => {}); }, []);

  function newCampaign() { setEditing({ ...BLANK }); setMsg(''); setErr(''); }
  function editCampaign(c) {
    setEditing({ ...c, states: (c.states || []).join(', '), source_id: c.source_id || '',
      cost_per_call: c.cost_per_call ?? '', daily_cap: c.daily_cap ?? '', monthly_cap: c.monthly_cap ?? '', concurrency_cap: c.concurrency_cap ?? '' });
    setMsg(''); setErr('');
  }

  async function save() {
    setErr(''); setMsg('');
    try {
      const payload = { ...editing };
      if (editing.id) await api(`/campaigns/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await api('/campaigns', { method: 'POST', body: JSON.stringify(payload) });
      setEditing(null); load();
    } catch (e) { setErr(e.message); }
  }
  async function rotate(id) {
    try { await api(`/campaigns/${id}/rotate-key`, { method: 'POST' }); load(); } catch (e) { setErr(e.message); }
  }
  async function remove(id) {
    if (!confirm('Delete this campaign? Its call history is kept.')) return;
    try { await api(`/campaigns/${id}`, { method: 'DELETE' }); load(); } catch (e) { setErr(e.message); }
  }

  const set = (k) => (e) => setEditing((c) => ({ ...c, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const pingUrl = (typeof window !== 'undefined' ? window.location.origin : '') + '/api/ping';

  if (editing) {
    return (
      <Layout>
        <div className="page-head"><h1>{editing.id ? 'Edit campaign' : 'New campaign'}</h1></div>
        {err && <p className="error">{err}</p>}
        <div className="card stack">
          <div className="form-grid">
            <div className="field full"><label>Campaign name</label><input value={editing.name} onChange={set('name')} placeholder="e.g. VendorX FE Inbound — TX" /></div>
            <div className="field"><label>Vendor (source)</label>
              <select value={editing.source_id} onChange={set('source_id')}>
                <option value="">— None —</option>
                {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Type</label>
              <select value={editing.type} onChange={set('type')}>
                <option value="ping">Ping/Post (real-time accept/reject)</option>
                <option value="direct">Direct (accept all on this number)</option>
              </select>
            </div>
            <div className="field"><label>Cost per billable call ($)</label><input type="number" step="0.01" value={editing.cost_per_call} onChange={set('cost_per_call')} /></div>
            <div className="field"><label>Buffer to bill (seconds)</label><input type="number" value={editing.buffer_seconds} onChange={set('buffer_seconds')} /></div>
            <div className="field"><label>Campaign phone number</label><input value={editing.phone_number} onChange={set('phone_number')} placeholder="+1 555 201 3040" /></div>
            <div className="field full"><label>Allowed states (blank = any you're licensed in)</label><input value={editing.states} onChange={set('states')} placeholder="TX, GA, NC, SC" /></div>
            <div className="field"><label>Daily spend cap ($, blank = none)</label><input type="number" step="0.01" value={editing.daily_cap} onChange={set('daily_cap')} /></div>
            <div className="field"><label>Monthly spend cap ($, blank = none)</label><input type="number" step="0.01" value={editing.monthly_cap} onChange={set('monthly_cap')} /></div>
            <div className="field"><label>Concurrency cap (blank = none)</label><input type="number" value={editing.concurrency_cap} onChange={set('concurrency_cap')} /></div>
            <div className="field"><label>Duplicate window (hours)</label><input type="number" value={editing.dupe_window_hours} onChange={set('dupe_window_hours')} /></div>
            <div className="field"><label>Active</label>
              <div className="checkbox-row"><input type="checkbox" checked={!!editing.is_active} onChange={set('is_active')} /><span className="muted">Accept calls</span></div>
            </div>
          </div>
          <div className="callout">
            {editing.type === 'ping'
              ? <>Ping campaigns require the caller's <strong>state</strong> in the ping. Vendors POST to <code className="key">{pingUrl}</code> with their ping key; we accept (and return this number to route to) or reject.</>
              : <>Direct campaigns accept every call to the campaign number and route to available licensed agents. Point the vendor's number / the Twilio number's voice webhook here.</>}
          </div>
          <div className="row-actions">
            <button className="btn" onClick={save} disabled={!editing.name}>Save campaign</button>
            <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="page-head">
        <h1>Inbound Campaigns</h1>
        <button className="btn" onClick={newCampaign}>+ New campaign</button>
      </div>
      {err && <p className="error">{err}</p>}
      {msg && <p className="ok">{msg}</p>}
      <p className="muted" style={{ marginTop: -4 }}>
        Set each campaign's Twilio number voice webhook to <code className="key">{(typeof window !== 'undefined' ? window.location.origin : '')}/api/voice/campaign</code>.
      </p>

      {campaigns.length === 0 ? <p className="muted">No campaigns yet.</p> : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Campaign</th><th>Type</th><th>Cost</th><th>Buffer</th><th>Number</th><th>Calls</th><th>Ping key</th><th></th></tr></thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong>{c.lead_sources?.name ? <div className="muted" style={{ fontSize: 12 }}>{c.lead_sources.name}</div> : null}{!c.is_active && <span className="badge sm draft" style={{ marginLeft: 6 }}>Off</span>}</td>
                  <td>{c.type === 'direct' ? 'Direct' : 'Ping'}</td>
                  <td>${Number(c.cost_per_call || 0).toFixed(2)}</td>
                  <td>{c.buffer_seconds}s</td>
                  <td>{c.phone_number || <span className="muted">—</span>}</td>
                  <td>{c.billable_calls}/{c.total_calls}</td>
                  <td>{c.type === 'ping'
                    ? <div className="row-actions"><code className="key" style={{ fontSize: 11 }}>{(c.ping_key || '').slice(0, 10)}…</code><button className="btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(c.ping_key)}>Copy</button><button className="btn-ghost btn-sm" onClick={() => rotate(c.id)}>Rotate</button></div>
                    : <span className="muted">—</span>}</td>
                  <td><div className="row-actions">
                    <button className="btn-ghost btn-sm" onClick={() => openVendorSpec(c)}>Vendor spec</button>
                    <button className="btn-ghost btn-sm" onClick={() => editCampaign(c)}>Edit</button>
                    <button className="btn-ghost btn-sm" onClick={() => remove(c.id)}>Delete</button>
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
