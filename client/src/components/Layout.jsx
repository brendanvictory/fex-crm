import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useDialer } from '../dialer/DialerContext.jsx';

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/queue', label: 'My Queue' },
  { to: '/leads', label: 'Leads' },
  { to: '/schedule', label: 'Schedule' },
  { to: '/reports', label: 'Reports' },
  { to: '/sources', label: 'Sources' },
  { to: '/users', label: 'Users' },
  { to: '/settings', label: 'Settings' }
];

export default function Layout({ children }) {
  const loc = useLocation();
  const dialer = useDialer();
  const isActive = (to) =>
    to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(to);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-chip">
          <img src="/coverwise-logo.png" alt="Coverwise" />
        </div>
        <nav className="side-nav">
          <button className="side-link phone-link" onClick={() => dialer?.openPhone()}>Open Phone</button>
          {NAV.map((n) => (
            <Link key={n.to} to={n.to}
              className={'side-link' + (isActive(n.to) ? ' active' : '')}>
              {n.label}
            </Link>
          ))}
        </nav>
        <span className="spacer" />
        <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </aside>
      <div className="main">
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
