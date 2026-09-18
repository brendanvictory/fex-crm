import { useEffect, useState } from 'react';
import { useDialer } from '../dialer/DialerContext.jsx';
import { api } from '../api';

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
const leadName = (l) => l ? [l.first_name, l.last_name].filter(Boolean).join(' ') || l.phone || 'Lead' : 'Lead';
const fmt = (n) => n; // could prettify later

export default function Softphone() {
  const {
    status, lead, leadLabel, muted, seconds, error, setError,
    startManualCall, hangup, toggleMute, sendDigit,
    dispoFor, closeDispo, panelOpen, closePhone
  } = useDialer();

  const active = status === 'connecting' || status === 'in-call';
  const [typed, setTyped] = useState('');
  const [numbers, setNumbers] = useState([]);
  const [callerId, setCallerId] = useState('');

  useEffect(() => {
    if (!panelOpen) return;
    api('/calls/numbers').then((list) => {
      setNumbers(list);
      if (!callerId && list[0]) setCallerId(list[0].number);
    }).catch(() => {});
  }, [panelOpen]); // eslint-disable-line

  function press(k) {
    if (active) sendDigit(k);
    else setTyped((t) => (t + k).slice(0, 20));
  }
  function backspace() { setTyped((t) => t.slice(0, -1)); }
  function call() {
    if (!typed) return;
    startManualCall(typed, callerId || undefined);
  }

  const showPanel = panelOpen || active;

  return (
    <>
      {error && (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button className="toast-x" onClick={() => setError('')}>✕</button>
        </div>
      )}

      {showPanel && (
        <div className="phone-panel">
          <div className="phone-head">
            <span className="phone-title">Phone</span>
            <button className="phone-x" onClick={closePhone} disabled={active} title={active ? 'End the call first' : 'Close'}>✕</button>
          </div>

          <div className="phone-display">
            {active ? (
              <>
                <div className="pd-name">{lead ? leadLabel(lead) : 'Calling…'}</div>
                <div className="pd-status">
                  <span className="sp-dot" /> {status === 'connecting' ? 'Connecting…' : `In call · ${mmss(seconds)}`}
                </div>
              </>
            ) : (
              <>
                <input className="pd-input" value={typed} onChange={(e) => setTyped(e.target.value.replace(/[^0-9*#+]/g, ''))} placeholder="Enter a number" />
                <select className="pd-caller" value={callerId} onChange={(e) => setCallerId(e.target.value)}>
                  {numbers.length === 0 && <option value="">Default caller ID</option>}
                  {numbers.map((n) => (
                    <option key={n.id || n.number} value={n.number}>
                      {n.number}{n.state ? ` · ${n.state}` : ''}{n.label ? ` · ${n.label}` : ''}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

          <div className="keypad">
            {KEYS.map((k) => (
              <button key={k} className="key" onClick={() => press(k)}>{k}</button>
            ))}
          </div>

          <div className="phone-actions">
            {active ? (
              <>
                <button className="btn-ghost" onClick={toggleMute}>{muted ? 'Unmute' : 'Mute'}</button>
                <button className="sp-hang" onClick={hangup}>Hang up</button>
              </>
            ) : (
              <>
                <button className="btn-ghost" onClick={backspace} disabled={!typed}>⌫</button>
                <button className="call-btn" style={{ flex: 1 }} onClick={call} disabled={!typed}>Call</button>
              </>
            )}
          </div>
        </div>
      )}

      {dispoFor && <DispositionModal callId={dispoFor.call_id} lead={dispoFor.lead} onClose={closeDispo} />}
    </>
  );
}

function DispositionModal({ callId, lead, onClose }) {
  const [disps, setDisps] = useState([]);
  const [dispId, setDispId] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { api('/config/dispositions').then((d) => setDisps(d.filter((x) => x.is_active))).catch(() => {}); }, []);

  async function save() {
    setSaving(true); setErr('');
    try {
      await api(`/calls/${callId}/disposition`, { method: 'PATCH', body: JSON.stringify({ disposition_id: dispId || null }) });
      onClose();
    } catch (e) { setErr(e.message); setSaving(false); }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="section-title">Call ended — log the outcome</div>
        <p className="muted" style={{ marginTop: 0 }}>{leadName(lead)}</p>
        {err && <p className="error">{err}</p>}
        <div className="field">
          <label>Disposition</label>
          <select value={dispId} onChange={(e) => setDispId(e.target.value)}>
            <option value="">— Select —</option>
            {disps.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="row-actions" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onClose}>Skip</button>
          <button className="btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save outcome'}</button>
        </div>
      </div>
    </div>
  );
}
