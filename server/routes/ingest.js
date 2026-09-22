import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { normalizeRecord, prepareLead, postingRef, normalizePhone } from '../lib/leads.js';

// PUBLIC endpoint — NOT behind requireAuth. External lead vendors POST here,
// authenticated by their lead source's API key (X-API-Key header or api_key
// in the body). Runs on the service-role client.
const r = Router();

r.post('/', async (req, res) => {
  const key = req.headers['x-api-key'] || req.body.api_key;
  if (!key) return res.status(401).json({ error: 'missing api key' });

  const { data: source, error: se } = await supabaseAdmin
    .from('lead_sources').select('*').eq('api_key', key).eq('is_active', true).maybeSingle();
  if (se) return res.status(500).json({ error: se.message });
  if (!source) return res.status(401).json({ error: 'invalid api key' });

  const raw = { ...req.body };
  delete raw.api_key;
  const input = normalizeRecord(raw);

  // Metadata for the partner portal (masked; the vendor's own ref, last-4 only).
  const ref = postingRef(req.body);
  const digits = normalizePhone(input.phone) || '';
  const last4 = digits.length >= 4 ? digits.slice(-4) : null;
  const stateGuess = input.state ? String(input.state).toUpperCase().slice(0, 2) : null;

  async function logPost(status, reason, leadId, state) {
    try {
      await supabaseAdmin.from('lead_posts').insert({
        org_id: source.org_id, source_id: source.id, status,
        reason: reason || null, posting_ref: ref, phone_last4: last4,
        state: state || stateGuess, lead_id: leadId || null
      });
    } catch { /* logging is best-effort */ }
  }

  // Minimal quality gate: a final-expense lead needs a phone (or at least email)
  // to be usable. Everything else is accepted and logged for the vendor to see.
  if (!digits && !input.email) {
    await logPost('rejected', 'missing_contact', null, stateGuess);
    return res.status(422).json({ status: 'rejected', reason: 'missing_contact' });
  }

  const { record, duplicate } = await prepareLead(supabaseAdmin, source, input, source.org_id);
  if (duplicate) {
    await logPost('duplicate', 'duplicate', duplicate, record.state);
    return res.json({ status: 'duplicate', id: duplicate });
  }

  const { data, error } = await supabaseAdmin.from('leads').insert(record).select('id').single();
  if (error) {
    await logPost('rejected', (error.message || 'db_error').slice(0, 200), null, record.state);
    return res.status(400).json({ error: error.message });
  }

  await supabaseAdmin.from('activity_log').insert({
    org_id: source.org_id, entity_type: 'lead', entity_id: data.id,
    action: 'created', detail: { via: 'ingest', source: source.name }
  });
  await logPost('accepted', null, data.id, record.state);
  res.status(201).json({ status: 'created', id: data.id });
});

export default r;
