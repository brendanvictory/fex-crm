import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { Device } from '@twilio/voice-sdk';
import { api } from '../api';

const Ctx = createContext(null);
export const useDialer = () => useContext(Ctx);

const leadLabel = (l) => l ? [l.first_name, l.last_name].filter(Boolean).join(' ') || l.phone || 'Lead' : 'Lead';

export function DialerProvider({ children }) {
  const deviceRef = useRef(null);
  const callRef = useRef(null);
  const timerRef = useRef(null);
  const statusRef = useRef('idle');

  const [ready, setReady] = useState(false);
  const [status, setStatusState] = useState('idle');   // idle | connecting | in-call | ended
  const setStatus = (s) => { statusRef.current = s; setStatusState(s); };
  const [lead, setLead] = useState(null);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [dispoFor, setDispoFor] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [incoming, setIncoming] = useState(null);   // { call, from, lead, inbound_call_id, campaign }
  const [available, setAvailableState] = useState(false);
  const availableRef = useRef(false);
  const [qualifyLeadId, setQualifyLeadId] = useState(null);
  const [qualifyCallId, setQualifyCallId] = useState(null);
  const openQualify = useCallback((leadId, callId = null) => { setQualifyLeadId(leadId); setQualifyCallId(callId); }, []);
  const closeQualify = useCallback(() => { setQualifyLeadId(null); setQualifyCallId(null); }, []);

  const startTimer = () => { setSeconds(0); clearInterval(timerRef.current); timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000); };
  const stopTimer = () => clearInterval(timerRef.current);

  // Attach handlers to an active Call (outbound or accepted inbound).
  const wireCall = useCallback((call, meta) => {
    callRef.current = call;
    call.on('accept', () => { setStatus('in-call'); startTimer(); });
    const releaseBusy = () => { api('/presence/busy', { method: 'POST', body: JSON.stringify({ busy: false }) }).catch(() => {}); };
    call.on('disconnect', () => {
      stopTimer(); setLead(null); callRef.current = null; releaseBusy();
      if (meta.noDispo) { setStatus('idle'); }
      else { setStatus('ended'); setDispoFor({ call_id: meta.call_id, lead: meta.displayLead || null, origin: meta.origin || null }); }
    });
    call.on('cancel', () => { stopTimer(); setStatus('idle'); setLead(null); callRef.current = null; releaseBusy(); });
    call.on('error', (e) => setError(e?.message || 'Call error'));
  }, []);

  const handleIncoming = useCallback(async (call) => {
    if (statusRef.current === 'connecting' || statusRef.current === 'in-call') { try { call.reject(); } catch { /* */ } return; }
    const from = call.parameters?.From || call.customParameters?.get?.('From') || '';
    const inboundCallId = call.customParameters?.get?.('inbound_call_id') || null;
    const campaign = call.customParameters?.get?.('campaign') || null;
    setIncoming({ call, from, lead: null, inbound_call_id: inboundCallId, campaign });
    setPanelOpen(true);
    try { const { lead } = await api(`/calls/lookup?number=${encodeURIComponent(from)}`); if (lead) setIncoming((i) => (i ? { ...i, lead } : i)); } catch { /* */ }
    call.on('cancel', () => setIncoming(null));
    call.on('disconnect', () => setIncoming(null));
  }, []);

  // Fetch a fresh Twilio token and hand it to the live Device. Best-effort.
  const refreshToken = useCallback(async () => {
    try {
      const { token } = await api('/voice/token');
      if (deviceRef.current) deviceRef.current.updateToken(token);
      return token;
    } catch { return null; }
  }, []);

  const initDevice = useCallback(async () => {
    try {
      const { token } = await api('/voice/token');
      if (deviceRef.current) { deviceRef.current.updateToken(token); setReady(true); return deviceRef.current; }
      // tokenRefreshMs: fire tokenWillExpire 3 min early so a slow/throttled tab
      // still has time to renew before the token actually lapses.
      const device = new Device(token, { codecPreferences: ['opus', 'pcmu'], logLevel: 'error', tokenRefreshMs: 180000 });
      device.on('error', (e) => {
        const code = e?.code;
        // Expired/invalid token errors are recoverable — renew silently instead
        // of alarming the agent with a red toast.
        if ([20104, 20103, 31204, 31205].includes(code)) { refreshToken(); return; }
        // Idle signaling/connection drops (the websocket going stale after the
        // tab sits unused) recover on their own — re-register quietly, no toast.
        // Only suppress while idle; a connection error during a live call is real.
        if ([31005, 31009, 31000, 53000, 53001].includes(code) && statusRef.current === 'idle') {
          Promise.resolve(deviceRef.current?.register?.()).catch(() => {});
          return;
        }
        setError(e?.message || 'Phone error');
      });
      device.on('incoming', handleIncoming);
      device.on('tokenWillExpire', () => { refreshToken(); });
      deviceRef.current = device;
      try { await device.register(); } catch { /* incoming just won't work */ }
      setReady(true);
      return device;
    } catch (e) {
      setError(e.message || 'Could not start the phone');
      return null;
    }
  }, [handleIncoming, refreshToken]);

  useEffect(() => {
    initDevice();
    // Belt-and-suspenders: renew well inside the 1-hour TTL, and whenever the
    // tab regains focus (background tabs throttle timers and miss the event).
    const poll = setInterval(() => { refreshToken(); }, 25 * 60 * 1000);
    // Coming back to the tab: refresh the token and re-establish the signaling
    // connection if it went stale while idle, so the agent doesn't hit an error.
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      refreshToken();
      if (statusRef.current === 'idle') Promise.resolve(deviceRef.current?.register?.()).catch(() => {});
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVis);
      try { deviceRef.current?.destroy(); } catch { /* */ }
      clearInterval(timerRef.current);
    };
  }, [initDevice, refreshToken]);

  const connect = useCallback(async ({ lead_id, number, caller_id, displayLead, origin }) => {
    setError('');
    if (statusRef.current === 'connecting' || statusRef.current === 'in-call') return;
    const device = deviceRef.current || await initDevice();
    if (!device) return;
    await refreshToken(); // guarantee a live token for this call
    try {
      const body = lead_id ? { lead_id, caller_id, origin } : { number, caller_id, origin };
      const res = await api('/calls/start', { method: 'POST', body: JSON.stringify(body) });
      setLead(displayLead || null);
      setStatus('connecting');
      setMuted(false);
      setPanelOpen(true);
      // Mark on_call so inbound routing skips me while I'm on an outbound call.
      api('/presence/busy', { method: 'POST', body: JSON.stringify({ busy: true }) }).catch(() => {});
      const call = await device.connect({ params: { To: res.to, callerId: res.caller_id || '', call_id: res.call_id } });
      wireCall(call, { call_id: res.call_id, displayLead: displayLead || { phone: res.to }, origin });
    } catch (e) {
      setStatus('idle'); setLead(null);
      setError(e.message || 'Could not place the call');
    }
  }, [initDevice, wireCall, refreshToken]);

  const startCall = useCallback((leadObj, callerId, origin = 'lead') => connect({ lead_id: leadObj.id, caller_id: callerId, displayLead: leadObj, origin }), [connect]);
  const startManualCall = useCallback((number, callerId, origin = 'manual') => connect({ number, caller_id: callerId, displayLead: { phone: number }, origin }), [connect]);

  const acceptIncoming = useCallback(() => {
    const inc = incoming; if (!inc) return;
    const call = inc.call;
    const call_id = call.customParameters?.get?.('call_id') || null;
    const displayLead = inc.lead || { phone: inc.from };
    setLead(displayLead); setStatus('connecting'); setMuted(false); setIncoming(null); setPanelOpen(true);
    wireCall(call, { call_id, displayLead });
    try { call.accept(); } catch (e) { setError(e?.message || 'Could not accept'); }
    // Claim the inbound campaign call (first-wins); open the qualification screen.
    if (inc.inbound_call_id) {
      api(`/inbound/${inc.inbound_call_id}/answered`, { method: 'POST' })
        .then((r) => { if (r?.won && r.lead_id) { setQualifyLeadId(r.lead_id); setQualifyCallId(inc.inbound_call_id); } })
        .catch(() => {});
    }
  }, [incoming, wireCall]);

  // ---- Inbound presence (available to take campaign calls) ----
  const setAvailable = useCallback(async (on) => {
    setAvailableState(on); availableRef.current = on;
    try { await api('/presence', { method: 'POST', body: JSON.stringify({ status: on ? 'available' : 'away' }) }); }
    catch (e) { setError(e?.message || 'Could not update availability'); }
  }, []);

  useEffect(() => {
    api('/presence/me').then((p) => { const a = p?.inbound_status === 'available'; setAvailableState(a); availableRef.current = a; }).catch(() => {});
    // Heartbeat so routing knows we're really here; if the tab closes, the
    // server stops routing to us within ~90s (stale last_seen).
    const hb = setInterval(() => { if (availableRef.current) api('/presence/heartbeat', { method: 'POST' }).catch(() => {}); }, 30000);
    return () => clearInterval(hb);
  }, []);

  const rejectIncoming = useCallback(() => { try { incoming?.call.reject(); } catch { /* */ } setIncoming(null); }, [incoming]);

  const recordGreeting = useCallback(async () => {
    setError('');
    if (statusRef.current !== 'idle') return;
    const device = deviceRef.current || await initDevice();
    if (!device) return;
    try {
      setLead({ first_name: 'Recording greeting…' }); setStatus('connecting'); setMuted(false); setPanelOpen(true);
      const call = await device.connect({ params: { mode: 'record_greeting' } });
      wireCall(call, { call_id: null, displayLead: null, noDispo: true });
    } catch (e) { setStatus('idle'); setLead(null); setError(e.message || 'Could not start recording'); }
  }, [initDevice, wireCall]);

  const hangup = useCallback(() => { try { callRef.current?.disconnect(); } catch { /* */ } }, []);
  const toggleMute = useCallback(() => { const c = callRef.current; if (!c) return; const m = !muted; c.mute(m); setMuted(m); }, [muted]);
  const sendDigit = useCallback((d) => { try { callRef.current?.sendDigits(String(d)); } catch { /* */ } }, []);
  const openPhone = useCallback(() => setPanelOpen(true), []);
  const closePhone = useCallback(() => { if (statusRef.current === 'idle') setPanelOpen(false); }, []);
  const closeDispo = useCallback(() => { setDispoFor(null); setStatus('idle'); setMuted(false); setSeconds(0); }, []);

  // Redial the lead that just finished (from the disposition modal) without
  // advancing the queue. Goes ended -> connecting, so the dialer's auto-advance
  // (which fires only on 'idle') is skipped.
  const callAgain = useCallback(() => {
    const l = dispoFor?.lead;
    const origin = dispoFor?.origin || 'power_dialer';
    if (!l || !l.id) { setDispoFor(null); setStatus('idle'); setSeconds(0); return; }
    setDispoFor(null); setSeconds(0); setMuted(false);
    startCall(l, undefined, origin);
  }, [dispoFor, startCall]);

  return (
    <Ctx.Provider value={{
      ready, status, lead, leadLabel, muted, seconds, error, setError,
      startCall, startManualCall, hangup, toggleMute, sendDigit,
      dispoFor, closeDispo, callAgain, panelOpen, openPhone, closePhone,
      incoming, acceptIncoming, rejectIncoming, recordGreeting,
      available, setAvailable,
      qualifyLeadId, qualifyCallId, openQualify, closeQualify
    }}>
      {children}
    </Ctx.Provider>
  );
}
