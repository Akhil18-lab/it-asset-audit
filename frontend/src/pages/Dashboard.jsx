import { useState, useEffect } from 'react';
import api from '../api';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [byDept, setByDept] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get('/reports/summary'), api.get('/reports/by-department')])
      .then(([s, d]) => { setData(s.data); setByDept(d.data); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-muted">Loading dashboard...</p>;

  const maxType = data.byType?.[0]?.cnt || 1;
  const maxDept = byDept?.[0]?.cnt || 1;

  const statusMap = {};
  data.byStatus?.forEach(s => { statusMap[s.status] = s.cnt; });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>Dashboard</h2>
          <p className="text-muted text-sm">IT Asset Overview</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card primary">
          <div className="stat-label">Total Assets</div>
          <div className="stat-value">{data.totalAssets}</div>
        </div>
        <div className="stat-card success">
          <div className="stat-label">Active</div>
          <div className="stat-value">{statusMap.active || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Assigned</div>
          <div className="stat-value">{data.assigned}</div>
          <div className="stat-sub">{data.unassigned} unassigned</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-label">Maintenance</div>
          <div className="stat-value">{statusMap.maintenance || 0}</div>
        </div>
        <div className="stat-card danger">
          <div className="stat-label">Warranty Expiring</div>
          <div className="stat-value">{data.warrantyExpiring}</div>
          <div className="stat-sub">Within 30 days</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Value</div>
          <div className="stat-value" style={{ fontSize: 20 }}>
            ${Number(data.totalValue).toLocaleString(undefined, { minimumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header"><h3>Assets by Type</h3></div>
          <div className="card-body">
            {data.byType?.length === 0
              ? <p className="text-muted">No data</p>
              : <div className="bar-chart">
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
            }
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>Assigned by Department</h3></div>
          <div className="card-body">
            {byDept.length === 0
              ? <p className="text-muted">No assignments yet</p>
              : <div className="bar-chart">
                  {byDept.map(row => (
                    <div key={row.department} className="bar-row">
                      <span className="bar-label">{row.department}</span>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${(row.cnt / maxDept) * 100}%`, background: 'var(--success)' }} />
                      </div>
                      <span className="bar-count">{row.cnt}</span>
                    </div>
                  ))}
                </div>
            }
          </div>
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-header"><h3>Recent Activity</h3></div>
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
              {data.recentActivity?.length === 0
                ? <tr><td colSpan={4}><div className="empty"><p>No activity yet</p></div></td></tr>
                : data.recentActivity.map((row, i) => (
                  <tr key={i}>
                    <td><span className="badge badge-assigned">{row.action.replace(/_/g, ' ')}</span></td>
                    <td>{row.details}</td>
                    <td>{row.username || '—'}</td>
                    <td className="text-muted text-sm">{new Date(row.created_at).toLocaleString()}</td>
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
