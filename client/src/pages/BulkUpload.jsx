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
      </div>
    </Layout>
  );
}
