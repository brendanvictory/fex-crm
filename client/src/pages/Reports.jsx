import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import StatTile from '../components/StatTile.jsx';
import { TrendChart, BarList } from '../components/charts.jsx';
import { api } from '../api';

export default function Reports() {
  const [rep, setRep] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [sources, setSources] = useState([]);
  const [agents, setAgents] = useState([]);
  const [filters, setFilters] = useState({ from: '', to: '', state: '', source: '', status: '', owner: '' });
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([api('/config/statuses'), api('/config/sources'), api('/config/agents')])
      .then(([s, src, a]) => { setStatuses(s); setSources(src); setAgents(a); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    const t = setTimeout(() => {
      api('/reports/summary' + (qs ? `?${qs}` : '')).then(setRep).catch((e) => setErr(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [filters]);

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Layout>
      <div className="page-head"><h1>Reports</h1></div>
      {err && <p className="error">{err}</p>}

      <div className="filters">
        <input type="date" value={filters.from} onChange={set('from')} title="From" />
        <input type="date" value={filters.to} onChange={set('to')} title="To" />
        <input type="text" placeholder="State" maxLength={2} style={{ width: 80 }} value={filters.state} onChange={set('state')} />
        <select value={filters.source} onChange={set('source')}>
          <option value="">All sources</option>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filters.status} onChange={set('status')}>
          <option value="">All statuses</option>
          {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filters.owner} onChange={set('owner')}>
          <option value="">All agents</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.full_name || '(unnamed)'}</option>)}
        </select>
      </div>

      <div className="stack">
        <div className="kpis">
          <StatTile label="Total leads" value={rep ? rep.totals.leads : '—'} />
          <StatTile label="Contacted" value={rep ? rep.totals.contacted : '—'} />
          <StatTile label="Contact rate" value={rep ? `${rep.totals.contact_rate}%` : '—'} />
          <StatTile label="New (last 7 days)" value={rep ? rep.totals.last7 : '—'} />
        </div>

        <div className="chart-card full">
          <h3>Leads per day</h3>
          {rep ? <TrendChart data={rep.by_day} height={260} /> : <p className="muted">Loading…</p>}
        </div>

        <div className="chart-grid">
          <div className="chart-card">
            <h3>Leads by source</h3>
            {rep ? (rep.by_source.length ? <BarList data={rep.by_source} /> : <p className="muted">No data.</p>) : <p className="muted">Loading…</p>}
          </div>
          <div className="chart-card">
            <h3>Leads by status</h3>
            {rep ? (rep.by_status.length ? <BarList data={rep.by_status} /> : <p className="muted">No data.</p>) : <p className="muted">Loading…</p>}
          </div>
        </div>

        <ContactRateTable title="By source" rows={rep?.by_source} />
        <ContactRateTable title="By agent" rows={rep?.by_agent} />
      </div>
    </Layout>
  );
}

function ContactRateTable({ title, rows }) {
  return (
    <div className="chart-card full">
      <h3>{title}</h3>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>{title.replace('By ', '')}</th><th>Leads</th><th>Contacted</th><th>Contact rate</th></tr></thead>
          <tbody>
            {!rows ? (
              <tr><td colSpan={4} className="muted">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="muted">No data.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td>{r.count}</td>
                <td>{r.contacted}</td>
                <td><span className="badge">{r.contact_rate}%</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
