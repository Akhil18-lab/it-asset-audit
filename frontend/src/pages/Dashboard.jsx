import { useState, useEffect } from 'react';
import api from '../api';

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
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      color: 'var(--text-muted)', padding: '40px 0',
      fontSize: 14, fontWeight: 500,
    }}>
      <span style={{
        display: 'inline-block', width: 16, height: 16,
        border: '2px solid var(--border-strong)',
        borderTopColor: 'var(--accent)',
        borderRadius: '50%',
        animation: 'spin .65s linear infinite',
      }} />
      Loading dashboard…
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

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{
          fontSize: 26, fontWeight: 800,
          color: 'var(--text-primary)', letterSpacing: '-.6px',
          marginBottom: 4,
        }}>
          {greet}, {firstName}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Here's what's happening with your assets today.
        </p>
      </div>

      {/* ── Stats ── */}
      <div className="stats-grid">
        <div className="stat-card primary">
          <div className="stat-label">Total Assets</div>
          <div className="stat-value">{data.totalAssets}</div>
          <div className="stat-sub">All tracked devices</div>
        </div>
        <div className="stat-card success">
          <div className="stat-label">Active</div>
          <div className="stat-value">{statusMap.active || 0}</div>
          <div className="stat-sub">In service</div>
        </div>
        <div className="stat-card cyan">
          <div className="stat-label">Assigned</div>
          <div className="stat-value">{data.assigned}</div>
          <div className="stat-sub">{data.unassigned} unassigned</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-label">Maintenance</div>
          <div className="stat-value">{statusMap.maintenance || 0}</div>
          <div className="stat-sub">Under repair</div>
        </div>
        <div className="stat-card danger">
          <div className="stat-label">Warranty Expiring</div>
          <div className="stat-value">{data.warrantyExpiring}</div>
          <div className="stat-sub">Within 30 days</div>
        </div>
        <div className="stat-card pink">
          <div className="stat-label">Portfolio Value</div>
          <div className="stat-value" style={{ fontSize: 20 }}>
            ${Number(data.totalValue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
          <div className="stat-sub">Total asset cost</div>
        </div>
      </div>

      {/* ── Charts ── */}
      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-header">
            <h3>Assets by Type</h3>
          </div>
          <div className="card-body">
            {!data.byType?.length
              ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No data yet</p>
              : (
                <div className="bar-chart">
                  {data.byType.map(row => (
                    <div key={row.type} className="bar-row">
                      <span className="bar-label">{row.type}</span>
                      <div className="bar-track">
                        <div className="bar-fill"
                          style={{ width: `${(row.cnt / maxType) * 100}%` }} />
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
              ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No assignments yet</p>
              : (
                <div className="bar-chart">
                  {byDept.map(row => (
                    <div key={row.department} className="bar-row">
                      <span className="bar-label">{row.department}</span>
                      <div className="bar-track">
                        <div className="bar-fill"
                          style={{ width: `${(row.cnt / maxDept) * 100}%`, background: 'var(--success)' }} />
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
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
            Latest events
          </span>
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
                    <td style={{ color: 'var(--text-secondary)' }}>{row.details || '—'}</td>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                      {row.username || '—'}
                    </td>
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
