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

  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('idle');   // idle | connecting | in-call | ended
  const [lead, setLead] = useState(null);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [dispoFor, setDispoFor] = useState(null); // { call_id, lead } after a call ends

  const initDevice = useCallback(async () => {
    try {
      const { token } = await api('/voice/token');
      if (deviceRef.current) { deviceRef.current.updateToken(token); setReady(true); return deviceRef.current; }
      const device = new Device(token, { codecPreferences: ['opus', 'pcmu'], logLevel: 'error' });
      device.on('error', (e) => setError(e?.message || 'Phone error'));
      device.on('tokenWillExpire', async () => {
        try { const t = await api('/voice/token'); device.updateToken(t.token); } catch { /* ignore */ }
      });
      deviceRef.current = device;
      setReady(true);
      return device;
    } catch (e) {
      setError(e.message || 'Could not start the phone');
      return null;
    }
  }, []);

  useEffect(() => {
    initDevice();
    return () => { try { deviceRef.current?.destroy(); } catch { /* ignore */ } clearInterval(timerRef.current); };
  }, [initDevice]);

  const startTimer = () => { setSeconds(0); clearInterval(timerRef.current); timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000); };
  const stopTimer = () => clearInterval(timerRef.current);

  const startCall = useCallback(async (leadObj) => {
    setError('');
    if (status === 'connecting' || status === 'in-call') return;
    const device = deviceRef.current || await initDevice();
    if (!device) return;
    try {
      const res = await api('/calls/start', { method: 'POST', body: JSON.stringify({ lead_id: leadObj.id }) });
      setLead(leadObj);
      setStatus('connecting');
      setMuted(false);
      const call = await device.connect({ params: { To: res.to, callerId: res.caller_id || '', call_id: res.call_id } });
      callRef.current = call;
      call.on('accept', () => { setStatus('in-call'); startTimer(); });
      call.on('disconnect', () => {
        stopTimer(); setStatus('ended');
        setDispoFor({ call_id: res.call_id, lead: leadObj });
        setLead(null); callRef.current = null;
      });
      call.on('cancel', () => { stopTimer(); setStatus('idle'); setLead(null); callRef.current = null; });
      call.on('error', (e) => setError(e?.message || 'Call error'));
    } catch (e) {
      setStatus('idle'); setLead(null);
      setError(e.message || 'Could not place the call');
    }
  }, [status, initDevice]);

  const hangup = useCallback(() => { try { callRef.current?.disconnect(); } catch { /* ignore */ } }, []);
  const toggleMute = useCallback(() => {
    const c = callRef.current; if (!c) return;
    const m = !muted; c.mute(m); setMuted(m);
  }, [muted]);
  const closeDispo = useCallback(() => { setDispoFor(null); setStatus('idle'); setMuted(false); setSeconds(0); }, []);

  return (
    <Ctx.Provider value={{ ready, status, lead, leadLabel, muted, seconds, error, setError, startCall, hangup, toggleMute, dispoFor, closeDispo }}>
      {children}
    </Ctx.Provider>
  );
}
