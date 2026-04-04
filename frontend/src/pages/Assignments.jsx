import { useState, useEffect } from 'react';
import api from '../api';

export default function Assignments() {
  const [assignments, setAssignments] = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ asset_id: '', assigned_to: '', department: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filterActive, setFilterActive] = useState('all');

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'admin';

  function load() {
    setLoading(true);
    Promise.all([api.get('/assignments'), api.get('/assets', { params: { status: 'active' } })])
      .then(([a, b]) => { setAssignments(a.data); setAssets(b.data); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const unassignedAssets = assets.filter(a => !a.current_assignee);

  async function handleAssign() {
    if (!form.asset_id || !form.assigned_to) { setError('Asset and assignee are required'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/assignments', form);
      setModal(false);
      setForm({ asset_id: '', assigned_to: '', department: '', notes: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to assign');
    } finally {
      setSaving(false);
    }
  }

  async function handleReturn(id, assetName, assignee) {
    if (!confirm(`Return "${assetName}" from ${assignee}?`)) return;
    await api.put(`/assignments/${id}/return`);
    load();
  }

  const filtered = filterActive === 'active'
    ? assignments.filter(a => !a.returned_at)
    : filterActive === 'returned'
      ? assignments.filter(a => a.returned_at)
      : assignments;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>Assignments</h2>
          <p className="text-muted text-sm">{assignments.filter(a => !a.returned_at).length} active assignments</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => { setForm({ asset_id: '', assigned_to: '', department: '', notes: '' }); setError(''); setModal(true); }}>
            + Assign Asset
          </button>
        )}
      </div>

      <div className="tabs">
        {[['all', 'All'], ['active', 'Active'], ['returned', 'Returned']].map(([val, label]) => (
          <button key={val} className={`tab-btn ${filterActive === val ? 'active' : ''}`} onClick={() => setFilterActive(val)}>
            {label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="table-wrap">
          {loading ? <p style={{ padding: 20 }} className="text-muted">Loading...</p>
          : filtered.length === 0
            ? <div className="empty"><div className="empty-icon">🔗</div><p>No assignments found</p></div>
            : <table>
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Assigned To</th>
                    <th>Department</th>
                    <th>Assigned By</th>
                    <th>Assigned At</th>
                    <th>Returned</th>
                    {isAdmin && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(a => (
                    <tr key={a.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{a.asset_name}</div>
                        <div className="text-sm text-muted">{a.asset_type} · {a.serial_number || 'No serial'}</div>
                      </td>
                      <td>{a.assigned_to}</td>
                      <td>{a.department || '—'}</td>
                      <td>{a.assigned_by_name}</td>
                      <td className="text-sm">{new Date(a.assigned_at).toLocaleDateString()}</td>
                      <td>
                        {a.returned_at
                          ? <span className="text-sm">{new Date(a.returned_at).toLocaleDateString()}</span>
                          : <span className="badge badge-assigned">Active</span>
                        }
                      </td>
                      {isAdmin && (
                        <td>
                          {!a.returned_at && (
                            <button className="btn btn-secondary btn-sm"
                              onClick={() => handleReturn(a.id, a.asset_name, a.assigned_to)}>
                              Return
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
          }
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>Assign Asset</h3>
              <button className="modal-close" onClick={() => setModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}
              <div className="form-grid">
                <div className="form-group full">
                  <label>Asset *</label>
                  <select value={form.asset_id} onChange={e => setForm({ ...form, asset_id: e.target.value })}>
                    <option value="">Select an asset...</option>
                    {unassignedAssets.map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({a.type}{a.serial_number ? ` · ${a.serial_number}` : ''})</option>
                    ))}
                  </select>
                  {unassignedAssets.length === 0 && <p className="text-sm text-muted" style={{ marginTop: 4 }}>No unassigned active assets available</p>}
                </div>
                <div className="form-group">
                  <label>Assign To *</label>
                  <input value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })} placeholder="Employee name" />
                </div>
                <div className="form-group">
                  <label>Department</label>
                  <input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} placeholder="e.g. Engineering, HR..." />
                </div>
                <div className="form-group full">
                  <label>Notes</label>
                  <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAssign} disabled={saving}>
                {saving ? 'Assigning...' : 'Assign Asset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
