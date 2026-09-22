import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import { api } from '../api';
import PartnerDashboard from '../partner/PartnerDashboard.jsx';

export default function Partners() {
  const [sources, setSources] = useState([]);
  const [sel, setSel] = useState('');
  const [tab, setTab] = useState('preview');
  const [vendors, setVendors] = useState([]);
  const [spec, setSpec] = useState('');
  const [specMsg, setSpecMsg] = useState('');
  const [nv, setNv] = useState({ full_name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api('/config/sources').then((s) => { setSources(s); if (s[0]) setSel(s[0].id); }).catch((e) => setErr(e.message));
  }, []);

  const current = sources.find((s) => s.id === sel);

  useEffect(() => {
    if (!sel) return;
    setSpec(current?.posting_spec || '');
    api(`/config/sources/${sel}/vendors`).then(setVendors).catch(() => setVendors([]));
  }, [sel]); // eslint-disable-line

  async function saveSpec() {
    setSpecMsg(''); setErr('');
    try {
      await api(`/config/sources/${sel}`, { method: 'PATCH', body: JSON.stringify({ posting_spec: spec }) });
      setSpecMsg('Saved.');
      setSources((rows) => rows.map((r) => r.id === sel ? { ...r, posting_spec: spec } : r));
    } catch (e) { setErr(e.message); }
  }

  async function addVendor(e) {
    e.preventDefault(); setErr(''); setMsg('');
    try {
      await api(`/config/sources/${sel}/vendors`, { method: 'POST', body: JSON.stringify(nv) });
      setMsg(`Login created for ${nv.email}.`);
      setNv({ full_name: '', email: '', password: '' });
      setVendors(await api(`/config/sources/${sel}/vendors`));
    } catch (e) { setErr(e.message); }
  }
  async function toggleVendor(v) {
    try {
      await api(`/config/sources/${sel}/vendors/${v.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !v.is_active }) });
      setVendors(await api(`/config/sources/${sel}/vendors`));
    } catch (e) { setErr(e.message); }
  }

  function genPw() { setNv((n) => ({ ...n, password: 'Cw' + Math.random().toString(36).slice(2, 10) + '!' })); }

  return (
    <Layout>
      <div className="page-head">
        <h1>Partners</h1>
        <select value={sel} onChange={(e) => setSel(e.target.value)} style={{ minWidth: 200 }}>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      {err && <p className="error">{err}</p>}
      {msg && <p className="ok">{msg}</p>}

      {!sel ? <p className="muted">Create a lead source first (Admin &gt; Sources).</p> : (
        <>
          <div className="tabs">
            <button className={'tab' + (tab === 'preview' ? ' active' : '')} onClick={() => setTab('preview')}>Partner view</button>
            <button className={'tab' + (tab === 'logins' ? ' active' : '')} onClick={() => setTab('logins')}>Logins</button>
            <button className={'tab' + (tab === 'spec' ? ' active' : '')} onClick={() => setTab('spec')}>Posting spec</button>
          </div>

          {tab === 'preview' && (
            <>
              <p className="muted">This is exactly what {current?.name} sees when they log in.</p>
              <PartnerDashboard sourceId={sel} />
            </>
          )}

          {tab === 'logins' && (
            <div className="stack">
              <div className="card">
                <div className="section-title">Partner logins for {current?.name}</div>
                {vendors.length === 0 ? <p className="muted">No logins yet.</p> : (
                  <div className="table-wrap">
                    <table className="data">
                      <thead><tr><th>Name</th><th>Email</th><th>Status</th><th></th></tr></thead>
                      <tbody>
                        {vendors.map((v) => (
                          <tr key={v.id}>
                            <td>{v.full_name || '—'}</td>
                            <td>{v.email}</td>
                            <td>{v.is_active ? 'Active' : 'Disabled'}</td>
                            <td><button className="btn-ghost btn-sm" onClick={() => toggleVendor(v)}>{v.is_active ? 'Disable' : 'Enable'}</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="card">
                <div className="section-title">Add a login</div>
                <form className="form-grid" onSubmit={addVendor}>
                  <div className="field"><label>Name</label><input value={nv.full_name} onChange={(e) => setNv({ ...nv, full_name: e.target.value })} /></div>
                  <div className="field"><label>Email</label><input type="email" value={nv.email} onChange={(e) => setNv({ ...nv, email: e.target.value })} required /></div>
                  <div className="field"><label>Temp password</label>
                    <div className="filters" style={{ margin: 0 }}>
                      <input value={nv.password} onChange={(e) => setNv({ ...nv, password: e.target.value })} required />
                      <button type="button" className="btn-ghost btn-sm" onClick={genPw}>Generate</button>
                    </div>
                  </div>
                  <div className="field" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn" type="submit">Create login</button>
                  </div>
                </form>
                <p className="muted" style={{ marginBottom: 0 }}>They can only see this source's stats — no CRM access. If system email is on, they're emailed their login.</p>
              </div>
            </div>
          )}

          {tab === 'spec' && (
            <div className="card">
              <div className="section-title">Posting spec shown to {current?.name}</div>
              <p className="muted" style={{ marginTop: 0 }}>Plain text or Markdown-ish. Appears on their portal under “How to post leads.”</p>
              <textarea value={spec} onChange={(e) => setSpec(e.target.value)} style={{ minHeight: 260, width: '100%', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }} />
              <div className="row-actions" style={{ marginTop: 12 }}>
                <button className="btn" onClick={saveSpec}>Save spec</button>
                {specMsg && <span className="ok">{specMsg}</span>}
              </div>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
