import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import StatTile from '../components/StatTile.jsx';
import { TrendChart, BarList } from '../components/charts.jsx';
import { api } from '../api';
import { RANGE_OPTIONS, rangeToISO } from '../lib/ranges.js';

export default function Reports() {
  const [tab, setTab] = useState('leads');
  return (
    <Layout>
      <div className="page-head"><h1>Reports</h1></div>
      <div className="tabs">
        <button className={'tab' + (tab === 'leads' ? ' active' : '')} onClick={() => setTab('leads')}>Leads</button>
        <button className={'tab' + (tab === 'inbound' ? ' active' : '')} onClick={() => setTab('inbound')}>Inbound calls</button>
      </div>
      {tab === 'leads' ? <LeadsReport /> : <InboundReport />}
    </Layout>
  );
}

function LeadsReport() {
  const [rep, setRep] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [sources, setSources] = useState([]);
  const [agents, setAgents] = useState([]);
  const [filters, setFilters] = useState({ from: '', to: '', state: '', source: '', status: '', owner: '' });
  const [quick, setQuick] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([api('/config/statuses'), api('/config/sources'), api('/config/agents')])
      .then(([s, src, a]) => { setStatuses(s); setSources(src); setAgents(a); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const eff = { ...filters };
    if (quick) { const r = rangeToISO(quick); eff.from = r.from; eff.to = r.to; }
    const qs = new URLSearchParams(Object.entries(eff).filter(([, v]) => v)).toString();
    const t = setTimeout(() => { api('/reports/summary' + (qs ? `?${qs}` : '')).then(setRep).catch((e) => setErr(e.message)); }, 200);
    return () => clearTimeout(t);
  }, [filters, quick]);

  const set = (k) => (e) => { setQuick(null); setFilters((f) => ({ ...f, [k]: e.target.value })); };
  function pickQuick(k) { setQuick(k); setFilters((f) => ({ ...f, from: '', to: '' })); }

  return (
    <>
      {err && <p className="error">{err}</p>}
      <div className="segmented" style={{ flexWrap: 'wrap' }}>
        {RANGE_OPTIONS.map((r) => <button key={r.k} className={'seg' + (quick === r.k ? ' active' : '')} onClick={() => pickQuick(r.k)}>{r.label}</button>)}
        <button className={'seg' + (!quick ? ' active' : '')} onClick={() => setQuick(null)}>Custom</button>
      </div>
      <div className="filters">
        <input type="date" value={filters.from} onChange={set('from')} title="From" />
        <input type="date" value={filters.to} onChange={set('to')} title="To" />
        <input type="text" placeholder="State" maxLength={2} style={{ width: 80 }} value={filters.state} onChange={set('state')} />
        <select value={filters.source} onChange={set('source')}><option value="">All sources</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select value={filters.status} onChange={set('status')}><option value="">All statuses</option>{statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select value={filters.owner} onChange={set('owner')}><option value="">All agents</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.full_name || '(unnamed)'}</option>)}</select>
      </div>
      <div className="stack">
        <div className="kpis">
          <StatTile label="Total leads" value={rep ? rep.totals.leads : '—'} />
          <StatTile label="Contacted" value={rep ? rep.totals.contacted : '—'} />
          <StatTile label="Contact rate" value={rep ? `${rep.totals.contact_rate}%` : '—'} />
          <StatTile label="New (last 7 days)" value={rep ? rep.totals.last7 : '—'} />
        </div>
        <div className="chart-card full"><h3>Leads per day</h3>{rep ? <TrendChart data={rep.by_day} height={260} /> : <p className="muted">Loading…</p>}</div>
        <div className="chart-grid">
          <div className="chart-card"><h3>Leads by source</h3>{rep ? (rep.by_source.length ? <BarList data={rep.by_source} /> : <p className="muted">No data.</p>) : <p className="muted">Loading…</p>}</div>
          <div className="chart-card"><h3>Leads by status</h3>{rep ? (rep.by_status.length ? <BarList data={rep.by_status} /> : <p className="muted">No data.</p>) : <p className="muted">Loading…</p>}</div>
        </div>
        <ContactRateTable title="By source" rows={rep?.by_source} />
        <ContactRateTable title="By agent" rows={rep?.by_agent} />
      </div>
    </>
  );
}

