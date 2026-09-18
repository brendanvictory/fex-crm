import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { normalizeRecord, prepareLead } from '../lib/leads.js';

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

  const { record, duplicate } = await prepareLead(supabaseAdmin, source, input, source.org_id);
  if (duplicate) return res.json({ status: 'duplicate', id: duplicate });

  const { data, error } = await supabaseAdmin.from('leads').insert(record).select('id').single();
  if (error) return res.status(400).json({ error: error.message });

  await supabaseAdmin.from('activity_log').insert({
    org_id: source.org_id, entity_type: 'lead', entity_id: data.id,
    action: 'created', detail: { via: 'ingest', source: source.name }
  });
  res.status(201).json({ status: 'created', id: data.id });
});

export default r;
