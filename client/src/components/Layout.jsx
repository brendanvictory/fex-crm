import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/leads', label: 'Leads' }
];

export default function Layout({ children }) {
  const loc = useLocation();
  const isActive = (to) =>
    to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(to);

  return (
    <div>
      <header className="topbar">
        <div className="topbar-inner">
          <img src="/coverwise-logo.png" alt="Coverwise" className="brand-logo" />
          <nav className="nav">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to}
                className={'nav-link' + (isActive(n.to) ? ' active' : '')}>
                {n.label}
              </Link>
            ))}
          </nav>
          <span className="spacer" />
          <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}
