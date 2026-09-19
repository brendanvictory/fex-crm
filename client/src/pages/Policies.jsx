import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api } from '../api';

const STATUSES = [
  ['pending', 'Pending'], ['issued', 'Issued'], ['in_force', 'In Force'],
  ['lapsed', 'Lapsed'], ['nsf', 'NSF'], ['cancelled', 'Cancelled']
];
const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const leadName = (l) => l ? [l.first_name, l.last_name].filter(Boolean).join(' ') || 'Lead' : '—';

export default function Policies() {
  const [rows, setRows] = useState([]);
  const [agents, setAgents] = useState([]);
  const [filters, setFilters] = useState({ status: '', agent: '', search: '' });
  const [err, setErr] = useState('');

  async function load() {
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.agent) params.set('agent', filters.agent);
      const qs = params.toString();
      setRows(await api('/sales' + (qs ? `?${qs}` : '')));
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { api('/config/agents').then(setAgents).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(load, 150); return () => clearTimeout(t); }, [filters.status, filters.agent]); // eslint-disable-line

  async function setStatus(p, status) {
    try { await api(`/sales/${p.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); load(); }
    catch (e) { setErr(e.message); }
  }

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const shown = rows.filter((p) => {
    if (!filters.search) return true;
    const s = filters.search.toLowerCase();
    return leadName(p.lead).toLowerCase().includes(s) || (p.policy_number || '').toLowerCase().includes(s) || (p.carriers?.name || p.carrier || '').toLowerCase().includes(s);
  });

  return (
    <Layout>
      <div className="page-head"><h1>Policies</h1></div>
      {err && <p className="error">{err}</p>}

      <div className="filters">
        <input type="text" placeholder="Search lead, carrier, policy #" value={filters.search} onChange={set('search')} />
        <select value={filters.status} onChange={set('status')}>
          <option value="">All statuses</option>
          {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={filters.agent} onChange={set('agent')}>
          <option value="">All agents</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.full_name || '(unnamed)'}</option>)}
        </select>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Lead</th><th>Carrier</th><th>Product</th><th>Annual Premium</th><th>Agent</th><th>Sold</th><th>Status</th></tr>
          </thead>
          <tbody>
            {shown.length === 0 ? <tr><td colSpan={7} className="muted">No policies yet.</td></tr>
              : shown.map((p) => (
                <tr key={p.id}>
                  <td>{p.lead_id ? <Link to={`/leads/${p.lead_id}`}>{leadName(p.lead)}</Link> : leadName(p.lead)}</td>
                  <td>{p.carriers?.name || p.carrier || '—'}</td>
                  <td>{p.product || '—'}</td>
                  <td>{money(p.annual_premium)}</td>
                  <td>{p.agent?.full_name || '—'}</td>
                  <td>{p.sold_at ? new Date(p.sold_at).toLocaleDateString() : ''}</td>
                  <td>
                    <select value={p.status || 'issued'} onChange={(e) => setStatus(p, e.target.value)}>
                      {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Marking a policy Lapsed, NSF, or Cancelled reverses its commissions (chargeback) and removes them from Revenue.</p>
    </Layout>
  );
}
