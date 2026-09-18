import { Router } from 'express';
import twilio from 'twilio';
import { requireAuth } from '../auth.js';
import { supabaseAdmin } from '../supabase.js';

const r = Router();
const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;
const VoiceResponse = twilio.twiml.VoiceResponse;

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

// GET /api/voice/token — Twilio Voice access token for the logged-in agent.
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

// POST /api/voice/outbound — TwiML hit by Twilio when the browser dials out.
// PUBLIC (Twilio calls it). Bridges to the target number with recording.
r.post('/outbound', async (req, res) => {
  const { To, callerId, call_id, CallSid } = req.body;
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
    dial.number(to);
    if (call_id && CallSid) {
      await supabaseAdmin.from('calls').update({ twilio_sid: CallSid }).eq('id', call_id);
    }
  } else {
    vr.say('No destination number was provided.');
  }
  res.type('text/xml').send(vr.toString());
});

// POST /api/voice/dial-status — end of the dialed leg: capture duration.
r.post('/dial-status', async (req, res) => {
  const call_id = req.query.call_id;
  if (call_id) {
    const dur = req.body.DialCallDuration;
    await supabaseAdmin.from('calls').update({
      duration_seconds: dur ? parseInt(dur, 10) : null,
      ended_at: new Date().toISOString()
    }).eq('id', call_id);
  }
  res.type('text/xml').send('<Response/>');
});

// POST /api/voice/recording — recording finished: store the URL.
r.post('/recording', async (req, res) => {
  const call_id = req.query.call_id;
  const url = req.body.RecordingUrl;
  if (call_id && url) {
    await supabaseAdmin.from('calls').update({ recording_url: url + '.mp3' }).eq('id', call_id);
  }
  res.type('text/xml').send('<Response/>');
});

export default r;
