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
    admin: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V10a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
    queue: <><path d="M3 6l1.5 1.5L7 5" /><path d="M3 12l1.5 1.5L7 11" /><path d="M3 18l1.5 1.5L7 17" /><line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" /></>,
    dialer: <><circle cx="6" cy="6" r="1" /><circle cx="12" cy="6" r="1" /><circle cx="18" cy="6" r="1" /><circle cx="6" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="18" cy="12" r="1" /><circle cx="6" cy="18" r="1" /><circle cx="12" cy="18" r="1" /><circle cx="18" cy="18" r="1" /></>,
    voicemail: <><circle cx="6" cy="12" r="4" /><circle cx="18" cy="12" r="4" /><line x1="6" y1="16" x2="18" y2="16" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M5 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1" /></>,
    policies: <><path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z" /><path d="M9 12l2 2 4-4" /></>,
    schedule: <><rect x="3" y="4" width="18" height="17" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="16" y1="2" x2="16" y2="6" /></>,
    revenue: <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
    flag: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></>,
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
    inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.5 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.5A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.5z" /></>,
    share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.6" y1="10.5" x2="15.4" y2="6.5" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="14" y2="17" /></>,
    percent: <><line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></>
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
    { to: '/queue', label: 'My Queue', icon: 'queue' },
    { to: '/dialer', label: 'Power Dialer', icon: 'dialer' },
    { to: '/voicemail', label: 'Voicemail', icon: 'voicemail', badge: 'vm' }
  ] },
  { key: 'leads', label: 'Leads & Sales', icon: 'leads', items: [
    { to: '/leads', label: 'Leads', icon: 'user' },
    { to: '/policies', label: 'Policies', icon: 'policies' },
    { to: '/schedule', label: 'Schedule', icon: 'schedule' }
  ] },
  { key: 'insights', label: 'Insights', icon: 'insights', items: [
    { to: '/reports', label: 'Reports', icon: 'insights' },
    { to: '/revenue', label: 'Revenue', icon: 'revenue' }
  ] },
  { key: 'support', label: 'Support', icon: 'support', items: [
    { to: '/getting-started', label: 'Getting Started', icon: 'flag' },
    { to: '/help', label: 'Knowledge Base', icon: 'book' }
  ] },
  { key: 'admin', label: 'Admin', icon: 'admin', items: [
    { to: '/sources', label: 'Sources', icon: 'inbox' },
    { to: '/partners', label: 'Partners', icon: 'share' },
    { to: '/scripts', label: 'Scripts', icon: 'file' },
    { to: '/commissions', label: 'Commissions', icon: 'percent' },
    { to: '/users', label: 'Users', icon: 'leads' },
    { to: '/settings', label: 'Settings', icon: 'admin' }
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
