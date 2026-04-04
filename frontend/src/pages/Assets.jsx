import { useState, useEffect, useCallback } from 'react';
import api from '../api';

const TYPES = ['Desktop', 'Laptop', 'Monitor', 'Printer', 'Server', 'Network Equipment', 'Mobile Device', 'Tablet', 'Peripheral', 'Other'];
const STATUSES = ['active', 'inactive', 'maintenance', 'retired'];

const EMPTY_FORM = {
  name: '', type: 'Laptop', manufacturer: '', model: '', serial_number: '',
  status: 'active', location: '', ip_address: '', mac_address: '',
  purchased_at: '', warranty_expires: '', purchase_price: '', notes: ''
};

export default function Assets() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [modal, setModal] = useState(null); // null | 'add' | 'edit' | 'view'
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'admin';

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if (search) params.search = search;
    if (filterStatus) params.status = filterStatus;
    if (filterType) params.type = filterType;
    api.get('/assets', { params }).then(r => setAssets(r.data)).finally(() => setLoading(false));
  }, [search, filterStatus, filterType]);

  useEffect(() => { load(); }, [load]);

  function openAdd() { setForm(EMPTY_FORM); setError(''); setModal('add'); }

  async function openEdit(asset) {
    const { data } = await api.get(`/assets/${asset.id}`);
    setSelected(data);
    setForm({
      name: data.name || '', type: data.type || 'Laptop', manufacturer: data.manufacturer || '',
      model: data.model || '', serial_number: data.serial_number || '', status: data.status || 'active',
      location: data.location || '', ip_address: data.ip_address || '', mac_address: data.mac_address || '',
      purchased_at: data.purchased_at || '', warranty_expires: data.warranty_expires || '',
      purchase_price: data.purchase_price || '', notes: data.notes || ''
    });
    setError('');
    setModal('edit');
  }

  async function openView(asset) {
    const { data } = await api.get(`/assets/${asset.id}`);
    setSelected(data);
    setModal('view');
  }

  async function handleSave() {
    if (!form.name || !form.type) { setError('Name and type are required'); return; }
    setSaving(true); setError('');
    try {
      if (modal === 'add') {
        await api.post('/assets', form);
      } else {
        await api.put(`/assets/${selected.id}`, form);
      }
      setModal(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save asset');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete asset "${name}"? This cannot be undone.`)) return;
    await api.delete(`/assets/${id}`);
    load();
  }

  const statusClass = s => `badge badge-${s}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>Assets</h2>
          <p className="text-muted text-sm">{assets.length} asset{assets.length !== 1 ? 's' : ''} found</p>
        </div>
        {isAdmin && <button className="btn btn-primary" onClick={openAdd}>+ Add Asset</button>}
      </div>

      <div className="filter-bar">
        <input placeholder="Search name, serial, model..." value={search}
          onChange={e => setSearch(e.target.value)} style={{ flex: 1, maxWidth: 320 }} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="card">
        <div className="table-wrap">
          {loading ? <p style={{ padding: 20 }} className="text-muted">Loading...</p>
          : assets.length === 0
            ? <div className="empty"><div className="empty-icon">💻</div><p>No assets found</p></div>
            : <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Serial #</th>
                    <th>Status</th>
                    <th>Location</th>
                    <th>Assigned To</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map(a => (
                    <tr key={a.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{a.name}</div>
                        <div className="text-sm text-muted">{a.manufacturer} {a.model}</div>
                      </td>
                      <td>{a.type}</td>
                      <td className="text-sm">{a.serial_number || '—'}</td>
                      <td><span className={statusClass(a.status)}>{a.status}</span></td>
                      <td>{a.location || '—'}</td>
                      <td>
                        {a.current_assignee
                          ? <><span className="badge badge-assigned">{a.current_assignee}</span>
                              {a.current_department && <div className="text-sm text-muted">{a.current_department}</div>}
                            </>
                          : <span className="text-muted">—</span>
                        }
                      </td>
                      <td>
                        <div className="td-actions">
                          <button className="btn btn-secondary btn-sm" onClick={() => openView(a)}>View</button>
                          {isAdmin && <button className="btn btn-secondary btn-sm" onClick={() => openEdit(a)}>Edit</button>}
                          {isAdmin && <button className="btn btn-danger btn-sm" onClick={() => handleDelete(a.id, a.name)}>Delete</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          }
        </div>
      </div>

      {/* Add/Edit Modal */}
      {(modal === 'add' || modal === 'edit') && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <h3>{modal === 'add' ? 'Add New Asset' : 'Edit Asset'}</h3>
              <button className="modal-close" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}
              <div className="form-grid">
                <div className="form-group full">
                  <label>Asset Name *</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Dell Laptop #42" />
                </div>
                <div className="form-group">
                  <label>Type *</label>
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                    {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Manufacturer</label>
                  <input value={form.manufacturer} onChange={e => setForm({ ...form, manufacturer: e.target.value })} placeholder="Dell, HP, Apple..." />
                </div>
                <div className="form-group">
                  <label>Model</label>
                  <input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} placeholder="XPS 15, MacBook Pro..." />
                </div>
                <div className="form-group">
                  <label>Serial Number</label>
                  <input value={form.serial_number} onChange={e => setForm({ ...form, serial_number: e.target.value })} placeholder="Unique serial #" />
                </div>
                <div className="form-group">
                  <label>Location</label>
                  <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Office, Floor, Room..." />
                </div>
                <div className="form-group">
                  <label>IP Address</label>
                  <input value={form.ip_address} onChange={e => setForm({ ...form, ip_address: e.target.value })} placeholder="192.168.1.100" />
                </div>
                <div className="form-group">
                  <label>MAC Address</label>
                  <input value={form.mac_address} onChange={e => setForm({ ...form, mac_address: e.target.value })} placeholder="AA:BB:CC:DD:EE:FF" />
                </div>
                <div className="form-group">
                  <label>Purchase Date</label>
                  <input type="date" value={form.purchased_at} onChange={e => setForm({ ...form, purchased_at: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Warranty Expires</label>
                  <input type="date" value={form.warranty_expires} onChange={e => setForm({ ...form, warranty_expires: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Purchase Price ($)</label>
                  <input type="number" value={form.purchase_price} onChange={e => setForm({ ...form, purchase_price: e.target.value })} placeholder="0.00" min="0" step="0.01" />
                </div>
                <div className="form-group full">
                  <label>Notes</label>
                  <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes..." />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : modal === 'add' ? 'Add Asset' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {modal === 'view' && selected && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ maxWidth: 720 }}>
            <div className="modal-header">
              <h3>{selected.name}</h3>
              <button className="modal-close" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                {[
                  ['Type', selected.type], ['Status', selected.status],
                  ['Manufacturer', selected.manufacturer], ['Model', selected.model],
                  ['Serial #', selected.serial_number], ['Location', selected.location],
                  ['IP Address', selected.ip_address], ['MAC Address', selected.mac_address],
                  ['Purchased', selected.purchased_at], ['Warranty Expires', selected.warranty_expires],
                  ['Purchase Price', selected.purchase_price ? `$${Number(selected.purchase_price).toLocaleString()}` : null],
                ].map(([label, val]) => val ? (
                  <div key={label} className="form-group">
                    <label>{label}</label>
                    <p style={{ padding: '8px 0', fontSize: 13 }}>
                      {label === 'Status' ? <span className={`badge badge-${val}`}>{val}</span> : val}
                    </p>
                  </div>
                ) : null)}
                {selected.notes && (
                  <div className="form-group full">
                    <label>Notes</label>
                    <p style={{ padding: '8px 0', fontSize: 13 }}>{selected.notes}</p>
                  </div>
                )}
              </div>

              {selected.assignment_history?.length > 0 && (
                <div className="mt-4">
                  <h4 style={{ marginBottom: 10, fontWeight: 600 }}>Assignment History</h4>
                  <table>
                    <thead>
                      <tr><th>Assigned To</th><th>Department</th><th>Assigned By</th><th>From</th><th>Returned</th></tr>
                    </thead>
                    <tbody>
                      {selected.assignment_history.map(a => (
                        <tr key={a.id}>
                          <td>{a.assigned_to}</td>
                          <td>{a.department || '—'}</td>
                          <td>{a.assigned_by_name}</td>
                          <td className="text-sm">{new Date(a.assigned_at).toLocaleDateString()}</td>
                          <td className="text-sm">{a.returned_at ? new Date(a.returned_at).toLocaleDateString() : <span className="badge badge-assigned">Active</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="modal-footer">
              {isAdmin && <button className="btn btn-secondary" onClick={() => openEdit(selected)}>Edit</button>}
              <button className="btn btn-primary" onClick={() => setModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
