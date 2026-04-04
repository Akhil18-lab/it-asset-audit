import { useState, useEffect } from 'react';
import api from '../api';

const STAT_ICONS = {
  total:    { emoji: '📦', color: '#8b5cf6' },
  active:   { emoji: '✅', color: '#22c55e' },
  assigned: { emoji: '🔗', color: '#06b6d4' },
  maintenance: { emoji: '🔧', color: '#eab308' },
  warranty: { emoji: '⚠️', color: '#ef4444' },
  value:    { emoji: '💰', color: '#f43f5e' },
};

function StatCard({ label, value, sub, variant, iconEmoji }) {
  return (
    <div className={`stat-card ${variant}`}>
      <div className="stat-card-top">
        <span className="stat-label">{label}</span>
        <span className="stat-emoji">{iconEmoji}</span>
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData]       = useState(null);
  const [byDept, setByDept]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get('/reports/summary'), api.get('/reports/by-department')])
      .then(([s, d]) => { setData(s.data); setByDept(d.data); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="dash-loading">
      <div className="dash-spinner" />
      <span>Loading dashboard…</span>
    </div>
  );

  const maxType = data.byType?.[0]?.cnt || 1;
  const maxDept = byDept?.[0]?.cnt       || 1;
  const statusMap = {};
  data.byStatus?.forEach(s => { statusMap[s.status] = s.cnt; });

  const user  = JSON.parse(localStorage.getItem('user') || '{}');
  const hour  = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user.full_name?.split(' ')[0] || 'there';

  const fmtValue = (v) =>
    '$' + Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

  return (
    <div>
      {/* ── Page header ── */}
      <div className="dash-header">
        <div>
          <h2 className="dash-title">{greet}, {firstName} 👋</h2>
          <p className="dash-sub">Here's what's happening with your assets today.</p>
        </div>
        <div className="dash-date">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="stats-grid">
        <StatCard label="Total Assets"    value={data.totalAssets}           sub="All tracked devices"   variant="primary"  iconEmoji="📦" />
        <StatCard label="Active"          value={statusMap.active || 0}      sub="In service"            variant="success"  iconEmoji="✅" />
        <StatCard label="Assigned"        value={data.assigned}              sub={`${data.unassigned} unassigned`} variant="cyan" iconEmoji="🔗" />
        <StatCard label="Maintenance"     value={statusMap.maintenance || 0} sub="Under repair"          variant="warning"  iconEmoji="🔧" />
        <StatCard label="Warranty Expiring" value={data.warrantyExpiring}    sub="Within 30 days"        variant="danger"   iconEmoji="⚠️" />
        <StatCard label="Portfolio Value" value={fmtValue(data.totalValue)}  sub="Total asset cost"      variant="pink"     iconEmoji="💰" />
      </div>

      {/* ── Charts row ── */}
      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-header">
            <h3>Assets by Type</h3>
          </div>
          <div className="card-body">
            {!data.byType?.length
              ? <p className="text-muted" style={{ fontSize: 13 }}>No assets yet</p>
              : (
                <div className="bar-chart">
                  {data.byType.map(row => (
                    <div key={row.type} className="bar-row">
                      <span className="bar-label">{row.type}</span>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${(row.cnt / maxType) * 100}%` }} />
                      </div>
                      <span className="bar-count">{row.cnt}</span>
                    </div>
                  ))}
                </div>
              )
            }
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Assigned by Department</h3>
          </div>
          <div className="card-body">
            {!byDept.length
              ? <p className="text-muted" style={{ fontSize: 13 }}>No assignments yet</p>
              : (
                <div className="bar-chart">
                  {byDept.map(row => (
                    <div key={row.department} className="bar-row">
                      <span className="bar-label">{row.department}</span>
                      <div className="bar-track">
                        <div className="bar-fill" style={{
                          width: `${(row.cnt / maxDept) * 100}%`,
                          background: 'var(--success)',
                        }} />
                      </div>
                      <span className="bar-count">{row.cnt}</span>
                    </div>
                  ))}
                </div>
              )
            }
          </div>
        </div>
      </div>

      {/* ── Recent Activity ── */}
      <div className="card">
        <div className="card-header">
          <h3>Recent Activity</h3>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Last 10 events</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Details</th>
                <th>User</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {!data.recentActivity?.length
                ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="empty">
                        <div className="empty-icon">📋</div>
                        <p>No activity recorded yet</p>
                      </div>
                    </td>
                  </tr>
                )
                : data.recentActivity.map((row, i) => (
                  <tr key={i}>
                    <td>
                      <span className="badge badge-assigned">
                        {row.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>{row.details || '—'}</td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.username || '—'}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
