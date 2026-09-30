import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api } from '../api';
import { useDialer } from '../dialer/DialerContext.jsx';

const val = (lead, f) => {
  if (f === 'tobacco') return lead.tobacco === true ? 'Yes' : lead.tobacco === false ? 'No' : '';
  if (f === 'coverage_amount') return lead.coverage_amount != null ? `$${Number(lead.coverage_amount).toLocaleString()}` : '';
  return lead[f] ?? '';
};
const mergeScript = (body, lead) =>
  (body || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, f) => val(lead, f) || `[${f}]`);
const name = (l) => l ? [l.first_name, l.last_name].filter(Boolean).join(' ') || l.phone || 'Lead' : '';

export default function PowerDialer() {
  const navigate = useNavigate();
  const dialer = useDialer();
  const [lists, setLists] = useState([]);
  const [scripts, setScripts] = useState([]);
  const [rebuttals, setRebuttals] = useState([]);
  const [openReb, setOpenReb] = useState(null);
  const [listId, setListId] = useState('all');
  const [scriptId, setScriptId] = useState('');
  const [running, setRunning] = useState(false);
  const [lead, setLead] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [done, setDone] = useState(null); // null | {reason, total}
  const [err, setErr] = useState('');
  const [viewId, setViewId] = useState(null); // lead id shown in the in-dialer viewer

  const leadRef = useRef(null);
  const awaitingRef = useRef(false);
  const cdRef = useRef(null);
  const runningRef = useRef(false);

  useEffect(() => {
    Promise.all([api('/config/lists'), api('/config/scripts'), api('/config/rebuttals')])
      .then(([l, s, rb]) => {
        setLists(l); setScripts(s.filter((x) => x.is_active));
        setRebuttals((rb || []).filter((x) => x.is_active));
      })
      .catch((e) => setErr(e.message));
  }, []);

  const script = scripts.find((s) => s.id === scriptId);

  function clearCountdown() { clearInterval(cdRef.current); setCountdown(0); }

  function scheduleDial(theLead) {
    setCountdown(3);
    clearInterval(cdRef.current);
    cdRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(cdRef.current); doDial(theLead); return 0; }
        return c - 1;
      });
    }, 1000);
  }
  function doDial(theLead) {
    if (!theLead) return;
    awaitingRef.current = true;
    dialer.startCall(theLead, undefined, 'power_dialer');
  }

  async function loadNext() {
    setErr(''); setLead(null); leadRef.current = null; setDone(null);
    try {
      const res = await api('/dialer/next', { method: 'POST', body: JSON.stringify({ list_id: listId }) });
      if (res.done) { setDone(res); setRunning(false); runningRef.current = false; return; }
      setLead(res.lead); leadRef.current = res.lead;
      scheduleDial(res.lead);
    } catch (e) { setErr(e.message); }
  }

  function start() { setRunning(true); runningRef.current = true; loadNext(); }
  function callNow() { clearCountdown(); doDial(leadRef.current); }
  function pause() { clearCountdown(); }
  function skip() { clearCountdown(); awaitingRef.current = false; loadNext(); }
  async function stop() {
    clearCountdown(); setRunning(false); runningRef.current = false;
    setLead(null); leadRef.current = null; awaitingRef.current = false;
    try { await api('/dialer/stop', { method: 'POST' }); } catch { /* */ }
  }

  // Auto-advance: after a dialed call fully completes (disposition closed).
  useEffect(() => {
    if (runningRef.current && awaitingRef.current && dialer.status === 'idle' && !dialer.dispoFor) {
      awaitingRef.current = false;
      loadNext();
    }
  }, [dialer.status, dialer.dispoFor]); // eslint-disable-line

  useEffect(() => () => { clearInterval(cdRef.current); }, []);

  return (
    <Layout>
      <div className="page-head">
        <h1>Power Dialer</h1>
        {running && <button className="sp-hang" style={{ flex: 'none' }} onClick={stop}>Stop dialing</button>}
      </div>
      {err && <p className="error">{err}</p>}

      {!running ? (
        <div className="card stack" style={{ maxWidth: 520 }}>
          <div className="section-title">Start a dialing session</div>
          <div className="field">
            <label>List to dial</label>
            <select value={listId} onChange={(e) => setListId(e.target.value)}>
              <option value="all">All leads</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}{l.lead_count != null ? ` (${l.lead_count})` : ''}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Script</label>
            <select value={scriptId} onChange={(e) => setScriptId(e.target.value)}>
              <option value="">— No script —</option>
              {scripts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><button className="btn" onClick={start}>Start dialing</button></div>
          {done && (
            <p className="muted">
              {done.reason === 'empty' && 'This list has no leads yet — if you just uploaded it, the rows may have been skipped as duplicates. Try "All leads" or check the import result.'}
              {done.reason === 'after_hours' && `All ${done.total} lead(s) in this list are outside their local calling hours right now. Calling is allowed 8am–9pm in each lead's timezone — they'll be dialable once it's 8am where they are.`}
              {done.reason === 'busy' && 'All leads in this list are currently being dialed by other agents.'}
              {!['empty', 'after_hours', 'busy'].includes(done.reason) && 'Nothing left to dial right now.'}
            </p>
          )}
        </div>
      ) : (
        <div className="chart-grid">
          <div className="chart-card">
            {lead ? (
              <>
                <h3 style={{ marginBottom: 4 }}>{name(lead)}</h3>
                <div className="muted" style={{ marginBottom: 14 }}>{lead.phone} · {lead.state || ''}</div>
                <div className="kv">
                  <div><span className="muted">Age</span><br />{lead.age ?? '—'}</div>
                  <div><span className="muted">Gender</span><br />{lead.gender || '—'}</div>
                  <div><span className="muted">Tobacco</span><br />{val(lead, 'tobacco') || '—'}</div>
                  <div><span className="muted">Coverage</span><br />{val(lead, 'coverage_amount') || '—'}</div>
                  <div><span className="muted">Beneficiary</span><br />{lead.beneficiary_name || '—'}</div>
                  <div><span className="muted">Status</span><br />{lead.lead_statuses?.name || '—'}</div>
                </div>

                <div className="row-actions" style={{ marginTop: 18, flexWrap: 'wrap' }}>
                  {dialer.status === 'idle' && countdown > 0 && (
                    <>
                      <span className="badge">Calling in {countdown}…</span>
                      <button className="call-btn" onClick={callNow}>Call now</button>
                      <button className="btn-ghost" onClick={pause}>Pause</button>
                    </>
                  )}
                  {dialer.status === 'idle' && countdown === 0 && (
                    <button className="call-btn" onClick={callNow}>Call</button>
                  )}
                  {dialer.status !== 'idle' && <span className="badge">On call — use the phone controls</span>}
                  <button className="btn-ghost" onClick={skip}>Skip</button>
                  <button className="btn-ghost" onClick={() => setViewId(lead.id)}>View lead</button>
                </div>
              </>
            ) : <p className="muted">Loading next lead…</p>}
          </div>

          <div className="chart-card">
            <h3>Script</h3>
            {script && lead
              ? <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 15 }}>{mergeScript(script.body, lead)}</div>
              : <p className="muted">{scriptId ? 'Loading…' : 'No script selected.'}</p>}

            {rebuttals.length > 0 && (
              <div className="rebuttals">
                <h3 style={{ marginTop: 22 }}>Rebuttals</h3>
                {rebuttals.map((rb) => {
                  const on = openReb === rb.id;
                  return (
                    <div key={rb.id} className={'reb' + (on ? ' open' : '')}>
                      <button className="reb-head" onClick={() => setOpenReb(on ? null : rb.id)}>
                        <span>{rb.title}</span>
                        <span className="reb-chev">{on ? '−' : '+'}</span>
                      </button>
                      {on && <div className="reb-body">{lead ? mergeScript(rb.body, lead) : rb.body}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {viewId && <LeadViewModal leadId={viewId} onClose={() => setViewId(null)} />}
    </Layout>
  );
}

// In-dialer lead viewer — keeps the dialing session alive (no navigation away).
function LeadViewModal({ leadId, onClose }) {
  const [lead, setLead] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [sources, setSources] = useState([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([api(`/leads/${leadId}`), api('/config/statuses'), api('/config/sources')])
      .then(([l, s, src]) => { setLead(l); setNote(l.notes || ''); setStatuses(s); setSources(src); })
      .catch((e) => setErr(e.message));
  }, [leadId]);

  async function saveNote() {
    setSaving(true); setErr(''); setMsg('');
    try { await api(`/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify({ notes: note }) }); setMsg('Saved.'); }
    catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  const sName = (id) => statuses.find((s) => s.id === id)?.name || '—';
  const srcName = (id) => sources.find((s) => s.id === id)?.name || '—';
  const tob = lead ? (lead.tobacco === true ? 'Yes' : lead.tobacco === false ? 'No' : '—') : '';
  const cov = lead && lead.coverage_amount != null ? `$${Number(lead.coverage_amount).toLocaleString()}` : '—';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 560, maxWidth: '100%' }} onClick={(e) => e.stopPropagation()}>
        {err && <p className="error">{err}</p>}
        {!lead ? <p className="muted">Loading…</p> : (
          <>
            <div className="row-actions" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: '0 0 2px' }}>{[lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Lead'}</h2>
                <div className="muted" style={{ fontSize: 13 }}>{lead.phone} · {lead.state || ''}</div>
              </div>
              <a className="btn-ghost btn-sm" href={`/leads/${leadId}`} target="_blank" rel="noopener noreferrer">Open full record ↗</a>
            </div>
            <div className="kv" style={{ marginTop: 14 }}>
              <div><span className="muted">Email</span><br />{lead.email || '—'}</div>
              <div><span className="muted">Age</span><br />{lead.age ?? '—'}</div>
              <div><span className="muted">Gender</span><br />{lead.gender || '—'}</div>
              <div><span className="muted">Tobacco</span><br />{tob}</div>
              <div><span className="muted">Coverage</span><br />{cov}</div>
              <div><span className="muted">Beneficiary</span><br />{lead.beneficiary_name || '—'}{lead.beneficiary_relationship ? ` (${lead.beneficiary_relationship})` : ''}</div>
              <div><span className="muted">City</span><br />{lead.city || '—'}</div>
              <div><span className="muted">ZIP</span><br />{lead.zip || '—'}</div>
              <div><span className="muted">Status</span><br />{sName(lead.status_id)}</div>
              <div><span className="muted">Source</span><br />{srcName(lead.source_id)}</div>
            </div>
            <div className="field full" style={{ marginTop: 16 }}>
              <label>Notes</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 100 }} />
            </div>
            {msg && <p className="ok" style={{ marginBottom: 0 }}>{msg}</p>}
            <div className="row-actions" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={onClose}>Close</button>
              <button className="btn" onClick={saveNote} disabled={saving}>{saving ? 'Saving…' : 'Save notes'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
