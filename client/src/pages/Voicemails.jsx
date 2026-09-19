import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api, apiBlob } from '../api';

const leadName = (l) => l ? [l.first_name, l.last_name].filter(Boolean).join(' ') || 'Lead' : null;
const when = (d) => new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const dur = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '—');

export default function Voicemails() {
  const [items, setItems] = useState([]);
  const [audio, setAudio] = useState({});   // id -> object URL
  const [err, setErr] = useState('');

  async function load() {
    try { setItems(await api('/voicemails')); } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function play(vm) {
    try {
      if (!audio[vm.id]) {
        const blob = await apiBlob(`/voicemails/${vm.id}/audio`);
        setAudio((a) => ({ ...a, [vm.id]: URL.createObjectURL(blob) }));
      }
      if (!vm.is_read) { await api(`/voicemails/${vm.id}/read`, { method: 'PATCH', body: JSON.stringify({ is_read: true }) }); load(); }
    } catch (e) { setErr(e.message); }
  }
  async function toggleRead(vm) {
    try { await api(`/voicemails/${vm.id}/read`, { method: 'PATCH', body: JSON.stringify({ is_read: !vm.is_read }) }); load(); }
    catch (e) { setErr(e.message); }
  }
  async function remove(vm) {
    try { await api(`/voicemails/${vm.id}`, { method: 'DELETE' }); load(); } catch (e) { setErr(e.message); }
  }

  return (
    <Layout>
      <div className="page-head"><h1>Voicemail</h1></div>
      {err && <p className="error">{err}</p>}

      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>From</th><th>Lead</th><th>Received</th><th>Length</th><th>Play</th><th></th></tr></thead>
          <tbody>
            {items.length === 0 ? <tr><td colSpan={6} className="muted">No voicemails.</td></tr>
              : items.map((vm) => (
                <tr key={vm.id} style={{ fontWeight: vm.is_read ? 400 : 700 }}>
                  <td>{vm.from_number || 'Unknown'}</td>
                  <td>{vm.lead ? <Link to={`/leads/${vm.lead.id}`}>{leadName(vm.lead)}</Link> : <span className="muted">—</span>}</td>
                  <td>{when(vm.created_at)}</td>
                  <td>{dur(vm.duration_seconds)}</td>
                  <td>
                    {audio[vm.id]
                      ? <audio src={audio[vm.id]} controls autoPlay style={{ height: 32 }} />
                      : <button className="btn-ghost btn-sm" onClick={() => play(vm)}>Play</button>}
                  </td>
                  <td><div className="row-actions">
                    <button className="btn-ghost btn-sm" onClick={() => toggleRead(vm)}>{vm.is_read ? 'Unread' : 'Read'}</button>
                    <button className="btn-ghost btn-sm" onClick={() => remove(vm)}>Delete</button>
                  </div></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
