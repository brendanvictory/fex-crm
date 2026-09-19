import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import StatTile from '../components/StatTile.jsx';
import { TrendChart, BarList } from '../components/charts.jsx';
import { api } from '../api';

const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

export default function Revenue() {
  const [rep, setRep] = useState(null);
  const [filters, setFilters] = useState({ from: '', to: '' });
  const [err, setErr] = useState('');

  useEffect(() => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    api('/reports/revenue' + (qs ? `?${qs}` : '')).then(setRep).catch((e) => setErr(e.message));
  }, [filters]);

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Layout>
      <div className="page-head"><h1>Revenue</h1></div>
      {err && <p className="error">{err}</p>}

      <div className="filters">
        <input type="date" value={filters.from} onChange={set('from')} title="From" />
        <input type="date" value={filters.to} onChange={set('to')} title="To" />
      </div>

      <div className="stack">
        <div className="kpis">
          <StatTile label="Annual Premium" value={rep ? money(rep.totals.premium) : '—'} sub={rep ? `${rep.totals.policies} policies` : ''} />
          <StatTile label="Coverwise Revenue" value={rep ? money(rep.totals.house) : '—'} sub="house spread" />
          <StatTile label="Agent Commissions" value={rep ? money(rep.totals.agent_comp) : '—'} />
          <StatTile label="Manager Overrides" value={rep ? money(rep.totals.manager_override) : '—'} />
        </div>

        <div className="chart-card full">
          <h3>Premium written per day</h3>
          {rep ? <TrendChart data={rep.by_day} yKey="premium" height={260} /> : <p className="muted">Loading…</p>}
        </div>

        <div className="chart-grid">
          <div className="chart-card">
            <h3>Premium by source</h3>
            {rep ? (rep.by_source.length ? <BarList data={rep.by_source} valueKey="premium" /> : <p className="muted">No sales yet.</p>) : <p className="muted">Loading…</p>}
          </div>
          <div className="chart-card">
            <h3>Premium by agent</h3>
            {rep ? (rep.by_agent.length ? <BarList data={rep.by_agent} valueKey="premium" /> : <p className="muted">No sales yet.</p>) : <p className="muted">Loading…</p>}
          </div>
        </div>

        <div className="chart-card full">
          <h3>By source</h3>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Source</th><th>Policies</th><th>Annual Premium</th><th>Coverwise Revenue</th></tr></thead>
              <tbody>
                {!rep ? <tr><td colSpan={4} className="muted">Loading…</td></tr>
                  : rep.by_source.length === 0 ? <tr><td colSpan={4} className="muted">No sales yet.</td></tr>
                  : rep.by_source.map((s) => (
                    <tr key={s.key}><td>{s.label}</td><td>{s.policies}</td><td>{money(s.premium)}</td><td>{money(s.house)}</td></tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="chart-card full">
          <h3>By agent</h3>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Agent</th><th>Policies</th><th>Annual Premium</th><th>Agent Commission</th></tr></thead>
              <tbody>
                {!rep ? <tr><td colSpan={4} className="muted">Loading…</td></tr>
                  : rep.by_agent.length === 0 ? <tr><td colSpan={4} className="muted">No sales yet.</td></tr>
                  : rep.by_agent.map((a) => (
                    <tr key={a.key}><td>{a.label}</td><td>{a.policies}</td><td>{money(a.premium)}</td><td>{money(a.comp)}</td></tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
