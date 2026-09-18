import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api } from '../api';

const name = (l) => l ? [l.first_name, l.last_name].filter(Boolean).join(' ') || l.phone || 'Lead' : 'Lead';
const tel = (p) => (p ? String(p).replace(/[^0-9+]/g, '') : '');

export default function Queue() {
  const navigate = useNavigate();
  const [q, setQ] = useState(null);
  const [err, setErr] = useState('');

  async function load() {
    try { setQ(await api('/queue')); } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function claim(id) {
    try { await api(`/queue/claim/${id}`, { method: 'POST' }); load(); }
    catch (e) { setErr(e.message); }
  }

  const Row = ({ lead, when, actions }) => (
    <tr className="clickable" onClick={() => navigate(`/leads/${lead.id}`)}>
      <td>{name(lead)}</td>
      <td onClick={(e) => e.stopPropagation()}>
        {lead.phone ? <a href={`tel:${tel(lead.phone)}`}>{lead.phone}</a> : <span className="muted">—</span>}
      </td>
      <td>{lead.state || ''}</td>
      <td>{lead.lead_statuses?.name ? <span className="badge">{lead.lead_statuses.name}</span> : ''}</td>
      <td>{when || ''}</td>
      <td onClick={(e) => e.stopPropagation()}>{actions}</td>
    </tr>
  );

  return (
    <Layout>
      <div className="page-head">
        <h1>My Queue</h1>
        <button className="btn-ghost" onClick={load}>Refresh</button>
      </div>
      {err && <p className="error">{err}</p>}
      {!q ? <p className="muted">Loading…</p> : (
        <div className="stack">
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th colSpan={6} style={{ background: 'var(--navy)', color: '#fff' }}>Due now — callbacks ({q.due.length})</th></tr>
                <tr><th>Name</th><th>Phone</th><th>State</th><th>Status</th><th>Scheduled</th><th></th></tr></thead>
              <tbody>
                {q.due.length === 0 ? <tr><td colSpan={6} className="muted">Nothing due.</td></tr>
                  : q.due.map((c) => c.lead && (
                    <Row key={c.id} lead={c.lead}
                      when={new Date(c.scheduled_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      actions={<button className="btn-ghost btn-sm" onClick={() => navigate(`/leads/${c.lead.id}`)}>Work</button>} />
                  ))}
              </tbody>
            </table>
          </div>

          <div className="table-wrap">
            <table className="data">
              <thead><tr><th colSpan={6} style={{ background: 'var(--navy)', color: '#fff' }}>My leads to work ({q.leads.length})</th></tr>
                <tr><th>Name</th><th>Phone</th><th>State</th><th>Status</th><th></th><th></th></tr></thead>
              <tbody>
                {q.leads.length === 0 ? <tr><td colSpan={6} className="muted">No leads assigned to you.</td></tr>
                  : q.leads.map((l) => (
                    <Row key={l.id} lead={l} when=""
                      actions={<button className="btn-ghost btn-sm" onClick={() => navigate(`/leads/${l.id}`)}>Work</button>} />
                  ))}
              </tbody>
            </table>
          </div>

          {q.available.length > 0 && (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th colSpan={6} style={{ background: 'var(--sky-100)', color: 'var(--navy)' }}>Available to claim ({q.available.length})</th></tr>
                  <tr><th>Name</th><th>Phone</th><th>State</th><th>Status</th><th></th><th></th></tr></thead>
                <tbody>
                  {q.available.map((l) => (
                    <Row key={l.id} lead={l} when=""
                      actions={<button className="btn btn-sm" onClick={() => claim(l.id)}>Claim</button>} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}
