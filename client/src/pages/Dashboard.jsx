import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api } from '../api';

export default function Dashboard() {
  const [me, setMe] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/me').then(setMe).catch((e) => setErr(e.message));
  }, []);

  return (
    <Layout>
      <div className="page-head">
        <h1>Dashboard</h1>
      </div>
      {err && <p className="error">{err}</p>}
      <div className="card stack">
        {me ? (
          <>
            <div>Signed in as <strong>{me.auth.email}</strong></div>
            <div>Role: <span className="badge">{me.profile?.role ?? '—'}</span></div>
          </>
        ) : (!err && <div className="muted">Loading…</div>)}
        <div>
          <Link to="/leads" className="btn">Go to Leads</Link>
        </div>
      </div>
    </Layout>
  );
}
