import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api } from '../api';

const BLANK = {
  first_name: '', last_name: '', phone: '', email: '',
  address1: '', address2: '', city: '', state: '', zip: '',
  dob: '', age: '', gender: '',
  beneficiary_name: '', beneficiary_relationship: '',
  tobacco: '', coverage_amount: '',
  status_id: '', source_id: '', owner_id: '',
  dnc: false, consent_ref: '', consent_at: '',
  notes: ''
};

// Turn empty strings into null and coerce number/bool fields before sending.
function clean(form) {
  const out = { ...form };
  for (const k of Object.keys(out)) if (out[k] === '') out[k] = null;
  if (out.age != null) out.age = Number(out.age);
  if (out.coverage_amount != null) out.coverage_amount = Number(out.coverage_amount);
  if (out.tobacco === 'yes') out.tobacco = true;
  else if (out.tobacco === 'no') out.tobacco = false;
  else if (out.tobacco === null) out.tobacco = null;
  out.dnc = !!out.dnc;
  return out;
}

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const [form, setForm] = useState(BLANK);
  const [statuses, setStatuses] = useState([]);
  const [sources, setSources] = useState([]);
  const [agents, setAgents] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    Promise.all([api('/config/statuses'), api('/config/sources'), api('/config/agents')])
      .then(([s, src, a]) => { setStatuses(s); setSources(src); setAgents(a); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isNew) return;
    setLoading(true);
    Promise.all([api(`/leads/${id}`), api(`/leads/${id}/activity`)])
      .then(([lead, acts]) => {
        const f = { ...BLANK };
        for (const k of Object.keys(BLANK)) {
          if (lead[k] === null || lead[k] === undefined) continue;
          if (k === 'tobacco') f.tobacco = lead.tobacco === true ? 'yes' : lead.tobacco === false ? 'no' : '';
          else if (k === 'dob' && lead.dob) f.dob = lead.dob.slice(0, 10);
          else if (k === 'consent_at' && lead.consent_at) f.consent_at = lead.consent_at.slice(0, 10);
          else f[k] = lead[k];
        }
        setForm(f);
        setActivity(acts);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function save(e) {
    e.preventDefault();
    setSaving(true); setErr(''); setMsg('');
    try {
      const payload = clean(form);
      if (isNew) {
        const created = await api('/leads', { method: 'POST', body: JSON.stringify(payload) });
        navigate(`/leads/${created.id}`);
      } else {
        await api(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        setMsg('Saved.');
        api(`/leads/${id}/activity`).then(setActivity).catch(() => {});
      }
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  if (loading) return <Layout><p className="muted">Loading…</p></Layout>;

  return (
    <Layout>
      <div className="page-head">
        <h1>{isNew ? 'New Lead' : [form.first_name, form.last_name].filter(Boolean).join(' ') || 'Lead'}</h1>
        <button className="btn-ghost" onClick={() => navigate('/leads')}>← Back to Leads</button>
      </div>

      {err && <p className="error">{err}</p>}
      {msg && <p style={{ color: 'green' }}>{msg}</p>}

      <div className="stack">
        <form className="card" onSubmit={save}>
          <div className="section-title">Contact</div>
          <div className="form-grid">
            <Field label="First name"><input value={form.first_name} onChange={set('first_name')} /></Field>
            <Field label="Last name"><input value={form.last_name} onChange={set('last_name')} /></Field>
            <Field label="Phone"><input value={form.phone} onChange={set('phone')} /></Field>
            <Field label="Email"><input value={form.email} onChange={set('email')} /></Field>
            <Field label="Address 1"><input value={form.address1} onChange={set('address1')} /></Field>
            <Field label="Address 2"><input value={form.address2} onChange={set('address2')} /></Field>
            <Field label="City"><input value={form.city} onChange={set('city')} /></Field>
            <Field label="State"><input maxLength={2} value={form.state} onChange={set('state')} /></Field>
            <Field label="ZIP"><input value={form.zip} onChange={set('zip')} /></Field>
          </div>

          <div className="section-title" style={{ marginTop: 18 }}>Demographics</div>
          <div className="form-grid">
            <Field label="Date of birth"><input type="date" value={form.dob} onChange={set('dob')} /></Field>
            <Field label="Age"><input type="number" value={form.age} onChange={set('age')} /></Field>
            <Field label="Gender">
              <select value={form.gender} onChange={set('gender')}>
                <option value="">—</option><option>Male</option><option>Female</option>
              </select>
            </Field>
            <Field label="Tobacco">
              <select value={form.tobacco} onChange={set('tobacco')}>
                <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
              </select>
            </Field>
          </div>

          <div className="section-title" style={{ marginTop: 18 }}>Policy interest</div>
          <div className="form-grid">
            <Field label="Coverage amount"><input type="number" value={form.coverage_amount} onChange={set('coverage_amount')} /></Field>
            <Field label="Beneficiary name"><input value={form.beneficiary_name} onChange={set('beneficiary_name')} /></Field>
            <Field label="Beneficiary relationship"><input value={form.beneficiary_relationship} onChange={set('beneficiary_relationship')} /></Field>
          </div>

          <div className="section-title" style={{ marginTop: 18 }}>Assignment</div>
          <div className="form-grid">
            <Field label="Status">
              <select value={form.status_id || ''} onChange={set('status_id')}>
                <option value="">—</option>
                {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Source">
              <select value={form.source_id || ''} onChange={set('source_id')}>
                <option value="">—</option>
                {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Owner (agent)">
              <select value={form.owner_id || ''} onChange={set('owner_id')}>
                <option value="">Unassigned</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.full_name || '(unnamed)'}</option>)}
              </select>
            </Field>
          </div>

          <div className="section-title" style={{ marginTop: 18 }}>Compliance</div>
          <div className="form-grid">
            <Field label="Consent reference"><input value={form.consent_ref} onChange={set('consent_ref')} /></Field>
            <Field label="Consent date"><input type="date" value={form.consent_at} onChange={set('consent_at')} /></Field>
            <Field label="Do Not Call">
              <div className="checkbox-row">
                <input type="checkbox" checked={form.dnc} onChange={set('dnc')} />
                <span className="muted">Blocks dialer &amp; SMS</span>
              </div>
            </Field>
          </div>

          <div className="field full" style={{ marginTop: 18 }}>
            <label>Notes</label>
            <textarea value={form.notes} onChange={set('notes')} />
          </div>

          <div className="row-actions" style={{ marginTop: 20 }}>
            <button className="btn" type="submit" disabled={saving}>
              {saving ? 'Saving…' : isNew ? 'Create Lead' : 'Save changes'}
            </button>
          </div>
        </form>

        {!isNew && (
          <div className="card">
            <div className="section-title">Activity</div>
            {activity.length === 0 ? (
              <p className="muted">No activity yet.</p>
            ) : (
              <ul className="timeline">
                {activity.map((a) => (
                  <li key={a.id}>
                    <div>{a.action}</div>
                    <div className="when">{new Date(a.created_at).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}

function Field({ label, children }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}
