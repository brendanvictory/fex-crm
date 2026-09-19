import { Router } from 'express';
import twilio from 'twilio';
import { requireAuth } from '../auth.js';
import { supabaseAdmin } from '../supabase.js';
import { normalizePhone } from '../lib/leads.js';

const r = Router();
const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;
const VoiceResponse = twilio.twiml.VoiceResponse;

const DISCLOSURE = 'This call may be monitored or recorded for quality and compliance purposes.';

const publicBase = (req) =>
  process.env.PUBLIC_BASE_URL || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;

function toE164(raw) {
  if (!raw) return null;
  const d = String(raw).replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return d;
  const digits = d.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return digits ? '+' + digits : null;
}

// Find a lead in an org whose phone matches an inbound caller.
async function matchLead(orgId, fromNumber) {
  const norm = normalizePhone(fromNumber);
  if (!norm) return null;
  const { data } = await supabaseAdmin
    .from('leads').select('id, owner_id, phone')
    .eq('org_id', orgId).not('phone', 'is', null).ilike('phone', `%${norm.slice(-7)}%`).limit(25);
  return (data || []).find((l) => normalizePhone(l.phone) === norm) || null;
}

// GET /api/voice/token — Voice access token for the logged-in agent.
r.get('/token', requireAuth, (req, res) => {
  const { TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_TWIML_APP_SID } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_API_KEY_SID || !TWILIO_API_KEY_SECRET || !TWILIO_TWIML_APP_SID) {
    return res.status(500).json({ error: 'Twilio is not configured yet' });
  }
  const token = new AccessToken(TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, {
    identity: req.user.id, ttl: 3600
  });
  token.addGrant(new VoiceGrant({ outgoingApplicationSid: TWILIO_TWIML_APP_SID, incomingAllow: true }));
  res.json({ token: token.toJwt(), identity: req.user.id });
});

// POST /api/voice/outbound — TwiML for browser-initiated outbound calls.
r.post('/outbound', async (req, res) => {
  const { To, callerId, call_id, CallSid, mode, From } = req.body;
  const base = publicBase(req);

  // Special mode: the agent is recording their own voicemail greeting.
  if (mode === 'record_greeting') {
    const uid = String(From || '').replace('client:', '');
    const g = new VoiceResponse();
    g.say({ voice: 'Polly.Joanna' }, 'Record your voicemail greeting after the tone. Press pound when you are finished.');
    g.record({ maxLength: 60, finishOnKey: '#', playBeep: true, action: `${base}/api/voice/greeting-saved?user=${uid}` });
    g.hangup();
    return res.type('text/xml').send(g.toString());
  }

  const vr = new VoiceResponse();
  const to = toE164(To);
  if (to) {
    const base = publicBase(req);
    const dial = vr.dial({
      callerId: callerId || process.env.TWILIO_CALLER_ID,
      answerOnBridge: true,
      record: 'record-from-answer-dual',
      action: `${base}/api/voice/dial-status?call_id=${call_id || ''}`,
      recordingStatusCallback: `${base}/api/voice/recording?call_id=${call_id || ''}`,
      recordingStatusCallbackEvent: 'completed'
    });
    // The `url` runs on the called party's leg before bridge → plays the
    // recording disclosure to the lead.
    dial.number({ url: `${base}/api/voice/whisper` }, to);
    if (call_id && CallSid) await supabaseAdmin.from('calls').update({ twilio_sid: CallSid }).eq('id', call_id);
  } else {
    vr.say('No destination number was provided.');
  }
  res.type('text/xml').send(vr.toString());
});

// POST /api/voice/whisper — disclosure played to the called party before bridge.
r.post('/whisper', (req, res) => {
  const vr = new VoiceResponse();
  vr.say({ voice: 'Polly.Joanna' }, DISCLOSURE);
  res.type('text/xml').send(vr.toString());
});

// POST /api/voice/dial-status — end of dialed leg: capture duration.
r.post('/dial-status', async (req, res) => {
  const call_id = req.query.call_id;
  if (call_id) {
    const dur = req.body.DialCallDuration;
    await supabaseAdmin.from('calls').update({
      duration_seconds: dur ? parseInt(dur, 10) : null, ended_at: new Date().toISOString()
    }).eq('id', call_id);
  }
  res.type('text/xml').send('<Response/>');
});

// POST /api/voice/recording — recording finished: store URL on the call.
r.post('/recording', async (req, res) => {
  const call_id = req.query.call_id;
  const url = req.body.RecordingUrl;
  if (call_id && url) await supabaseAdmin.from('calls').update({ recording_url: url + '.mp3' }).eq('id', call_id);
  res.type('text/xml').send('<Response/>');
});

