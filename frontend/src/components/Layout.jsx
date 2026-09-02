import { Outlet, NavLink, useNavigate } from 'react-router-dom';

/* ── SVG icons ─────────────────────────────────────────── */
const Icon = ({ d, d2, type = 'path' }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
    {d2 && <path d={d2} />}
  </svg>
);

const ICONS = {
  dashboard:      { d: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', d2: 'M9 22V12h6v10' },
  assets:         { d: 'M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z', d2: 'M16 3H8a1 1 0 0 0-1 1v3h10V4a1 1 0 0 0-1-1z' },
  assignments:    { d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', d2: 'M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
  reports:        { d: 'M18 20V10M12 20V4M6 20v-6' },
  physicalAudit:  { d: 'M9 11l3 3L22 4', d2: 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
  auditLog:       { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', d2: 'M14 2v6h6M16 13H8M16 17H8M10 9H8' },
  users:          { d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', d2: 'M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
  auditLinks:     { d: 'M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07l-1.41 1.41', d2: 'M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.41-1.41' },
  logout:         { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', d2: 'M16 17l5-5-5-5M21 12H9' },
};

const NAV = [
  { to: '/',               iconKey: 'dashboard',     label: 'Dashboard',      end: true },
  { to: '/assets',         iconKey: 'assets',        label: 'Assets' },
  { to: '/assignments',    iconKey: 'assignments',   label: 'Assignments' },
  { to: '/reports',        iconKey: 'reports',       label: 'Reports' },
  { to: '/physical-audit', iconKey: 'physicalAudit', label: 'Physical Audits' },
  { to: '/audit',          iconKey: 'auditLog',      label: 'Audit Log' },
];

function initials(name = '') {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'U';
}

export default function Layout() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  }

  return (
    <div className="layout">
      <aside className="sidebar">

        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" stroke="#fff" strokeWidth="2" strokeLinejoin="round"/>
              <path d="M12 2v20M3 7l9 5 9-5" stroke="rgba(255,255,255,.6)" strokeWidth="1.5"/>
            </svg>
          </div>
          <div className="sidebar-logo-text">
            <span className="sidebar-logo-name">AssetAudit</span>
            <span className="sidebar-logo-sub">IT Management</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          <div className="sidebar-nav-label">Menu</div>
          {NAV.map(({ to, iconKey, label, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => isActive ? 'active' : ''}>
              <span className="nav-icon-wrap"><Icon {...ICONS[iconKey]} /></span>
              <span className="nav-label">{label}</span>
            </NavLink>
          ))}

          {user.role === 'admin' && (
            <>
              <div className="sidebar-nav-label" style={{ marginTop: 8 }}>Admin</div>
              <NavLink to="/users" className={({ isActive }) => isActive ? 'active' : ''}>
                <span className="nav-icon-wrap"><Icon {...ICONS.users} /></span>
                <span className="nav-label">Users</span>
              </NavLink>
              <NavLink to="/audit-links" className={({ isActive }) => isActive ? 'active' : ''}>
                <span className="nav-icon-wrap"><Icon {...ICONS.auditLinks} /></span>
                <span className="nav-label">Audit Links</span>
              </NavLink>
            </>
          )}
        </nav>

        {/* User footer */}
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{initials(user.full_name)}</div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{user.full_name}</span>
              <span className={`sidebar-role-badge ${user.role}`}>{user.role}</span>
            </div>
          </div>
          <button className="logout-btn" onClick={logout}>
            <Icon {...ICONS.logout} />
            Sign out
          </button>
        </div>

      </aside>

      <div className="main">
        <div className="page-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
