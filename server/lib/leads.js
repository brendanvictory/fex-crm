// Shared lead-processing helpers used by both the ingest API (external posts)
// and the bulk CSV upload, so both paths dedupe, assign, and map identically.

// State -> primary IANA timezone (multi-zone states use their largest zone).
// Used to set the calling-window timezone at ingest for the Phase 3 dialer.
const STATE_TZ = {
  AL: 'America/Chicago', AK: 'America/Anchorage', AZ: 'America/Phoenix', AR: 'America/Chicago',
  CA: 'America/Los_Angeles', CO: 'America/Denver', CT: 'America/New_York', DE: 'America/New_York',
  FL: 'America/New_York', GA: 'America/New_York', HI: 'Pacific/Honolulu', ID: 'America/Boise',
  IL: 'America/Chicago', IN: 'America/Indiana/Indianapolis', IA: 'America/Chicago', KS: 'America/Chicago',
  KY: 'America/New_York', LA: 'America/Chicago', ME: 'America/New_York', MD: 'America/New_York',
  MA: 'America/New_York', MI: 'America/New_York', MN: 'America/Chicago', MS: 'America/Chicago',
  MO: 'America/Chicago', MT: 'America/Denver', NE: 'America/Chicago', NV: 'America/Los_Angeles',
  NH: 'America/New_York', NJ: 'America/New_York', NM: 'America/Denver', NY: 'America/New_York',
  NC: 'America/New_York', ND: 'America/Chicago', OH: 'America/New_York', OK: 'America/Chicago',
  OR: 'America/Los_Angeles', PA: 'America/New_York', RI: 'America/New_York', SC: 'America/New_York',
  SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago', UT: 'America/Denver',
  VT: 'America/New_York', VA: 'America/New_York', WA: 'America/Los_Angeles', WV: 'America/New_York',
  WI: 'America/Chicago', WY: 'America/Denver', DC: 'America/New_York'
};
export const stateTimezone = (s) => (s ? STATE_TZ[String(s).toUpperCase()] || null : null);

export function normalizePhone(p) {
  if (!p) return null;
  const d = String(p).replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : d || null;
}

// Dedupe on phone first, then email.
export function dedupeKey(input) {
  const ph = normalizePhone(input.phone);
  if (ph) return 'p:' + ph;
  if (input.email) return 'e:' + String(input.email).trim().toLowerCase();
  return null;
}

const FIELDS = new Set([
  'first_name', 'last_name', 'phone', 'email', 'address1', 'address2', 'city', 'state', 'zip',
  'dob', 'age', 'gender', 'beneficiary_name', 'beneficiary_relationship', 'tobacco',
  'coverage_amount', 'consent_ref'
]);

const ALIASES = {
  firstname: 'first_name', fname: 'first_name', lastname: 'last_name', lname: 'last_name',
  phonenumber: 'phone', tel: 'phone', mobile: 'phone', emailaddress: 'email',
  zipcode: 'zip', postal: 'zip', st: 'state', dateofbirth: 'dob', birthdate: 'dob',
  coverage: 'coverage_amount', faceamount: 'coverage_amount', face_amount: 'coverage_amount',
  beneficiary: 'beneficiary_name'
};

// Map an arbitrary incoming key to one of our fields (or null to ignore it).
export function normalizeKey(k) {
  const n = String(k || '').trim().toLowerCase().replace(/[\s\-]+/g, '_');
  if (FIELDS.has(n)) return n;
  return ALIASES[n] || ALIASES[n.replace(/_/g, '')] || null;
}

export function normalizeRecord(raw) {
  const out = {};
  for (const k of Object.keys(raw || {})) {
    const f = normalizeKey(k);
    if (f) out[f] = raw[k];
  }
  return out;
}

function coerce(rec) {
  const r = { ...rec };
  if (r.state) r.state = String(r.state).toUpperCase().slice(0, 2);
  if (r.age === '' || r.age == null) delete r.age; else r.age = parseInt(r.age, 10) || null;
  if (r.coverage_amount === '' || r.coverage_amount == null) delete r.coverage_amount;
  else r.coverage_amount = Number(String(r.coverage_amount).replace(/[^0-9.]/g, '')) || null;
  if (r.tobacco === '' || r.tobacco == null) delete r.tobacco;
  else {
    const t = String(r.tobacco).trim().toLowerCase();
    r.tobacco = ['y', 'yes', 'true', '1', 't'].includes(t) ? true
      : ['n', 'no', 'false', '0', 'f'].includes(t) ? false : null;
  }
  if (r.gender) {
    const g = String(r.gender).trim().toLowerCase();
    r.gender = g.startsWith('m') ? 'Male' : g.startsWith('f') ? 'Female' : null;
  }
  return r;
}

// Least-loaded round-robin, respecting the source rule and state licensing.
export async function assignOwner(sb, orgId, source, state) {
  const rule = source?.assignment_rule || {};
  let { data: agents } = await sb
    .from('users').select('id').eq('org_id', orgId).eq('role', 'agent').eq('is_active', true);
  agents = agents || [];

  if (rule.state_license && state) {
    const { data: lic } = await sb
      .from('agent_licenses').select('user_id').eq('state', String(state).toUpperCase());
    const ok = new Set((lic || []).map((l) => l.user_id));
    agents = agents.filter((a) => ok.has(a.id));
  }
  if (agents.length === 0) return null;

  const counts = await Promise.all(agents.map(async (a) => {
    const { count } = await sb
      .from('leads').select('id', { count: 'exact', head: true }).eq('owner_id', a.id);
    return { id: a.id, count: count || 0 };
  }));
  counts.sort((x, y) => x.count - y.count);
  return counts[0].id;
}

// Flag a lead as worked (engaged), so it shows in the Active leads view.
export async function markWorked(sb, leadId) {
  if (!leadId) return;
  await sb.from('leads').update({ worked: true, last_activity_at: new Date().toISOString() }).eq('id', leadId);
}

// Build a ready-to-insert lead record; returns {record, duplicate}.
export async function prepareLead(sb, source, input, orgId) {
  const mapped = {};
  for (const k of Object.keys(input)) if (FIELDS.has(k)) mapped[k] = input[k];
  const rec = coerce(mapped);

  rec.org_id = orgId;
  rec.source_id = source?.id || null;
  rec.dedupe_key = dedupeKey(rec);
  rec.timezone = stateTimezone(rec.state);

  const { data: st } = await sb
    .from('lead_statuses').select('id').eq('is_default', true).limit(1).maybeSingle();
  if (st) rec.status_id = st.id;

  let duplicate = null;
  if (rec.dedupe_key) {
    const { data: ex } = await sb
      .from('leads').select('id').eq('org_id', orgId).eq('dedupe_key', rec.dedupe_key).maybeSingle();
    if (ex) duplicate = ex.id;
  }
  if (!duplicate) rec.owner_id = await assignOwner(sb, orgId, source, rec.state);

  return { record: rec, duplicate };
}
