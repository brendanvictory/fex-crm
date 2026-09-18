import { useEffect, useState } from 'react';
import { useDialer } from '../dialer/DialerContext.jsx';
import { api } from '../api';

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function Softphone() {
  const { status, lead, leadLabel, muted, seconds, error, setError, hangup, toggleMute, dispoFor, closeDispo } = useDialer();
  const active = status === 'connecting' || status === 'in-call';

  return (
    <>
      {error && (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button className="toast-x" onClick={() => setError('')}>✕</button>
        </div>
      )}

      {active && (
        <div className="softphone">
          <div className="sp-dot" />
          <div className="sp-info">
            <div className="sp-name">{lead ? leadLabel(lead) : 'Calling…'}</div>
            <div className="sp-status">{status === 'connecting' ? 'Connecting…' : `In call · ${mmss(seconds)}`}</div>
          </div>
          <button className="btn-ghost btn-sm" onClick={toggleMute}>{muted ? 'Unmute' : 'Mute'}</button>
          <button className="sp-hang" onClick={hangup}>Hang up</button>
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

const leadName = (l) => l ? [l.first_name, l.last_name].filter(Boolean).join(' ') || l.phone || 'Lead' : 'Lead';
