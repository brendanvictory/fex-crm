import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import { api } from '../api';

export default function Commissions() {
  const [carriers, setCarriers] = useState([]);
  const [users, setUsers] = useState([]);
  const [rates, setRates] = useState({}); // `${carrierId}:${userId}` -> pct
  const [newCarrier, setNewCarrier] = useState({ name: '', agency_pct: '' });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    try {
      const [c, u, r] = await Promise.all([api('/config/carriers'), api('/users'), api('/config/commission-rates')]);
      setCarriers(c); setUsers(u.filter((x) => ['agent', 'manager'].includes(x.role)));
      const map = {};
      r.forEach((row) => { map[`${row.carrier_id}:${row.user_id}`] = row.pct; });
      setRates(map);
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function addCarrier(e) {
    e.preventDefault(); setErr('');
    try { await api('/config/carriers', { method: 'POST', body: JSON.stringify({ name: newCarrier.name, agency_pct: Number(newCarrier.agency_pct) || 0 }) }); setNewCarrier({ name: '', agency_pct: '' }); load(); }
    catch (e) { setErr(e.message); }
  }
  async function saveCarrier(c, patch) {
    try { await api(`/config/carriers/${c.id}`, { method: 'PATCH', body: JSON.stringify(patch) }); load(); } catch (e) { setErr(e.message); }
  }
  async function delCarrier(id) { try { await api(`/config/carriers/${id}`, { method: 'DELETE' }); load(); } catch (e) { setErr(e.message); } }

  async function saveRate(carrierId, userId, pct) {
    setMsg('');
    try {
      await api('/config/commission-rates', { method: 'PUT', body: JSON.stringify({ carrier_id: carrierId, user_id: userId, pct: Number(pct) || 0 }) });
      setRates((m) => ({ ...m, [`${carrierId}:${userId}`]: Number(pct) || 0 }));
      setMsg('Saved.');
    } catch (e) { setErr(e.message); }
  }

  return (
    <Layout>
      <div className="page-head"><h1>Commissions</h1></div>
      {err && <p className="error">{err}</p>}
      {msg && <p className="ok">{msg}</p>}

      <div className="stack">
        <div className="card">
          <div className="section-title">Carriers &amp; agency comp</div>
          <p className="muted" style={{ marginTop: 0 }}>Agency % is your total street contract (of annual premium). Coverwise keeps whatever is left after the agent and manager cuts.</p>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Carrier</th><th>Agency % (street)</th><th></th></tr></thead>
              <tbody>
                {carriers.length === 0 ? <tr><td colSpan={3} className="muted">No carriers yet.</td></tr>
                  : carriers.map((c) => (
                    <tr key={c.id}>
                      <td><input defaultValue={c.name} onBlur={(e) => e.target.value !== c.name && saveCarrier(c, { name: e.target.value })} /></td>
                      <td><input type="number" step="0.01" style={{ width: 110 }} defaultValue={c.agency_pct} onBlur={(e) => Number(e.target.value) !== Number(c.agency_pct) && saveCarrier(c, { agency_pct: Number(e.target.value) })} /> %</td>
                      <td><button className="btn-ghost btn-sm" onClick={() => delCarrier(c.id)}>Delete</button></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <form className="filters" style={{ marginTop: 12 }} onSubmit={addCarrier}>
            <input placeholder="Carrier name" value={newCarrier.name} onChange={(e) => setNewCarrier({ ...newCarrier, name: e.target.value })} required />
            <input type="number" step="0.01" placeholder="Agency %" style={{ width: 120 }} value={newCarrier.agency_pct} onChange={(e) => setNewCarrier({ ...newCarrier, agency_pct: e.target.value })} />
            <button className="btn" type="submit">Add carrier</button>
          </form>
        </div>

        <div className="card">
          <div className="section-title">Comp levels by person &amp; carrier (% of annual premium)</div>
          <p className="muted" style={{ marginTop: 0 }}>Set each agent's cut and each manager's override per carrier. Changes save when you click out of a box.</p>
          {carriers.length === 0 ? <p className="muted">Add a carrier first.</p> : (
            <div className="table-wrap" style={{ overflowX: 'auto' }}>
              <table className="data">
                <thead>
                  <tr><th>Person</th><th>Role</th>{carriers.map((c) => <th key={c.id}>{c.name}</th>)}</tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.full_name || u.email}</td>
                      <td><span className="badge">{u.role}</span></td>
                      {carriers.map((c) => {
                        const key = `${c.id}:${u.id}`;
                        return (
                          <td key={c.id}>
                            <input type="number" step="0.01" style={{ width: 70 }} defaultValue={rates[key] ?? ''} placeholder="0"
                              onBlur={(e) => saveRate(c.id, u.id, e.target.value)} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