const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const mmss = (s) => { s = Number(s || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function InboundReport() {
  const [range, setRange] = useState(30);
  const [rep, setRep] = useState(null);
  const [billable, setBillable] = useState([]);
  const [isMgr, setIsMgr] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { api('/me').then((m) => setIsMgr(['manager', 'admin', 'super_admin'].includes(m.profile?.role))).catch(() => {}); }, []);

  function load() {
    const { from, to } = rangeToISO(range);
    const qs = new URLSearchParams({ from, to }).toString();
    setRep(null);
    api(`/reports/inbound?${qs}`).then(setRep).catch((e) => setErr(e.message));
    api(`/inbound/billable?${qs}`).then(setBillable).catch(() => setBillable([]));
  }
  useEffect(() => { load(); }, [range]); // eslint-disable-line

  async function credit(id) {
    const reason = prompt('Credit this call (reason, optional):', 'junk call');
    if (reason === null) return;
    try { await api(`/inbound/${id}/dispute`, { method: 'POST', body: JSON.stringify({ credit: true, reason }) }); load(); }
    catch (e) { setErr(e.message); }
  }

  const t = rep?.totals;
  return (
    <>
      {err && <p className="error">{err}</p>}
      <div className="segmented" style={{ flexWrap: 'wrap' }}>
        {RANGE_OPTIONS.map((r) => <button key={r.k} className={'seg' + (range === r.k ? ' active' : '')} onClick={() => setRange(r.k)}>{r.label}</button>)}
      </div>
      <div className="stack">
        <div className="kpis">
          <StatTile label="Calls received" value={t ? t.gross : '—'} sub={t ? `${t.connect_rate}% answered` : ''} />
          <StatTile label="Paid calls" value={t ? t.billable : '—'} sub={t ? `${t.billable_rate}% of calls` : ''} />
          <StatTile label="Spend" value={t ? money(t.spend) : '—'} sub={t && t.credited ? `${money(t.credited)} credited` : ''} />
          <StatTile label="Avg talk" value={t ? mmss(t.avg_talk_sec) : '—'} />
        </div>
        <div className="chart-card full"><h3>Calls per day</h3>{rep ? <TrendChart data={rep.by_day} xKey="day" yKey="gross" height={240} /> : <p className="muted">Loading…</p>}</div>
        <div className="chart-card full"><h3>Spend per day</h3>{rep ? <TrendChart data={rep.by_day} xKey="day" yKey="spend" height={200} /> : <p className="muted">Loading…</p>}</div>

        <div className="chart-card full">
          <h3>By campaign</h3>
          <InboundTable rows={rep?.by_campaign} />
        </div>
        <div className="chart-card full">
          <h3>By source (vendor)</h3>
          <InboundTable rows={rep?.by_source} />
        </div>

        {rep && rep.reject_reasons.length > 0 && (
          <div className="chart-card full"><h3>Rejected pings by reason</h3><BarList data={rep.reject_reasons} height={Math.max(120, rep.reject_reasons.length * 34)} /></div>
        )}

        {isMgr && (
          <div className="chart-card full">
            <h3>Billable calls (credit a junk call to not pay for it)</h3>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Date</th><th>Campaign</th><th>Phone</th><th>State</th><th>Talk</th><th>Cost</th><th>Agent</th><th></th></tr></thead>
                <tbody>
                  {billable.length === 0 ? <tr><td colSpan={8} className="muted">No billable calls in range.</td></tr>
                    : billable.map((c) => (
                      <tr key={c.id} style={{ opacity: c.disputed ? 0.55 : 1 }}>
                        <td>{new Date(c.created_at).toLocaleDateString()}</td>
                        <td>{c.campaigns?.name || '—'}</td>
                        <td>{c.from_number || '—'}</td>
                        <td>{c.caller_state || '—'}</td>
                        <td>{mmss(c.talk_seconds)}</td>
                        <td>{money(c.cost)}</td>
                        <td>{c.agent?.full_name || '—'}</td>
                        <td>{c.disputed ? <span className="badge sm">Credited</span> : <button className="btn-ghost btn-sm" onClick={() => credit(c.id)}>Credit</button>}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function InboundTable({ rows }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead><tr><th>Name</th><th>Calls</th><th>Paid</th><th>Spend</th></tr></thead>
        <tbody>
          {!rows ? <tr><td colSpan={4} className="muted">Loading…</td></tr>
            : rows.length === 0 ? <tr><td colSpan={4} className="muted">No calls.</td></tr>
              : rows.map((r) => (
                <tr key={r.key}><td>{r.label}</td><td>{r.gross}</td><td>{r.billable}</td><td>{money(r.spend)}</td></tr>
              ))}
        </tbody>
      </table>
    </div>
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
            {!rows ? <tr><td colSpan={4} className="muted">Loading…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={4} className="muted">No data.</td></tr>
                : rows.map((r) => (
                  <tr key={r.key}><td>{r.label}</td><td>{r.count}</td><td>{r.contacted}</td><td><span className="badge">{r.contact_rate}%</span></td></tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
