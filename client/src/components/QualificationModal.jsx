import { useEffect, useState } from 'react';
import { useDialer } from '../dialer/DialerContext.jsx';
import { api } from '../api';

const CONDITIONS = [
  { key: 'cancer', label: 'Cancer', detail: [{ k: 'cancer_type', ph: 'Type' }, { k: 'cancer_when', ph: 'When diagnosed' }] },
  { key: 'heart_stroke', label: 'Heart attack / stroke', detail: [{ k: 'heart_stroke_when', ph: 'When' }] },
  { key: 'chf', label: 'Congestive heart failure (CHF)', detail: [] },
  { key: 'copd', label: 'COPD / oxygen use', detail: [] },
  { key: 'diabetes', label: 'Diabetes', detail: [{ k: 'diabetes_insulin', ph: 'Insulin? yes/no' }, { k: 'diabetes_onset', ph: 'Onset age' }] },
  { key: 'dialysis', label: 'Dialysis / kidney disease', detail: [] },
  { key: 'hiv', label: 'HIV / AIDS', detail: [] },
  { key: 'amputation', label: 'Amputation (diabetes-related)', detail: [] }
];

function ageFromDob(dob) {
  if (!dob) return '';
  const d = new Date(dob); if (isNaN(d)) return '';
  const t = new Date(); let a = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--;
  return a >= 0 && a < 120 ? a : '';
}

export default function QualificationModal() {
  const { qualifyLeadId, qualifyCallId, closeQualify } = useDialer();
  const [a, setA] = useState({});
  const [tiers, setTiers] = useState([]);
  const [tier, setTier] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!qualifyLeadId) return;
    setErr(''); setMsg(''); setTier(null); setLoading(true);
    Promise.all([
      api(`/leads/${qualifyLeadId}`),
      api('/config/tier-links').catch(() => []),
      api(`/leads/${qualifyLeadId}/qualification`).catch(() => null)
    ]).then(([lead, tl, existing]) => {
      const base = {
        first_name: lead.first_name || '', last_name: lead.last_name || '',
        dob: lead.dob ? String(lead.dob).slice(0, 10) : '', gender: lead.gender || '',
        state: lead.state || '', zip: lead.zip || '',
        tobacco: lead.tobacco === true ? 'yes' : lead.tobacco === false ? 'no' : '',
        beneficiary_name: lead.beneficiary_name || '', beneficiary_relationship: lead.beneficiary_relationship || '',
        coverage_amount: lead.coverage_amount ?? ''
      };
      setA({ ...base, ...(existing?.answers || {}) });
      if (existing?.tier) setTier(existing.tier);
      setTiers(tl || []);
    }).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, [qualifyLeadId]);

  if (!qualifyLeadId) return null;
  const set = (k) => (e) => setA((x) => ({ ...x, [k]: e.target.value }));

  function openTier(t) {
    setTier(t.tier);
    if (t.url) window.open(t.url, '_blank', 'noopener');
    else setMsg(`No link set for ${t.label} yet (add it in Settings).`);
  }

  async function save(closeAfter) {
    setSaving(true); setErr(''); setMsg('');
    try {
      await api(`/leads/${qualifyLeadId}/qualification`, {
        method: 'POST', body: JSON.stringify({ answers: a, tier, inbound_call_id: qualifyCallId })
      });
      if (closeAfter) closeQualify(); else setMsg('Saved.');
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal qual-modal">
        <div className="row-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="section-title" style={{ margin: 0 }}>Qualify the lead {a.dob ? `· age ${ageFromDob(a.dob)}` : ''}</div>
          <button className="phone-x" onClick={closeQualify}>✕</button>
        </div>
        {err && <p className="error">{err}</p>}
        {msg && <p className="ok">{msg}</p>}
        {loading ? <p className="muted">Loading…</p> : (
          <>
            <div className="form-grid">
              <div className="field"><label>First name</label><input value={a.first_name} onChange={set('first_name')} /></div>
              <div className="field"><label>Last name</label><input value={a.last_name} onChange={set('last_name')} /></div>
              <div className="field"><label>Date of birth</label><input type="date" value={a.dob} onChange={set('dob')} /></div>
              <div className="field"><label>Gender</label>
                <select value={a.gender} onChange={set('gender')}><option value="">—</option><option>Male</option><option>Female</option></select>
              </div>
              <div className="field"><label>State</label><input maxLength={2} value={a.state} onChange={set('state')} /></div>
              <div className="field"><label>ZIP</label><input value={a.zip} onChange={set('zip')} /></div>
              <div className="field"><label>Height</label><input value={a.height || ''} onChange={set('height')} placeholder={'e.g. 5\'8"'} /></div>
              <div className="field"><label>Weight (lb)</label><input value={a.weight || ''} onChange={set('weight')} /></div>
              <div className="field"><label>Tobacco</label>
                <select value={a.tobacco} onChange={set('tobacco')}><option value="">—</option><option value="yes">Yes</option><option value="no">No</option></select>
              </div>
              <div className="field"><label>Coverage wanted ($)</label><input type="number" value={a.coverage_amount} onChange={set('coverage_amount')} /></div>
              <div className="field"><label>Beneficiary</label><input value={a.beneficiary_name} onChange={set('beneficiary_name')} /></div>
              <div className="field"><label>Relationship</label><input value={a.beneficiary_relationship} onChange={set('beneficiary_relationship')} /></div>
            </div>

            <div className="section-title" style={{ marginTop: 18 }}>Health (knockout questions)</div>
            <div className="qual-health">
              {CONDITIONS.map((c) => (
                <div key={c.key} className="qual-cond">
                  <div className="qual-cond-row">
                    <span>{c.label}</span>
                    <select value={a[c.key] || ''} onChange={set(c.key)} style={{ width: 90 }}>
                      <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                    </select>
                  </div>
                  {a[c.key] === 'yes' && c.detail.length > 0 && (
                    <div className="qual-detail">
                      {c.detail.map((d) => <input key={d.k} value={a[d.k] || ''} onChange={set(d.k)} placeholder={d.ph} />)}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="field full" style={{ marginTop: 14 }}>
              <label>Notes</label><textarea value={a.notes || ''} onChange={set('notes')} style={{ minHeight: 70 }} />
            </div>

            <div className="section-title" style={{ marginTop: 16 }}>Recommend a plan — opens the carrier application</div>
            <div className="qual-tiers">
              {tiers.map((t) => (
                <button key={t.tier} className={'tier-btn' + (tier === t.tier ? ' on' : '')} onClick={() => openTier(t)}>
                  {t.label}{!t.url && <span className="tier-nolink">no link</span>}
                </button>
              ))}
            </div>

            <div className="row-actions" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={closeQualify}>Close</button>
              <button className="btn-ghost" onClick={() => save(false)} disabled={saving}>Save</button>
              <button className="btn" onClick={() => save(true)} disabled={saving}>{saving ? 'Saving…' : 'Save & close'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
