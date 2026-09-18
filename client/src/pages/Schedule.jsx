import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api } from '../api';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

const dayKey = (d) => new Date(d).toLocaleDateString('en-CA'); // YYYY-MM-DD local
const timeStr = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const leadName = (l) => l ? [l.first_name, l.last_name].filter(Boolean).join(' ') || l.phone || 'Lead' : 'Lead';

export default function Schedule() {
  const navigate = useNavigate();
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [events, setEvents] = useState([]);
  const [agents, setAgents] = useState([]);
  const [agent, setAgent] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => { api('/config/agents').then(setAgents).catch(() => {}); }, []);

  useEffect(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59);
    const qs = new URLSearchParams({ from: first.toISOString(), to: last.toISOString() });
    if (agent) qs.set('agent', agent);
    api('/callbacks?' + qs.toString()).then(setEvents).catch((e) => setErr(e.message));
  }, [cursor, agent]);

  const byDay = useMemo(() => {
    const m = {};
    for (const e of events) (m[dayKey(e.scheduled_at)] ||= []).push(e);
    return m;
  }, [events]);

  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < first.getDay(); i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    return cells;
  }, [cursor]);

  const upcoming = useMemo(
    () => [...events].filter((e) => new Date(e.scheduled_at) >= new Date() && !e.completed).slice(0, 10),
    [events]
  );

  const todayKey = dayKey(new Date());
  const move = (n) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));

  return (
    <Layout>
      <div className="page-head">
        <h1>Schedule</h1>
        {agents.length > 0 && (
          <select value={agent} onChange={(e) => setAgent(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8 }}>
            <option value="">All agents</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.full_name || '(unnamed)'}</option>)}
          </select>
        )}
      </div>
      {err && <p className="error">{err}</p>}

      <div className="chart-grid">
        <div className="chart-card full">
          <div className="cal-head">
            <button className="btn-ghost btn-sm" onClick={() => move(-1)}>←</button>
            <h2>{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</h2>
            <button className="btn-ghost btn-sm" onClick={() => move(1)}>→</button>
            <button className="btn-ghost btn-sm" onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}>Today</button>
          </div>
          <div className="cal-grid" style={{ marginBottom: 6 }}>
            {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
          </div>
          <div className="cal-grid">
            {grid.map((d, i) => {
              if (!d) return <div key={i} className="cal-cell blank" />;
              const key = dayKey(d);
              const evs = byDay[key] || [];
              return (
                <div key={i} className={'cal-cell' + (key === todayKey ? ' today' : '')}>
                  <div className="cal-day-num">{d.getDate()}</div>
                  {evs.slice(0, 3).map((e) => (
                    <div key={e.id} className={'cal-ev' + (e.kind === 'appointment' ? ' appt' : '')}
                      title={`${timeStr(e.scheduled_at)} — ${leadName(e.lead)}`}
                      onClick={() => e.lead_id && navigate(`/leads/${e.lead_id}`)}>
                      {timeStr(e.scheduled_at)} {leadName(e.lead)}
                    </div>
                  ))}
                  {evs.length > 3 && <div className="cal-more">+{evs.length - 3} more</div>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="chart-card full">
          <h3>Upcoming</h3>
          {upcoming.length === 0 ? <p className="muted">Nothing scheduled.</p> : (
            <ul className="timeline">
              {upcoming.map((e) => (
                <li key={e.id} style={{ cursor: 'pointer' }} onClick={() => e.lead_id && navigate(`/leads/${e.lead_id}`)}>
                  <div>
                    <span className="badge">{e.kind === 'appointment' ? 'Appt' : 'Callback'}</span>{' '}
                    <strong>{leadName(e.lead)}</strong>{e.title ? ` — ${e.title}` : ''}
                  </div>
                  <div className="when">
                    {new Date(e.scheduled_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    {e.agent?.full_name ? ` · ${e.agent.full_name}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Layout>
  );
}
