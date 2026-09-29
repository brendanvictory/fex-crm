import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api } from '../api';

// Minimal CSV parser that handles quoted fields and commas inside quotes.
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const TEMPLATE =
  'first_name,last_name,phone,email,state,zip,dob,gender,tobacco,coverage_amount,beneficiary_name,beneficiary_relationship\n' +
  'Jane,Doe,555-201-3040,jane@example.com,TX,75001,1955-04-12,Female,no,10000,John Doe,Spouse\n';

export default function BulkUpload() {
  const navigate = useNavigate();
  const [sources, setSources] = useState([]);
  const [sourceId, setSourceId] = useState('');
  const [listName, setListName] = useState('');
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [listsRefresh, setListsRefresh] = useState(0);

  useEffect(() => { api('/config/sources').then(setSources).catch(() => {}); }, []);

  function onFile(e) {
    setErr(''); setResult(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const grid = parseCSV(String(reader.result));
        if (grid.length < 2) { setErr('CSV needs a header row and at least one data row.'); setRows([]); return; }
        const headers = grid[0].map((h) => h.trim());
        const parsed = grid.slice(1).map((r) => {
          const obj = {};
          headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim(); });
          return obj;
        });
        setRows(parsed);
      } catch { setErr('Could not parse that CSV.'); }
    };
    reader.readAsText(file);
  }

  async function upload() {
    setBusy(true); setErr(''); setResult(null);
    try {
      const res = await api('/leads/bulk', {
        method: 'POST',
        body: JSON.stringify({ rows, source_id: sourceId || null, list_name: listName || null })
      });
      setResult(res);
      setListsRefresh((n) => n + 1);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  const templateHref = 'data:text/csv;charset=utf-8,' + encodeURIComponent(TEMPLATE);

  return (
    <Layout>
      <div className="page-head">
        <h1>Bulk Upload Leads</h1>
        <button className="btn-ghost" onClick={() => navigate('/leads')}>← Back to Leads</button>
      </div>
      {err && <p className="error">{err}</p>}

      <div className="stack">
        <div className="card stack">
          <div className="callout">
            Upload a CSV with a header row. Recognized columns: first_name, last_name, phone, email,
            address1, city, state, zip, dob, age, gender, tobacco, coverage_amount, beneficiary_name,
            beneficiary_relationship. Duplicates (same phone/email) are skipped automatically.{' '}
            <a href={templateHref} download="coverwise-leads-template.csv">Download template</a>
          </div>

          <div className="form-grid">
            <div className="field">
              <label>List name (optional)</label>
              <input value={listName} onChange={(e) => setListName(e.target.value)} placeholder="e.g. TX Facebook — Sept" />
            </div>
            <div className="field">
              <label>Attribute to source (optional)</label>
              <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                <option value="">— None —</option>
                {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field full">
              <label>CSV file</label>
              <input type="file" accept=".csv,text/csv" onChange={onFile} />
            </div>
          </div>

          {rows.length > 0 && (
            <div className="row-actions">
              <span className="muted">{fileName} — {rows.length} rows ready</span>
              <button className="btn" onClick={upload} disabled={busy}>
                {busy ? 'Uploading…' : `Import ${rows.length} leads`}
              </button>
            </div>
          )}
        </div>

        {result && (
          <div className="card stack">
            <div className="section-title">Import result</div>
            <div>
              <span className="ok">{result.created} created</span> ·{' '}
              <span className="muted">{result.duplicates} duplicates skipped</span> ·{' '}
              {result.errors.length} errors (of {result.total})
            </div>
            {result.errors.length > 0 && (
              <ul className="timeline">
                {result.errors.slice(0, 20).map((e, i) => (
                  <li key={i}><span className="error">Row {e.row}:</span> {e.error}</li>
                ))}
              </ul>
            )}
            <div><button className="btn" onClick={() => navigate('/leads')}>View leads</button></div>
          </div>
        )}

        <ManageLists refresh={listsRefresh} />
      </div>
    </Layout>
  );
}

function ManageLists({ refresh }) {
  const [lists, setLists] = useState([]);
  const [err, setErr] = useState('');
  const [confirming, setConfirming] = useState(null); // { list, summary }
  const [confirmText, setConfirmText] = useState('');
  const [alsoDelete, setAlsoDelete] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() { try { setLists(await api('/config/lists')); } catch (e) { setErr(e.message); } }
  useEffect(() => { load(); }, [refresh]);

  async function openConfirm(list) {
    setErr(''); setMsg(''); setConfirmText(''); setAlsoDelete(true);
    try {
      const summary = await api(`/config/lists/${list.id}/summary`);
      setConfirming({ list, summary });
    } catch (e) { setErr(e.message); }
  }

  async function purge() {
    if (!confirming) return;
    setBusy(true); setErr('');
    try {
      const res = await api(`/config/lists/${confirming.list.id}/purge`, {
        method: 'POST', body: JSON.stringify({ protect_sold: true, delete_list: alsoDelete })
      });
      let m = `Removed ${res.deleted} lead${res.deleted === 1 ? '' : 's'} from “${confirming.list.name}”.`;
      if (res.skipped_sold) m += ` ${res.skipped_sold} with a recorded sale were kept.`;
      if (res.list_deleted) m += ' The list was deleted.';
      setMsg(m); setConfirming(null); load();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="card stack">
      <div className="section-title">Manage lists</div>
      <p className="muted" style={{ marginTop: 0 }}>Revert an upload by removing its leads. Leads with a recorded sale are always kept.</p>
      {err && <p className="error">{err}</p>}
      {msg && <p className="ok">{msg}</p>}

      {lists.length === 0 ? <p className="muted" style={{ marginBottom: 0 }}>No lists yet.</p> : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>List</th><th>Created</th><th>Leads</th><th></th></tr></thead>
            <tbody>
              {lists.map((l) => (
                <tr key={l.id}>
                  <td><strong>{l.name}</strong></td>
                  <td className="muted">{new Date(l.created_at).toLocaleDateString()}</td>
                  <td>{l.lead_count}</td>
                  <td><button className="btn-ghost btn-sm" onClick={() => openConfirm(l)} disabled={l.lead_count === 0}>Revert / delete leads</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirming && (
        <div className="modal-backdrop" onClick={() => setConfirming(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="section-title">Revert “{confirming.list.name}”</div>
            <p>
              This permanently deletes <strong>{confirming.summary.total - confirming.summary.sold}</strong> lead
              {confirming.summary.total - confirming.summary.sold === 1 ? '' : 's'} in this list.
            </p>
            <ul className="muted" style={{ marginTop: 0, fontSize: 14 }}>
              <li>{confirming.summary.total} total in the list</li>
              {confirming.summary.worked > 0 && <li>{confirming.summary.worked} have already been worked (called/dispositioned) — these will be deleted</li>}
              {confirming.summary.sold > 0 && <li><strong>{confirming.summary.sold} have a recorded sale — these will be kept</strong></li>}
            </ul>
            <p className="muted" style={{ fontSize: 14 }}>This can’t be undone. Type the list name to confirm:</p>
            <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={confirming.list.name} />
            <label className="checkbox-row" style={{ marginTop: 12 }}>
              <input type="checkbox" checked={alsoDelete} onChange={(e) => setAlsoDelete(e.target.checked)} />
              <span className="muted">Also delete the (now empty) list</span>
            </label>
            <div className="row-actions" style={{ marginTop: 16 }}>
              <button className="sp-hang" style={{ flex: 'none' }} disabled={busy || confirmText.trim() !== confirming.list.name} onClick={purge}>
                {busy ? 'Deleting…' : 'Delete leads'}
              </button>
              <button className="btn-ghost" onClick={() => setConfirming(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
