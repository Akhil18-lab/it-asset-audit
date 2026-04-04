import { useState, useEffect } from 'react';
import api from '../api';

export default function Reports() {
  const [data, setData] = useState(null);
  const [byDept, setByDept] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get('/reports/summary'), api.get('/reports/by-department')])
      .then(([s, d]) => { setData(s.data); setByDept(d.data); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-muted">Loading reports...</p>;

  const maxType = data.byType?.[0]?.cnt || 1;
  const maxStatus = Math.max(...(data.byStatus?.map(s => s.cnt) || [1]));
  const maxDept = byDept?.[0]?.cnt || 1;

  const statusColors = {
    active: 'var(--success)',
    inactive: 'var(--gray-400)',
    maintenance: 'var(--warning)',
    retired: 'var(--danger)',
  };

  function exportCSV() {
    const rows = [
      ['Report', 'IT Asset Summary'],
      ['Generated', new Date().toLocaleString()],
      [],
      ['Total Assets', data.totalAssets],
      ['Assigned', data.assigned],
      ['Unassigned', data.unassigned],
      ['Total Value', `$${Number(data.totalValue).toLocaleString()}`],
      ['Warranty Expiring (30d)', data.warrantyExpiring],
      [],
      ['Status', 'Count'],
      ...data.byStatus.map(s => [s.status, s.cnt]),
      [],
      ['Type', 'Count'],
      ...data.byType.map(t => [t.type, t.cnt]),
      [],
      ['Department', 'Assigned'],
      ...byDept.map(d => [d.department, d.cnt]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `it-asset-report-${Date.now()}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>Reports</h2>
          <p className="text-muted text-sm">Asset inventory analysis</p>
        </div>
        <button className="btn btn-secondary" onClick={exportCSV}>Export CSV</button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card primary">
          <div className="stat-label">Total Assets</div>
          <div className="stat-value">{data.totalAssets}</div>
        </div>
        <div className="stat-card success">
          <div className="stat-label">Assigned</div>
          <div className="stat-value">{data.assigned}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Unassigned</div>
          <div className="stat-value">{data.unassigned}</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-label">Warranty Expiring</div>
          <div className="stat-value">{data.warrantyExpiring}</div>
          <div className="stat-sub">Within 30 days</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Asset Value</div>
          <div className="stat-value" style={{ fontSize: 18 }}>
            ${Number(data.totalValue).toLocaleString()}
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-header"><h3>Assets by Status</h3></div>
          <div className="card-body">
            <div className="bar-chart">
              {data.byStatus.map(row => (
                <div key={row.status} className="bar-row">
                  <span className="bar-label" style={{ textTransform: 'capitalize' }}>{row.status}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${(row.cnt / maxStatus) * 100}%`, background: statusColors[row.status] || 'var(--primary)' }} />
                  </div>
                  <span className="bar-count">{row.cnt}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>Assets by Type</h3></div>
          <div className="card-body">
            <div className="bar-chart">
              {data.byType.map((row, i) => (
                <div key={row.type} className="bar-row">
                  <span className="bar-label">{row.type}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${(row.cnt / maxType) * 100}%`, background: `hsl(${220 + i * 25}, 70%, 55%)` }} />
                  </div>
                  <span className="bar-count">{row.cnt}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Assets by Department</h3></div>
        <div className="card-body">
          {byDept.length === 0
            ? <p className="text-muted">No department assignments yet</p>
            : <div className="bar-chart">
                {byDept.map((row, i) => (
                  <div key={row.department} className="bar-row">
                    <span className="bar-label">{row.department}</span>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${(row.cnt / maxDept) * 100}%`, background: `hsl(${140 + i * 30}, 60%, 45%)` }} />
                    </div>
                    <span className="bar-count">{row.cnt}</span>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>
    </div>
  );
}
