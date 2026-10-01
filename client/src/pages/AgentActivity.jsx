import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import StatTile from '../components/StatTile.jsx';
import { TrendChart, BarList } from '../components/charts.jsx';
import { api } from '../api';
import { RANGE_OPTIONS, rangeToISO } from '../lib/ranges.js';
const ORIGINS = [
  { v: 'power_dialer', label: 'Power dialer' },
  { v: 'all', label: 'All calls' },
  { v: 'manual', label: 'Manual dial' },
  { v: 'lead', label: 'Lead page' }
];

const hourLabel = (h) => { const ap = h < 12 ? 'a' : 'p'; const hr = h % 12 || 12; return `${hr}${ap}`; };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function dur(sec) {
  sec = Number(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}
const mmss = (sec) => { sec = Number(sec || 0); const m = Math.floor(sec / 60), s = sec % 60; return `${m}:${String(s).padStart(2, '0')}`; };
const activeLabel = (min) => { min = Number(min || 0); const h = Math.floor(min / 60), m = min % 60; return h ? `${h}h ${m}m` : `${m}m`; };

export default function AgentActivity() {
  const [range, setRange] = useState(30);
  const [origin, setOrigin] = useState('power_dialer');
  const [agent, setAgent] = useState('');
  const [agents, setAgents] = useState([]);
  const [rep, setRep] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => { api('/config/agents').then(setAgents).catch(() => {}); }, []);

  useEffect(() => {
    const { from, to } = rangeToISO(range);
    const p = new URLSearchParams({ from, to, origin });
    if (agent) p.set('agent', agent);
    setRep(null);
    const t = setTimeout(() => { api(`/reports/activity?${p.toString()}`).then(setRep).catch((e) => setErr(e.message)); }, 150);
    return () => clearTimeout(t);
  }, [range, origin, agent]);

  const t = rep?.totals;
  const hourData = (rep?.by_hour || []).filter((h) => h.dials > 0).map((h) => ({ label: hourLabel(h.hour), count: h.connected }));
  const dowData = (rep?.by_dow || []).map((d) => ({ label: DOW[d.dow], count: d.connected }));

  return (
    <Layout>
      <div className="page-head"><h1>Agent Activity</h1></div>
      {err && <p className="error">{err}</p>}

      <div className="filters">
        <div className="segmented" style={{ margin: 0 }}>
          {RANGE_OPTIONS.map((r) => <button key={r.k} className={'seg' + (range === r.k ? ' active' : '')} onClick={() => setRange(r.k)}>{r.label}</button>)}
        </div>
        <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
          {ORIGINS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
        <select value={agent} onChange={(e) => setAgent(e.target.value)}>
          <option value="">All agents</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.full_name || '(unnamed)'}</option>)}
        </select>
      </div>

      <div className="stack">
        <div className="kpis">
          <StatTile label="Dials" value={t ? t.dials : '—'} />
          <StatTile label="Connected" value={t ? t.connected : '—'} sub={t ? `${t.connect_rate}% connect rate` : ''} />
          <StatTile label="Talk time" value={t ? dur(t.talk_sec) : '—'} />
          <StatTile label="Avg call" value={t ? mmss(t.avg_duration_sec) : '—'} />
        </div>
        <div className="kpis">
          <StatTile label="Unique leads called" value={t ? t.unique_leads : '—'} />
          <StatTile label="Active time" value={t ? activeLabel(t.active_min) : '—'} sub="first→last dial per day" />
          <StatTile label="Dials / active hour" value={t && t.dials_per_hour != null ? t.dials_per_hour : '—'} />
          <StatTile label="Connect rate" value={t ? `${t.connect_rate}%` : '—'} />
        </div>

        <div className="chart-card full">
          <h3>Dials per day</h3>
          {rep ? <TrendChart data={rep.by_day} xKey="day" yKey="dials" height={240} /> : <p className="muted">Loading…</p>}
        </div>

        <div className="chart-grid">
          <div className="chart-card">
            <h3>Connections by hour (ET)</h3>
            {rep ? (hourData.length ? <BarList data={hourData} height={Math.max(160, hourData.length * 26)} /> : <p className="muted">No connections yet.</p>) : <p className="muted">Loading…</p>}
          </div>
          <div className="chart-card">
            <h3>Connections by day of week</h3>
            {rep ? <BarList data={dowData} height={220} /> : <p className="muted">Loading…</p>}
          </div>
        </div>

        <div className="chart-card full">
          <h3>By agent</h3>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Agent</th><th>Dials</th><th>Unique leads</th><th>Connected</th>
                  <th>Connect rate</th><th>Talk time</th><th>Avg call</th><th>Active time</th><th>Dials/hr</th>
                </tr>
              </thead>
              <tbody>
                {!rep ? <tr><td colSpan={9} className="muted">Loading…</td></tr>
                  : rep.agents.length === 0 ? <tr><td colSpan={9} className="muted">No calls in this range.</td></tr>
                    : rep.agents.map((a) => (
                      <tr key={a.id}>
                        <td><strong>{a.name}</strong></td>
                        <td>{a.dials}</td>
                        <td>{a.unique_leads}</td>
                        <td>{a.connected}</td>
                        <td><span className="badge">{a.connect_rate}%</span></td>
                        <td>{dur(a.talk_sec)}</td>
                        <td>{mmss(a.avg_duration_sec)}</td>
                        <td>{activeLabel(a.active_min)}</td>
                        <td>{a.dials_per_hour ?? '—'}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
            “Connected” = a call with talk time. “Active time” is the span from first to last dial each day (a proxy for seated time). “Dials/hr” is dials ÷ active time.
          </p>
        </div>
      </div>
    </Layout>
  );
}
