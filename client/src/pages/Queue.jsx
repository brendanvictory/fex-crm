import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api } from '../api';
import { useDialer } from '../dialer/DialerContext.jsx';

const COLORS = ['#3b5bff', '#f59e0b', '#8b5cf6', '#ec4899', '#17ad72', '#06b6d4', '#e5484d', '#14b8a6'];
const name = (l) => l ? [l.first_name, l.last_name].filter(Boolean).join(' ') || l.phone || 'Lead' : 'Lead';
const tel = (p) => (p ? String(p).replace(/[^0-9+]/g, '') : '');

export default function Queue() {
  const navigate = useNavigate();
  const dialer = useDialer();
  const [statuses, setStatuses] = useState([]);
  const [q, setQ] = useState(null);
  const [drag, setDrag] = useState(null);        // { id, unclaimed }
  const [over, setOver] = useState(null);        // column key being hovered
  const [err, setErr] = useState('');

  async function load() {
    try {
      const [s, queue] = await Promise.all([api('/config/statuses'), api('/queue')]);
      setStatuses(s.filter((x) => x.is_active));
      setQ(queue);
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  const dueSet = useMemo(() => new Set((q?.due || []).map((c) => c.lead?.id).filter(Boolean)), [q]);

  // Build columns: Unclaimed first, then each active status.
  const columns = useMemo(() => {
    if (!q) return [];
    const statusCols = statuses.map((s, i) => ({
      key: s.id, title: s.name, color: COLORS[i % COLORS.length], status_id: s.id, cards: []
    }));
    const byId = Object.fromEntries(statusCols.map((c) => [c.status_id, c]));
    for (const l of q.leads) {
      const col = byId[l.status_id] || statusCols[0];
      if (col) col.cards.push({ ...l, unclaimed: false });
    }
    const unclaimed = {
      key: 'unclaimed', title: 'Unclaimed', color: '#000077', status_id: null,
      cards: (q.available || []).map((l) => ({ ...l, unclaimed: true }))
    };
    return [unclaimed, ...statusCols];
  }, [q, statuses]);

  async function drop(col) {
    setOver(null);
    if (!drag || col.status_id == null) { setDrag(null); return; } // can't drop back into Unclaimed
    const item = drag; setDrag(null);
    try {
      await api(`/leads/${item.id}/move`, { method: 'POST', body: JSON.stringify({ status_id: col.status_id, claim: item.unclaimed }) });
      load();
    } catch (e) { setErr(e.message); }
  }

  return (
    <Layout fluid>
      <div className="page-head">
        <h1>My Queue</h1>
        <button className="btn-ghost" onClick={load}>Refresh</button>
      </div>
      {err && <p className="error">{err}</p>}
      <p className="muted" style={{ marginTop: -8 }}>Drag a lead across stages to update its status. Drag from <strong>Unclaimed</strong> to claim it to yourself.</p>

      {!q ? <p className="muted">Loading…</p> : (
        <div className="kanban">
          {columns.map((col) => (
            <div key={col.key}
              className={'kanban-col' + (over === col.key ? ' dragover' : '')}
              onDragOver={(e) => { if (col.status_id != null) { e.preventDefault(); setOver(col.key); } }}
              onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
              onDrop={() => drop(col)}>
              <div className="kanban-head">
                <span className="kanban-title"><span className="kanban-dot" style={{ background: col.color }} />{col.title}</span>
                <span className="kanban-count">{col.cards.length}</span>
              </div>
              {col.cards.map((c) => (
                <div key={c.id} className="kanban-card" draggable
                  onDragStart={() => setDrag({ id: c.id, unclaimed: c.unclaimed })}
                  onDragEnd={() => { setDrag(null); setOver(null); }}
                  onClick={() => navigate(`/leads/${c.id}`)}>
                  <div className="kc-name">{name(c)}</div>
                  <div className="kc-meta">
                    {c.phone && (
                      <button className="call-btn btn-sm" style={{ padding: '3px 10px' }}
                        onClick={(e) => { e.stopPropagation(); dialer.startCall(c); }}>Call</button>
                    )}
                    {c.state && <span>{c.state}</span>}
                    {dueSet.has(c.id) && <span className="pill-due">Due</span>}
                    {c.unclaimed && <span className="pill-claim">Claim</span>}
                  </div>
                </div>
              ))}
              {col.cards.length === 0 && <div className="muted" style={{ padding: '4px 10px', fontSize: 12 }}>—</div>}
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
