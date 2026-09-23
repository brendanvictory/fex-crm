import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useDialer } from '../dialer/DialerContext.jsx';
import { api } from '../api';

// Minimal inline icons (stroke = currentColor) so the sidebar is self-contained.
function Icon({ name }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>,
    calling: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.2-1.1a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z" />,
    leads: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.9" /><path d="M16 3.1a4 4 0 0 1 0 7.8" /></>,
    insights: <><line x1="3" y1="21" x2="21" y2="21" /><rect x="6" y="11" width="3" height="7" /><rect x="11" y="7" width="3" height="11" /><rect x="16" y="13" width="3" height="5" /></>,
    support: <><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12" y2="17" /></>,
    admin: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V10a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>
  };
  return (
    <svg className="nav-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || null}
    </svg>
  );
}

const HOME = { to: '/', label: 'Dashboard', icon: 'dashboard' };
const GROUPS = [
  { key: 'calling', label: 'Calling', icon: 'calling', items: [
    { to: '/queue', label: 'My Queue' },
    { to: '/dialer', label: 'Power Dialer' },
    { to: '/voicemail', label: 'Voicemail', badge: 'vm' }
  ] },
  { key: 'leads', label: 'Leads & Sales', icon: 'leads', items: [
    { to: '/leads', label: 'Leads' },
    { to: '/policies', label: 'Policies' },
    { to: '/schedule', label: 'Schedule' }
  ] },
  { key: 'insights', label: 'Insights', icon: 'insights', items: [
    { to: '/reports', label: 'Reports' },
    { to: '/revenue', label: 'Revenue' }
  ] },
  { key: 'support', label: 'Support', icon: 'support', items: [
    { to: '/getting-started', label: 'Getting Started' },
    { to: '/help', label: 'Knowledge Base' }
  ] },
  { key: 'admin', label: 'Admin', icon: 'admin', items: [
    { to: '/sources', label: 'Sources' },
    { to: '/partners', label: 'Partners' },
    { to: '/scripts', label: 'Scripts' },
    { to: '/commissions', label: 'Commissions' },
    { to: '/users', label: 'Users' },
    { to: '/settings', label: 'Settings' }
  ] }
];

function loadOpen() {
  try { return JSON.parse(localStorage.getItem('cw_nav_open') || '{}'); } catch { return {}; }
}

export default function Layout({ children, fluid }) {
  const loc = useLocation();
  const dialer = useDialer();
  const [vmCount, setVmCount] = useState(0);
  const [open, setOpen] = useState(() => {
    const saved = loadOpen();
    // default: groups collapsed on sign-in; the active group auto-opens below.
    const init = {};
    GROUPS.forEach((g) => { init[g.key] = g.key in saved ? saved[g.key] : false; });
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
      <span className="side-link-label">{item.icon && <Icon name={item.icon} />}{item.label}</span>
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
                <span className="nav-group-title"><Icon name={g.icon} />{g.label}</span>
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
        <main className={'content' + (fluid ? ' content-fluid' : '')}>{children}</main>
      </div>
    </div>
  );
}
