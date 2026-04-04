import { useState, useEffect } from 'react';
import api from '../api';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', full_name: '', role: 'viewer' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

  function load() { api.get('/auth/users').then(r => setUsers(r.data)); }
  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!form.username || !form.password || !form.full_name) { setError('All fields required'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/auth/users', form);
      setModal(false);
      setForm({ username: '', password: '', full_name: '', role: 'viewer' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id, username) {
    if (!confirm(`Delete user "${username}"?`)) return;
    await api.delete(`/auth/users/${id}`);
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>Users</h2>
          <p className="text-muted text-sm">{users.length} user{users.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm({ username: '', password: '', full_name: '', role: 'viewer' }); setError(''); setModal(true); }}>
          + Add User
        </button>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Username</th><th>Role</th><th>Created</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 500 }}>{u.full_name}</td>
                  <td>@{u.username}</td>
                  <td><span className={`badge badge-${u.role}`}>{u.role}</span></td>
                  <td className="text-sm text-muted">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td>
                    {u.id !== currentUser.id && (
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u.id, u.username)}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>Add User</h3>
              <button className="modal-close" onClick={() => setModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}
              <div className="form-grid">
                <div className="form-group full">
                  <label>Full Name *</label>
                  <input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="John Doe" />
                </div>
                <div className="form-group">
                  <label>Username *</label>
                  <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="johndoe" />
                </div>
                <div className="form-group">
                  <label>Role</label>
                  <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                    <option value="viewer">Viewer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="form-group full">
                  <label>Password *</label>
                  <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Minimum 6 characters" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
                {saving ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