// POST /api/voice/inbound — a lead calls one of our numbers. Route to the
// assigned agent's browser; fall back to voicemail. (Set each Twilio number's
// Voice webhook to this URL.)
r.post('/inbound', async (req, res) => {
  const { From, To, CallSid } = req.body;
  const base = publicBase(req);
  const vr = new VoiceResponse();

  const { data: numRow } = await supabaseAdmin
    .from('phone_numbers').select('org_id').eq('number', toE164(To)).maybeSingle();
  if (!numRow) { vr.say('Sorry, this number is not in service.'); vr.hangup(); return res.type('text/xml').send(vr.toString()); }

  const lead = await matchLead(numRow.org_id, From);
  const ownerId = lead?.owner_id || null;

  const { data: call } = await supabaseAdmin.from('calls').insert({
    org_id: numRow.org_id, lead_id: lead?.id || null, agent_id: ownerId,
    direction: 'inbound', from_number: From, to_number: To, twilio_sid: CallSid, started_at: new Date().toISOString()
  }).select('id').single();

  const vmQs = `call_id=${call?.id || ''}&owner=${ownerId || ''}&lead=${lead?.id || ''}&org=${numRow.org_id}&from=${encodeURIComponent(From || '')}`;

  if (ownerId) {
    const dial = vr.dial({ timeout: 20, answerOnBridge: true, action: `${base}/api/voice/inbound-fallback?${vmQs}` });
    const client = dial.client();
    client.identity(ownerId);
    client.parameter({ name: 'call_id', value: call?.id || '' });
    client.parameter({ name: 'lead_id', value: lead?.id || '' });
    client.parameter({ name: 'inbound', value: '1' });
  } else {
    vr.say({ voice: 'Polly.Joanna' }, 'Thanks for calling Coverwise. Please leave a message after the tone.');
    vr.record({ maxLength: 120, playBeep: true, action: `${base}/api/voice/voicemail?${vmQs}`, recordingStatusCallback: `${base}/api/voice/voicemail?${vmQs}` });
    vr.hangup();
  }
  res.type('text/xml').send(vr.toString());
});

// POST /api/voice/inbound-fallback — agent didn't answer → voicemail, using
// the agent's own recorded greeting when they have one.
r.post('/inbound-fallback', async (req, res) => {
  const base = publicBase(req);
  const vr = new VoiceResponse();
  if (req.body.DialCallStatus === 'completed') { vr.hangup(); return res.type('text/xml').send(vr.toString()); }

  const owner = req.query.owner;
  let greeting = null;
  if (owner) {
    const { data: u } = await supabaseAdmin.from('users').select('voicemail_greeting_url').eq('id', owner).single();
    greeting = u?.voicemail_greeting_url || null;
  }
  const qs = new URLSearchParams(req.query).toString();
  if (greeting) vr.play(`${base}/api/voice/greeting/${owner}`);
  else vr.say({ voice: 'Polly.Joanna' }, 'The person you are calling is unavailable. Please leave a message after the tone.');
  vr.record({ maxLength: 120, playBeep: true, action: `${base}/api/voice/voicemail?${qs}` });
  vr.hangup();
  res.type('text/xml').send(vr.toString());
});

// POST /api/voice/greeting-saved — store the agent's recorded greeting.
r.post('/greeting-saved', async (req, res) => {
  const user = req.query.user;
  const url = req.body.RecordingUrl;
  if (user && url) await supabaseAdmin.from('users').update({ voicemail_greeting_url: url + '.mp3' }).eq('id', user);
  const vr = new VoiceResponse();
  vr.say({ voice: 'Polly.Joanna' }, 'Your greeting has been saved. Goodbye.');
  vr.hangup();
  res.type('text/xml').send(vr.toString());
});

// GET /api/voice/greeting/:userId — PUBLIC audio for <Play> (Twilio fetches it).
r.get('/greeting/:userId', async (req, res) => {
  const { data: u } = await supabaseAdmin.from('users').select('voicemail_greeting_url').eq('id', req.params.userId).single();
  if (!u?.voicemail_greeting_url) return res.status(404).end();
  const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const up = await fetch(u.voicemail_greeting_url, { headers: { Authorization: `Basic ${auth}` } });
  if (!up.ok) return res.status(502).end();
  res.setHeader('Content-Type', 'audio/mpeg');
  res.send(Buffer.from(await up.arrayBuffer()));
});

// GET /api/voice/my-greeting — does the current agent have a greeting?
r.get('/my-greeting', requireAuth, async (req, res) => {
  const { data: u } = await supabaseAdmin.from('users').select('voicemail_greeting_url').eq('id', req.user.id).single();
  res.json({ has: !!u?.voicemail_greeting_url });
});

// GET /api/voice/my-greeting/audio — stream the current agent's greeting.
r.get('/my-greeting/audio', requireAuth, async (req, res) => {
  const { data: u } = await supabaseAdmin.from('users').select('voicemail_greeting_url').eq('id', req.user.id).single();
  if (!u?.voicemail_greeting_url) return res.status(404).json({ error: 'no greeting' });
  const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const up = await fetch(u.voicemail_greeting_url, { headers: { Authorization: `Basic ${auth}` } });
  if (!up.ok) return res.status(502).json({ error: 'unavailable' });
  res.setHeader('Content-Type', 'audio/mpeg');
  res.send(Buffer.from(await up.arrayBuffer()));
});

// POST /api/voice/voicemail — store the recorded message.
r.post('/voicemail', async (req, res) => {
  const q = req.query;
  const url = req.body.RecordingUrl;
  const dur = req.body.RecordingDuration;
  if (url && q.org) {
    await supabaseAdmin.from('voicemails').insert({
      org_id: q.org, lead_id: q.lead || null, agent_id: q.owner || null, call_id: q.call_id || null,
      from_number: q.from ? decodeURIComponent(q.from) : null,
      recording_url: url + '.mp3', duration_seconds: dur ? parseInt(dur, 10) : null
    });
  }
  const vr = new VoiceResponse();
  vr.say({ voice: 'Polly.Joanna' }, 'Thank you. Goodbye.');
  vr.hangup();
  res.type('text/xml').send(vr.toString());
});

export default r;
