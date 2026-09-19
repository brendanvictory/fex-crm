import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api } from '../api';
import { useDialer } from '../dialer/DialerContext.jsx';

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
  const dialer = useDialer();
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
        <div className="row-actions">
          {!isNew && form.phone && (
            <button className="call-btn" disabled={dialer?.status === 'in-call' || dialer?.status === 'connecting'}
              onClick={() => dialer.startCall({ id, first_name: form.first_name, last_name: form.last_name, phone: form.phone })}>
              Call
            </button>
          )}
          <button className="btn-ghost" onClick={() => navigate('/leads')}>← Back to Leads</button>
        </div>
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

        {!isNew && <Sales leadId={id} />}

        {!isNew && <Followups leadId={id} />}

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

const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

function Sales({ leadId }) {
  const [carriers, setCarriers] = useState([]);
  const [sales, setSales] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ carrier_id: '', product: '', policy_number: '', monthly_premium: '', draft_day: '', effective_date: '' });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [c, s] = await Promise.all([api('/config/carriers'), api(`/sales?lead=${leadId}`)]);
      setCarriers(c); setSales(s);
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, [leadId]);

  async function record(e) {
    e.preventDefault();
    if (!form.carrier_id) { setErr('Pick a carrier.'); return; }
    setSaving(true); setErr('');
    try {
      await api('/sales', { method: 'POST', body: JSON.stringify(form) });
      setForm({ carrier_id: '', product: '', policy_number: '', monthly_premium: '', draft_day: '', effective_date: '' });
      setShow(false); load();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="card">
      <div className="row-actions" style={{ justifyContent: 'space-between' }}>
        <div className="section-title" style={{ margin: 0 }}>Sales &amp; policies</div>
        {!show && <button className="btn" onClick={() => setShow(true)}>Record sale</button>}
      </div>
      {err && <p className="error">{err}</p>}

      {show && (
        <form className="form-grid" style={{ marginTop: 14 }} onSubmit={record}>
          <Field label="Carrier">
            <select value={form.carrier_id} onChange={set('carrier_id')} required>
              <option value="">— Select —</option>
              {carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Product"><input value={form.product} onChange={set('product')} /></Field>
          <Field label="Monthly premium"><input type="number" step="0.01" value={form.monthly_premium} onChange={set('monthly_premium')} /></Field>
          <Field label="Policy number"><input value={form.policy_number} onChange={set('policy_number')} /></Field>
          <Field label="Draft day (1–28)"><input type="number" value={form.draft_day} onChange={set('draft_day')} /></Field>
          <Field label="Effective date"><input type="date" value={form.effective_date} onChange={set('effective_date')} /></Field>
          <div className="field full row-actions">
            <button className="btn" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save sale'}</button>
            <button className="btn-ghost" type="button" onClick={() => setShow(false)}>Cancel</button>
          </div>
        </form>
      )}

      {sales.length === 0 ? (!show && <p className="muted" style={{ marginBottom: 0 }}>No sales recorded.</p>) : (
        <ul className="timeline" style={{ marginTop: 12 }}>
          {sales.map((s) => (
            <li key={s.id}>
              <div><strong>{s.carriers?.name || s.carrier}</strong> {s.product ? `· ${s.product}` : ''} · {money(s.annual_premium)}/yr</div>
              <div className="when">{s.status} · {s.sold_at ? new Date(s.sold_at).toLocaleDateString() : ''}{s.policy_number ? ` · #${s.policy_number}` : ''}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const BLANK_CB = { kind: 'callback', scheduled_at: '', duration_minutes: 30, reminder_minutes: 30, title: '', notes: '' };

function Followups({ leadId }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(BLANK_CB);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    try { setItems(await api(`/callbacks?lead=${leadId}&from=2000-01-01`)); }
    catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, [leadId]);

  async function add(e) {
    e.preventDefault();
    if (!form.scheduled_at) return;
    setSaving(true); setErr('');
    try {
      const iso = new Date(form.scheduled_at).toISOString();
      await api('/callbacks', { method: 'POST', body: JSON.stringify({ lead_id: leadId, ...form, scheduled_at: iso }) });
      setForm(BLANK_CB);
      load();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  }
  async function toggle(it) {
    try { await api(`/callbacks/${it.id}`, { method: 'PATCH', body: JSON.stringify({ completed: !it.completed }) }); load(); }
    catch (e) { setErr(e.message); }
  }
  async function remove(it) {
    try { await api(`/callbacks/${it.id}`, { method: 'DELETE' }); load(); }
    catch (e) { setErr(e.message); }
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="card">
      <div className="section-title">Follow-ups &amp; appointments</div>
      {err && <p className="error">{err}</p>}
      <form className="form-grid" onSubmit={add}>
        <Field label="Type">
          <select value={form.kind} onChange={set('kind')}>
            <option value="callback">Callback</option>
            <option value="appointment">Appointment</option>
          </select>
        </Field>
        <Field label="When"><input type="datetime-local" value={form.scheduled_at} onChange={set('scheduled_at')} required /></Field>
        <Field label="Duration (min)"><input type="number" value={form.duration_minutes} onChange={set('duration_minutes')} /></Field>
        <Field label="Remind (min before)"><input type="number" value={form.reminder_minutes} onChange={set('reminder_minutes')} /></Field>
        <Field label="Title / note"><input value={form.title} onChange={set('title')} placeholder="e.g. Review quote" /></Field>
        <div className="field" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" type="submit" disabled={saving}>{saving ? 'Scheduling…' : 'Schedule'}</button>
        </div>
      </form>

      {items.length === 0 ? <p className="muted" style={{ marginBottom: 0 }}>Nothing scheduled.</p> : (
        <ul className="timeline">
          {items.map((it) => (
            <li key={it.id}>
              <div className="row-actions" style={{ justifyContent: 'space-between' }}>
                <div style={{ textDecoration: it.completed ? 'line-through' : 'none' }}>
                  <span className="badge">{it.kind === 'appointment' ? 'Appt' : 'Callback'}</span>{' '}
                  {new Date(it.scheduled_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  {it.title ? ` — ${it.title}` : ''}
                </div>
                <div className="row-actions">
                  <button className="btn-ghost btn-sm" onClick={() => toggle(it)}>{it.completed ? 'Reopen' : 'Done'}</button>
                  <button className="btn-ghost btn-sm" onClick={() => remove(it)}>Delete</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
