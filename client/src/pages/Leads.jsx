import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api } from '../api';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '');
const fullName = (l) => [l.first_name, l.last_name].filter(Boolean).join(' ') || '(no name)';

export default function Leads() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [sources, setSources] = useState([]);
  const [agents, setAgents] = useState([]);
  const [filters, setFilters] = useState({ search: '', status: '', source: '', owner: '', state: '', from: '', to: '' });
  const [scope, setScope] = useState('active');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  async function load() {
    setLoading(true); setErr('');
    try {
      const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
      if (scope === 'all') params.set('scope', 'all');
      const qs = params.toString();
      setLeads(await api('/leads' + (qs ? `?${qs}` : '')));
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }

  useEffect(() => {
    Promise.all([api('/config/statuses'), api('/config/sources'), api('/config/agents')])
      .then(([s, src, a]) => { setStatuses(s); setSources(src); setAgents(a); })
      .catch(() => {});
  }, []);

  // Reload whenever a filter or scope changes (debounced lightly for typing).
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [filters, scope]); // eslint-disable-line

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Layout>
      <div className="page-head">
        <h1>Leads</h1>
        <div className="row-actions">
          <button className="btn-ghost" onClick={() => navigate('/leads/import')}>Bulk Upload</button>
          <button className="btn" onClick={() => navigate('/leads/new')}>+ New Lead</button>
        </div>
      </div>

      <div className="segmented">
        <button className={'seg' + (scope === 'active' ? ' active' : '')} onClick={() => setScope('active')}>Active</button>
        <button className={'seg' + (scope === 'all' ? ' active' : '')} onClick={() => setScope('all')}>All leads</button>
        <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>
          {scope === 'active' ? 'Leads that have been worked (called, scheduled, or advanced).' : 'Everything, including imported leads not yet worked.'}
        </span>
      </div>

      <div className="filters">
        <input type="text" placeholder="Search name, phone, email" value={filters.search} onChange={set('search')} />
        <select value={filters.status} onChange={set('status')}>
          <option value="">All statuses</option>
          {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filters.source} onChange={set('source')}>
          <option value="">All sources</option>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filters.owner} onChange={set('owner')}>
          <option value="">All agents</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.full_name || '(unnamed)'}</option>)}
        </select>
        <input type="text" placeholder="State" maxLength={2} style={{ width: 80 }} value={filters.state} onChange={set('state')} />
        <input type="date" value={filters.from} onChange={set('from')} title="Created from" />
        <input type="date" value={filters.to} onChange={set('to')} title="Created to" />
      </div>

      {err && <p className="error">{err}</p>}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Name</th><th>Phone</th><th>State</th><th>Status</th>
              <th>Source</th><th>Owner</th><th>Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="muted">Loading…</td></tr>
            ) : leads.length === 0 ? (
              <tr><td colSpan={7} className="muted">No leads yet. Click “New Lead” to add one.</td></tr>
            ) : leads.map((l) => (
              <tr key={l.id} className="clickable" onClick={() => navigate(`/leads/${l.id}`)}>
                <td>{fullName(l)}</td>
                <td>{l.phone || ''}</td>
                <td>{l.state || ''}</td>
                <td>{l.lead_statuses?.name ? <span className="badge">{l.lead_statuses.name}</span> : ''}</td>
                <td>{l.lead_sources?.name || ''}</td>
                <td>{l.owner?.full_name || <span className="muted">Unassigned</span>}</td>
                <td>{fmtDate(l.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
