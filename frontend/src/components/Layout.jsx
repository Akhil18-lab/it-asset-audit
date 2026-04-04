import { Outlet, NavLink, useNavigate } from 'react-router-dom';

const NAV = [
  { to: '/',               icon: '▦',  label: 'Dashboard',      end: true },
  { to: '/assets',         icon: '⊞',  label: 'Assets' },
  { to: '/assignments',    icon: '⇄',  label: 'Assignments' },
  { to: '/reports',        icon: '↗',  label: 'Reports' },
  { to: '/physical-audit', icon: '✓',  label: 'Physical Audits' },
  { to: '/audit',          icon: '≡',  label: 'Audit Log' },
];

function initials(name = '') {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??';
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
          <div className="sidebar-logo-icon">🛡</div>
          <h1>AssetAudit</h1>
          <p>IT Management</p>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          {NAV.map(({ to, icon, label, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => isActive ? 'active' : ''}>
              <span className="nav-icon">{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
          {user.role === 'admin' && (
            <NavLink to="/users"
              className={({ isActive }) => isActive ? 'active' : ''}>
              <span className="nav-icon">⊕</span>
              <span>Users</span>
            </NavLink>
          )}
        </nav>

        {/* Footer / User */}
        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">{initials(user.full_name)}</div>
            <div className="user-info">
              <strong>{user.full_name}</strong>
              <span className={`badge ${user.role === 'admin' ? 'admin' : 'viewer'}`}>
                {user.role}
              </span>
            </div>
          </div>
          <button className="logout-btn" onClick={logout}>
            ↩ Sign out
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
