import { useEffect, useState } from 'react';
import { api } from '../api';
import { TrendChart, BarList } from '../components/charts.jsx';

const money = (n) => (n == null ? '—' : '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }));
const pctStr = (n) => (n == null ? '—' : `${n}%`);
const RANGES = [{ d: 7, label: '7 days' }, { d: 30, label: '30 days' }, { d: 90, label: '90 days' }];

// features: which sections to show. Defaults to all.
export default function PartnerDashboard({ sourceId = null, features = {} }) {
  const f = { core: true, sales: true, returns: true, posting: true, ...features };
  const [days, setDays] = useState(30);
  const [ov, setOv] = useState(null);
  const [series, setSeries] = useState([]);
  const [disps, setDisps] = useState([]);
  const [rejects, setRejects] = useState([]);
  const [returns, setReturns] = useState([]);
  const [err, setErr] = useState('');
  const [showKey, setShowKey] = useState(false);

  function qs(extra = {}) {
    const p = new URLSearchParams();
    const from = new Date(Date.now() - days * 864e5).toISOString();
    p.set('from', from);
    if (sourceId) p.set('source', sourceId);
    Object.entries(extra).forEach(([k, v]) => p.set(k, v));
    return p.toString();
  }

  useEffect(() => {
    let cancelled = false;
    setErr('');
    Promise.all([
      api(`/partner/overview?${qs()}`),
      api(`/partner/timeseries?${qs()}`),
      api(`/partner/dispositions?${qs()}`),
      api(`/partner/rejections?${qs()}`),
      f.returns ? api(`/partner/returns?${qs()}`) : Promise.resolve([])
    ]).then(([o, t, d, r, ret]) => {
      if (cancelled) return;
      setOv(o); setSeries(t); setDisps(d); setRejects(r); setReturns(ret);
    }).catch((e) => !cancelled && setErr(e.message));
    return () => { cancelled = true; };
  }, [days, sourceId]); // eslint-disable-line

  if (err) return <p className="error">{err}</p>;
  if (!ov) return <p className="muted">Loading…</p>;

  const v = ov.volume, e = ov.engagement, c = ov.conversion, h = ov.health;
  const spd = e.avg_speed_to_contact_min;
  const speedLabel = spd == null ? '—' : spd < 60 ? `${spd} min` : `${Math.round(spd / 60 * 10) / 10} hr`;

  return (
    <div className="stack">
      <div className="segmented" style={{ justifyContent: 'flex-end', marginBottom: 4 }}>
        {RANGES.map((r) => (
          <button key={r.d} className={'seg' + (days === r.d ? ' active' : '')} onClick={() => setDays(r.d)}>{r.label}</button>
        ))}
      </div>

      {h && (h.last_post_at || v.posted > 0) && (
        <div className="callout" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <div><strong>Posting status:</strong> {h.last_post_at ? `last lead received ${new Date(h.last_post_at).toLocaleString()}` : 'no posts yet'}</div>
          <div><strong>Reject rate (30d):</strong> {h.error_rate_30d}%</div>
        </div>
      )}

      <div className="kpis">
        <Kpi label="Leads posted" value={v.posted} sub={`${pctStr(v.acceptance_rate)} accepted`} />
        <Kpi label="Accepted" value={v.accepted} sub={`${v.duplicate} dupes · ${v.rejected} rejected`} />
        <Kpi label="Contact rate" value={pctStr(e.contact_rate)} sub={`${e.contacted} of ${e.cohort} contacted`} />
        <Kpi label="Speed to contact" value={speedLabel} sub="avg. to first call" />
        {f.sales && <Kpi label="Sold" value={c.sold} sub={`${pctStr(c.close_rate)} close rate`} />}
        {f.returns && <Kpi label="Credits" value={ov.returns.count} sub={`${money(ov.returns.credited)} credited`} />}
      </div>

      <div className="chart-card full">
        <h3>Leads posted per day</h3>
        {series.length === 0 ? <p className="muted">No posts in this range.</p> :
          <TrendChart data={series} xKey="date" yKey="posted" />}
      </div>

      {f.core && (
        <div className="chart-card full">
          <h3>Call outcomes</h3>
          {disps.length === 0 ? <p className="muted">No call activity yet.</p> :
            <BarList data={disps} labelKey="name" valueKey="count" height={Math.max(120, disps.length * 34)} />}
        </div>
      )}

      {f.core && (
        <div className="card">
          <div className="section-title">Rejected &amp; duplicate posts</div>
          <p className="muted" style={{ marginTop: 0 }}>Leads we couldn't accept, with the reference you sent so you can match them on your side.</p>
          {rejects.length === 0 ? <p className="muted" style={{ marginBottom: 0 }}>None in this range — nice.</p> : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Date</th><th>Your ref</th><th>Phone</th><th>State</th><th>Status</th><th>Reason</th></tr></thead>
                <tbody>
                  {rejects.map((x, i) => (
                    <tr key={i}>
                      <td>{new Date(x.created_at).toLocaleDateString()}</td>
                      <td>{x.posting_ref || <span className="muted">—</span>}</td>
                      <td>{x.phone_last4 ? `••• ${x.phone_last4}` : '—'}</td>
                      <td>{x.state || '—'}</td>
                      <td><span className={'badge sm' + (x.status === 'rejected' ? ' draft' : '')}>{x.status}</span></td>
                      <td>{prettyReason(x.reason)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {f.returns && (
        <div className="card">
          <div className="section-title">Returns &amp; credits</div>
          {returns.length === 0 ? <p className="muted" style={{ marginBottom: 0 }}>No returns on file.</p> : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Date</th><th>Your ref</th><th>Phone</th><th>State</th><th>Reason</th><th>Status</th><th>Credit</th></tr></thead>
                <tbody>
                  {returns.map((x) => (
                    <tr key={x.id}>
                      <td>{new Date(x.created_at).toLocaleDateString()}</td>
                      <td>{x.posting_ref || <span className="muted">—</span>}</td>
                      <td>{x.phone_last4 ? `••• ${x.phone_last4}` : '—'}</td>
                      <td>{x.state || '—'}</td>
                      <td>{prettyReason(x.reason)}</td>
                      <td><span className="badge sm">{x.status}</span></td>
                      <td>{money(x.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {f.posting && ov.source && (
        <div className="card">
          <div className="section-title">Posting details</div>
          <div className="kv">
            <div><span className="muted">Source</span><br />{ov.source.name}</div>
            {ov.source.cost_per_lead != null && <div><span className="muted">Cost per lead</span><br />{money(ov.source.cost_per_lead)}</div>}
            <div>
              <span className="muted">API key</span><br />
              <code className="key">{showKey ? ov.source.api_key : '•'.repeat(18)}</code>{' '}
              <button className="link-btn" onClick={() => setShowKey((s) => !s)}>{showKey ? 'hide' : 'show'}</button>
            </div>
          </div>
          {ov.source.posting_spec && (
            <>
              <div className="section-title" style={{ marginTop: 18 }}>How to post leads</div>
              <pre className="spec-block">{ov.source.posting_spec}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value == null ? '—' : value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function prettyReason(r) {
  if (!r) return '—';
  const map = { missing_contact: 'No phone or email', duplicate: 'Duplicate', db_error: 'Data error' };
  return map[r] || r;
}
