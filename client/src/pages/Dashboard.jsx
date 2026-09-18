import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import StatTile from '../components/StatTile.jsx';
import { TrendChart, BarList } from '../components/charts.jsx';
import { api } from '../api';

export default function Dashboard() {
  const [me, setMe] = useState(null);
  const [rep, setRep] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/me').then(setMe).catch(() => {});
    api('/reports/summary').then(setRep).catch((e) => setErr(e.message));
  }, []);

  const firstName = me?.profile?.full_name?.split(' ')[0] || '';

  return (
    <Layout>
      <div className="page-head">
        <h1>{firstName ? `Welcome back, ${firstName}` : 'Dashboard'}</h1>
        <Link to="/reports" className="btn-ghost">Full reports →</Link>
      </div>
      {err && <p className="error">{err}</p>}

      <div className="stack">
        <div className="kpis">
          <StatTile label="Total leads" value={rep ? rep.totals.leads : '—'} />
          <StatTile label="Contacted" value={rep ? rep.totals.contacted : '—'} />
          <StatTile label="Contact rate" value={rep ? `${rep.totals.contact_rate}%` : '—'} />
          <StatTile label="New (last 7 days)" value={rep ? rep.totals.last7 : '—'} />
        </div>

        <div className="chart-grid">
          <div className="chart-card full">
            <h3>Leads per day (last 30 days)</h3>
            {rep ? <TrendChart data={rep.by_day} /> : <p className="muted">Loading…</p>}
          </div>
          <div className="chart-card">
            <h3>Leads by source</h3>
            {rep ? (rep.by_source.length ? <BarList data={rep.by_source.slice(0, 8)} /> : <p className="muted">No data yet.</p>) : <p className="muted">Loading…</p>}
          </div>
          <div className="chart-card">
            <h3>Leads by status</h3>
            {rep ? (rep.by_status.length ? <BarList data={rep.by_status.slice(0, 8)} /> : <p className="muted">No data yet.</p>) : <p className="muted">Loading…</p>}
          </div>
        </div>
      </div>
    </Layout>
  );
}
