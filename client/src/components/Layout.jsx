import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/leads', label: 'Leads' },
  { to: '/sources', label: 'Sources' },
  { to: '/users', label: 'Users' }
];

export default function Layout({ children }) {
  const loc = useLocation();
  const isActive = (to) =>
    to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(to);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <img src="/coverwise-logo.png" alt="Coverwise" className="brand-logo" />
        <nav className="side-nav">
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
