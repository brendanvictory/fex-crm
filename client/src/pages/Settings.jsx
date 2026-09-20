import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import { api, apiBlob } from '../api';
import { useDialer } from '../dialer/DialerContext.jsx';
import { supabase } from '../supabaseClient';

export default function Settings() {
  const [statuses, setStatuses] = useState([]);
  const [disps, setDisps] = useState([]);
  const [numbers, setNumbers] = useState([]);
  const [err, setErr] = useState('');
  const [newStatus, setNewStatus] = useState({ name: '', sort_order: 0 });
  const [newDisp, setNewDisp] = useState({ name: '', maps_to_status_id: '' });
  const [newNum, setNewNum] = useState({ number: '', state: '', label: '' });
  const dialer = useDialer();
  const [greeting, setGreeting] = useState({ has: false });
  const [greetingAudio, setGreetingAudio] = useState('');

  const [myPw, setMyPw] = useState('');
  const [myPwMsg, setMyPwMsg] = useState('');
  const [emailStatus, setEmailStatus] = useState(null);
  const [emailMsg, setEmailMsg] = useState('');
  useEffect(() => { api('/config/email-status').then(setEmailStatus).catch(() => {}); }, []);
  async function testEmail() {
    setEmailMsg(''); setErr('');
    try { const r = await api('/config/test-email', { method: 'POST' }); setEmailMsg(`Test email sent to ${r.to}.`); }
    catch (e) { setErr(e.message); }
  }
  async function changeMyPw() {
    setMyPwMsg(''); setErr('');
    if (!myPw || myPw.length < 6) { setErr('Password must be at least 6 characters.'); return; }
    const { error } = await supabase.auth.updateUser({ password: myPw });
    if (error) setErr(error.message); else { setMyPwMsg('Password updated.'); setMyPw(''); }
  }

  async function loadGreeting() { try { setGreeting(await api('/voice/my-greeting')); } catch { /* */ } }
  useEffect(() => { loadGreeting(); }, []);
  async function playGreeting() {
    try { const b = await apiBlob('/voice/my-greeting/audio'); setGreetingAudio(URL.createObjectURL(b)); } catch (e) { setErr(e.message); }
  }

  async function load() {
    try {
      const [s, d, n] = await Promise.all([api('/config/statuses'), api('/config/dispositions'), api('/config/numbers')]);
      setStatuses(s); setDisps(d); setNumbers(n);
    } catch (e) { setErr(e.message); }
  }

  async function addNumber(e) {
    e.preventDefault();
    try { await api('/config/numbers', { method: 'POST', body: JSON.stringify(newNum) }); setNewNum({ number: '', state: '', label: '' }); load(); }
    catch (e) { setErr(e.message); }
  }
  async function delNumber(id) { try { await api(`/config/numbers/${id}`, { method: 'DELETE' }); load(); } catch (e) { setErr(e.message); } }
  useEffect(() => { load(); }, []);

  const editStatus = (id, patch) => setStatuses((rows) => rows.map((r) => r.id === id ? { ...r, ...patch } : r));
  const editDisp = (id, patch) => setDisps((rows) => rows.map((r) => r.id === id ? { ...r, ...patch } : r));

  async function saveStatus(s) {
    try { await api(`/config/statuses/${s.id}`, { method: 'PATCH', body: JSON.stringify({ name: s.name, sort_order: Number(s.sort_order), is_active: s.is_active, is_default: s.is_default }) }); load(); }
    catch (e) { setErr(e.message); }
  }
  async function delStatus(id) { try { await api(`/config/statuses/${id}`, { method: 'DELETE' }); load(); } catch (e) { setErr(e.message); } }
  async function addStatus(e) {
    e.preventDefault();
    try { await api('/config/statuses', { method: 'POST', body: JSON.stringify({ ...newStatus, sort_order: Number(newStatus.sort_order) }) }); setNewStatus({ name: '', sort_order: 0 }); load(); }
    catch (e) { setErr(e.message); }
  }

  async function saveDisp(d) {
    try { await api(`/config/dispositions/${d.id}`, { method: 'PATCH', body: JSON.stringify({ name: d.name, maps_to_status_id: d.maps_to_status_id || null, is_active: d.is_active }) }); load(); }
    catch (e) { setErr(e.message); }
  }
  async function delDisp(id) { try { await api(`/config/dispositions/${id}`, { method: 'DELETE' }); load(); } catch (e) { setErr(e.message); } }
  async function addDisp(e) {
    e.preventDefault();
    try { await api('/config/dispositions', { method: 'POST', body: JSON.stringify({ ...newDisp, maps_to_status_id: newDisp.maps_to_status_id || null }) }); setNewDisp({ name: '', maps_to_status_id: '' }); load(); }
    catch (e) { setErr(e.message); }
  }

  return (
    <Layout>
      <div className="page-head"><h1>Settings</h1></div>
      {err && <p className="error">{err}</p>}

      <div className="stack">
        <div className="card">
          <div className="section-title">My account</div>
          <p className="muted" style={{ marginTop: 0 }}>Change your own password.</p>
          <div className="filters" style={{ marginBottom: 0 }}>
            <input type="password" placeholder="New password" value={myPw} onChange={(e) => setMyPw(e.target.value)} autoComplete="new-password" />
            <button className="btn" type="button" onClick={changeMyPw}>Update password</button>
          </div>
          {myPwMsg && <p className="ok" style={{ marginBottom: 0 }}>{myPwMsg}</p>}
        </div>

        <div className="card">
          <div className="section-title">System email</div>
          <p className="muted" style={{ marginTop: 0 }}>
            Coverwise sends account emails (welcome logins, notifications) from your Google Workspace mailbox.{' '}
            {emailStatus == null ? 'Checking status…'
              : emailStatus.configured
                ? 'Status: connected.'
                : 'Status: not configured — add the SMTP variables in Render, then redeploy.'}
          </p>
          <div className="row-actions">
            <button className="btn" type="button" onClick={testEmail} disabled={!emailStatus?.configured}>Send test email</button>
          </div>
          {emailMsg && <p className="ok" style={{ marginBottom: 0 }}>{emailMsg}</p>}
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>The test goes to your own login email.</p>
        </div>

        <div className="card">
          <div className="section-title">My voicemail greeting</div>
          <p className="muted" style={{ marginTop: 0 }}>
            {greeting.has ? 'You have a recorded greeting. Callers who reach your voicemail hear it.' : 'No greeting recorded yet — callers hear the default message.'}
          </p>
          <div className="row-actions">
            <button className="btn" onClick={() => dialer.recordGreeting()} disabled={dialer?.status !== 'idle'}>Record greeting</button>
            {greeting.has && <button className="btn-ghost" onClick={playGreeting}>Play current</button>}
            <button className="btn-ghost" onClick={loadGreeting}>Refresh</button>
          </div>
          {greetingAudio && <audio src={greetingAudio} controls autoPlay style={{ marginTop: 12, height: 34 }} />}
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Recording connects your softphone — speak after the tone, press # when done, then hit Refresh.</p>
        </div>

        <div className="card">
          <div className="section-title">Lead statuses</div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Order</th><th>Name</th><th>Active</th><th>Default</th><th></th></tr></thead>
              <tbody>
                {statuses.map((s) => (
                  <tr key={s.id}>
                    <td><input style={{ width: 60 }} type="number" value={s.sort_order ?? 0} onChange={(e) => editStatus(s.id, { sort_order: e.target.value })} /></td>
                    <td><input value={s.name} onChange={(e) => editStatus(s.id, { name: e.target.value })} /></td>
                    <td><input type="checkbox" checked={!!s.is_active} onChange={(e) => editStatus(s.id, { is_active: e.target.checked })} /></td>
                    <td><input type="checkbox" checked={!!s.is_default} onChange={(e) => editStatus(s.id, { is_default: e.target.checked })} /></td>
                    <td><div className="row-actions">
                      <button className="btn-ghost btn-sm" onClick={() => saveStatus(s)}>Save</button>
                      <button className="btn-ghost btn-sm" onClick={() => delStatus(s.id)}>Delete</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form className="filters" style={{ marginTop: 12 }} onSubmit={addStatus}>
            <input type="number" placeholder="Order" style={{ width: 80 }} value={newStatus.sort_order} onChange={(e) => setNewStatus({ ...newStatus, sort_order: e.target.value })} />
            <input type="text" placeholder="New status name" value={newStatus.name} onChange={(e) => setNewStatus({ ...newStatus, name: e.target.value })} required />
            <button className="btn" type="submit">Add status</button>
          </form>
          <p className="muted" style={{ marginBottom: 0 }}>“Default” is the status new leads land in. Deleting a status leaves affected leads with no status.</p>
        </div>

        <div className="card">
          <div className="section-title">Call dispositions</div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Name</th><th>Advances status to</th><th>Active</th><th></th></tr></thead>
              <tbody>
                {disps.map((d) => (
                  <tr key={d.id}>
                    <td><input value={d.name} onChange={(e) => editDisp(d.id, { name: e.target.value })} /></td>
                    <td>
                      <select value={d.maps_to_status_id || ''} onChange={(e) => editDisp(d.id, { maps_to_status_id: e.target.value })}>
                        <option value="">— none —</option>
                        {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </td>
                    <td><input type="checkbox" checked={!!d.is_active} onChange={(e) => editDisp(d.id, { is_active: e.target.checked })} /></td>
                    <td><div className="row-actions">
                      <button className="btn-ghost btn-sm" onClick={() => saveDisp(d)}>Save</button>
                      <button className="btn-ghost btn-sm" onClick={() => delDisp(d.id)}>Delete</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form className="filters" style={{ marginTop: 12 }} onSubmit={addDisp}>
            <input type="text" placeholder="New disposition name" value={newDisp.name} onChange={(e) => setNewDisp({ ...newDisp, name: e.target.value })} required />
            <select value={newDisp.maps_to_status_id} onChange={(e) => setNewDisp({ ...newDisp, maps_to_status_id: e.target.value })}>
              <option value="">Advances to… (optional)</option>
              {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className="btn" type="submit">Add disposition</button>
          </form>
        </div>

        <div className="card">
          <div className="section-title">Phone numbers (local-presence caller ID)</div>
          <p className="muted" style={{ marginTop: 0 }}>Add your Twilio numbers here. A lead in a given state is dialed from the number matching that state; a number with no state is the fallback.</p>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Number</th><th>State</th><th>Label</th><th>Active</th><th></th></tr></thead>
              <tbody>
                {numbers.length === 0 ? <tr><td colSpan={5} className="muted">No numbers yet.</td></tr>
                  : numbers.map((n) => (
                    <tr key={n.id}>
                      <td><code className="key">{n.number}</code></td>
                      <td>{n.state || <span className="muted">default</span>}</td>
                      <td>{n.label || ''}</td>
                      <td>{n.is_active ? 'Yes' : 'No'}</td>
                      <td><button className="btn-ghost btn-sm" onClick={() => delNumber(n.id)}>Delete</button></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <form className="filters" style={{ marginTop: 12 }} onSubmit={addNumber}>
            <input type="text" placeholder="+1 516 555 1234" value={newNum.number} onChange={(e) => setNewNum({ ...newNum, number: e.target.value })} required />
            <input type="text" placeholder="State (blank = default)" maxLength={2} style={{ width: 160 }} value={newNum.state} onChange={(e) => setNewNum({ ...newNum, state: e.target.value })} />
            <input type="text" placeholder="Label (optional)" value={newNum.label} onChange={(e) => setNewNum({ ...newNum, label: e.target.value })} />
            <button className="btn" type="submit">Add number</button>
          </form>
        </div>
      </div>
    </Layout>
  );
}
