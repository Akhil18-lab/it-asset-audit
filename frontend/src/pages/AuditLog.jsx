import { useState, useEffect } from 'react';
import api from '../api';

const ACTION_COLORS = {
  LOGIN: 'badge-assigned',
  CREATE_ASSET: 'badge-active',
  UPDATE_ASSET: 'badge-maintenance',
  DELETE_ASSET: 'badge-retired',
  ASSIGN_ASSET: 'badge-active',
  RETURN_ASSET: 'badge-inactive',
  CREATE_USER: 'badge-active',
  DELETE_USER: 'badge-retired',
};

export default function AuditLog() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('');
  const [filterEntity, setFilterEntity] = useState('');
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  function load(off = 0) {
    setLoading(true);
    const params = { limit: LIMIT, offset: off };
    if (filterAction) params.action = filterAction;
    if (filterEntity) params.entity_type = filterEntity;
    api.get('/audit', { params }).then(r => {
      setRows(r.data.rows);
      setTotal(r.data.total);
      setOffset(off);
    }).finally(() => setLoading(false));
  }

  useEffect(() => { load(0); }, [filterAction, filterEntity]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>Audit Log</h2>
          <p className="text-muted text-sm">{total} total events</p>
        </div>
      </div>

      <div className="filter-bar">
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)}>
          <option value="">All Actions</option>
          {Object.keys(ACTION_COLORS).map(a => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={filterEntity} onChange={e => setFilterEntity(e.target.value)}>
          <option value="">All Entities</option>
          {['asset', 'assignment', 'auth', 'user'].map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      <div className="card">
        <div className="table-wrap">
          {loading ? <p style={{ padding: 20 }} className="text-muted">Loading...</p>
          : rows.length === 0
            ? <div className="empty"><div className="empty-icon">📋</div><p>No audit events found</p></div>
            : <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Action</th>
                    <th>Details</th>
                    <th>User</th>
                    <th>Entity</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.id}>
                      <td className="text-sm text-muted" style={{ whiteSpace: 'nowrap' }}>
                        {new Date(row.created_at).toLocaleString()}
                      </td>
                      <td>
                        <span className={`badge ${ACTION_COLORS[row.action] || 'badge-inactive'}`}>
                          {row.action.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>{row.details || '—'}</td>
                      <td>{row.username || <span className="text-muted">system</span>}</td>
                      <td className="text-sm text-muted">{row.entity_type}{row.entity_id ? ` #${row.entity_id}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
          }
        </div>
        {total > LIMIT && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--gray-100)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-secondary btn-sm" disabled={offset === 0} onClick={() => load(offset - LIMIT)}>Previous</button>
            <span className="text-sm text-muted">{offset + 1}–{Math.min(offset + LIMIT, total)} of {total}</span>
            <button className="btn btn-secondary btn-sm" disabled={offset + LIMIT >= total} onClick={() => load(offset + LIMIT)}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
