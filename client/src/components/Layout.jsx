import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useDialer } from '../dialer/DialerContext.jsx';
import { api } from '../api';

const HOME = { to: '/', label: 'Dashboard' };
const GROUPS = [
  { key: 'calling', label: 'Calling', items: [
    { to: '/queue', label: 'My Queue' },
    { to: '/dialer', label: 'Power Dialer' },
    { to: '/voicemail', label: 'Voicemail', badge: 'vm' }
  ] },
  { key: 'leads', label: 'Leads & Sales', items: [
    { to: '/leads', label: 'Leads' },
    { to: '/schedule', label: 'Schedule' }
  ] },
  { key: 'insights', label: 'Insights', items: [
    { to: '/reports', label: 'Reports' }
  ] },
  { key: 'admin', label: 'Admin', items: [
    { to: '/sources', label: 'Sources' },
    { to: '/scripts', label: 'Scripts' },
    { to: '/users', label: 'Users' },
    { to: '/settings', label: 'Settings' }
  ] }
];

function loadOpen() {
  try { return JSON.parse(localStorage.getItem('cw_nav_open') || '{}'); } catch { return {}; }
}

export default function Layout({ children }) {
  const loc = useLocation();
  const dialer = useDialer();
  const [vmCount, setVmCount] = useState(0);
  const [open, setOpen] = useState(() => {
    const saved = loadOpen();
    // default: all groups open unless the user has collapsed them before
    const init = {};
    GROUPS.forEach((g) => { init[g.key] = g.key in saved ? saved[g.key] : true; });
    return init;
  });

  const isActive = (to) => (to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(to));

  useEffect(() => {
    api('/voicemails/unread-count').then((r) => setVmCount(r.count || 0)).catch(() => {});
  }, [loc.pathname]);

  // Auto-open whichever group holds the current route.
  useEffect(() => {
    const g = GROUPS.find((grp) => grp.items.some((i) => isActive(i.to)));
    if (g && !open[g.key]) setOpen((o) => ({ ...o, [g.key]: true }));
  }, [loc.pathname]); // eslint-disable-line

  function toggle(key) {
    setOpen((o) => {
      const next = { ...o, [key]: !o[key] };
      try { localStorage.setItem('cw_nav_open', JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  }

  const NavLink = ({ item }) => (
    <Link to={item.to} className={'side-link' + (isActive(item.to) ? ' active' : '')}>
      <span>{item.label}</span>
      {item.badge === 'vm' && vmCount > 0 && <span className="nav-badge">{vmCount}</span>}
    </Link>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-chip"><img src="/coverwise-logo.png" alt="Coverwise" /></div>

        <button className="side-link phone-link" onClick={() => dialer?.openPhone()}>Open Phone</button>

        <nav className="side-nav">
          <NavLink item={HOME} />
          {GROUPS.map((g) => (
            <div key={g.key} className="nav-group">
              <button className="nav-group-header" onClick={() => toggle(g.key)}>
                <span>{g.label}</span>
                <span className={'nav-chevron' + (open[g.key] ? ' open' : '')}>›</span>
              </button>
              {open[g.key] && <div className="nav-group-items">{g.items.map((i) => <NavLink key={i.to} item={i} />)}</div>}
            </div>
          ))}
        </nav>

        <span className="spacer" />
        <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </aside>
      <div className="main">
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
