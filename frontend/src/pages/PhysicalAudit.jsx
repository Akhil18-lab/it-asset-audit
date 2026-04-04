import { useState, useEffect, useRef } from 'react';
import api from '../api';

const TENURE_LABELS = { quarterly: 'Quarterly', 'half-yearly': 'Half-Yearly', annually: 'Annually' };

const STATUS_BADGE = {
  pending: 'badge-inactive',
  submitted: 'badge-assigned',
  approved: 'badge-active',
  rejected: 'badge-retired',
};

export default function PhysicalAudit() {
  const [view, setView] = useState('schedules'); // 'schedules' | 'items'
  const [schedules, setSchedules] = useState([]);
  const [activeSchedule, setActiveSchedule] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [itemModal, setItemModal] = useState(null); // the audit item being worked on
  const [reviewModal, setReviewModal] = useState(null);
  const [form, setForm] = useState({ title: '', tenure: 'quarterly', start_date: '', due_date: '', asset_ids: [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [submitNotes, setSubmitNotes] = useState('');
  const [reviewDecision, setReviewDecision] = useState('approved');
  const [reviewNotes, setReviewNotes] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const fileInputRef = useRef();

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'admin';

  function loadSchedules() {
    setLoading(true);
    api.get('/physical-audit/schedules').then(r => setSchedules(r.data)).finally(() => setLoading(false));
  }

  function openSchedule(schedule) {
    setActiveSchedule(schedule);
    setView('items');
    setLoading(true);
    api.get(`/physical-audit/schedules/${schedule.id}/items`)
      .then(r => setItems(r.data.items))
      .finally(() => setLoading(false));
  }

  function openItemModal(item) {
    setItemModal(item);
    setSubmitNotes('');
    setPhotos([]);
    api.get(`/physical-audit/items/${item.id}/photos`).then(r => setPhotos(r.data));
  }

  useEffect(() => { loadSchedules(); }, []);

  async function handleCreate() {
    if (!form.title || !form.start_date || !form.due_date) { setError('Title, start date and due date are required'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/physical-audit/schedules', form);
      setCreateModal(false);
      setForm({ title: '', tenure: 'quarterly', start_date: '', due_date: '', asset_ids: [] });
      loadSchedules();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create schedule');
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadPhotos(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    const fd = new FormData();
    files.forEach(f => fd.append('photos', f));
    try {
      await api.post(`/physical-audit/items/${itemModal.id}/photos`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const r = await api.get(`/physical-audit/items/${itemModal.id}/photos`);
      setPhotos(r.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
      fileInputRef.current.value = '';
    }
  }

  async function handleDeletePhoto(photoId) {
    await api.delete(`/physical-audit/photos/${photoId}`);
    setPhotos(p => p.filter(ph => ph.id !== photoId));
  }

  async function handleSubmit() {
    try {
      await api.post(`/physical-audit/items/${itemModal.id}/submit`, { notes: submitNotes });
      setItemModal(null);
      openSchedule(activeSchedule);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to submit');
    }
  }

  async function handleReview() {
    try {
      await api.post(`/physical-audit/items/${reviewModal.id}/review`, {
        decision: reviewDecision,
        review_notes: reviewNotes,
      });
      setReviewModal(null);
      setReviewNotes('');
      openSchedule(activeSchedule);
    } catch (err) {
      alert(err.response?.data?.error || 'Review failed');
    }
  }

  const filteredItems = filterStatus ? items.filter(i => i.status === filterStatus) : items;

  const pendingCount = items.filter(i => i.status === 'pending').length;
  const submittedCount = items.filter(i => i.status === 'submitted').length;
  const approvedCount = items.filter(i => i.status === 'approved').length;
  const rejectedCount = items.filter(i => i.status === 'rejected').length;

  // ── Schedules List View ──────────────────────────────────────────────────
  if (view === 'schedules') {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700 }}>Physical Audits</h2>
            <p className="text-muted text-sm">Schedule and track physical asset audits</p>
          </div>
          {isAdmin && (
            <button className="btn btn-primary" onClick={() => { setForm({ title: '', tenure: 'quarterly', start_date: '', due_date: '', asset_ids: [] }); setError(''); setCreateModal(true); }}>
              + New Audit Schedule
            </button>
          )}
        </div>

        {loading
          ? <p className="text-muted">Loading...</p>
          : schedules.length === 0
            ? <div className="empty"><div className="empty-icon">📅</div><p>No audit schedules yet</p></div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {schedules.map(s => {
                  const progress = s.total_items > 0 ? Math.round((s.approved_items / s.total_items) * 100) : 0;
                  const overdue = new Date(s.due_date) < new Date() && s.approved_items < s.total_items;
                  return (
                    <div key={s.id} className="card" style={{ cursor: 'pointer' }} onClick={() => openSchedule(s)}>
                      <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                        <div style={{ flex: 1 }}>
                          <div className="flex items-center gap-2">
                            <h3 style={{ fontSize: 15, fontWeight: 600 }}>{s.title}</h3>
                            <span className="badge badge-assigned">{TENURE_LABELS[s.tenure]}</span>
                            {overdue && <span className="badge badge-retired">Overdue</span>}
                          </div>
                          <div className="text-sm text-muted" style={{ marginTop: 4 }}>
                            {new Date(s.start_date).toLocaleDateString()} — {new Date(s.due_date).toLocaleDateString()} · Created by {s.created_by_name}
                          </div>
                          <div style={{ marginTop: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span className="text-sm text-muted">{s.approved_items} / {s.total_items} approved</span>
                              <span className="text-sm" style={{ fontWeight: 600 }}>{progress}%</span>
                            </div>
                            <div style={{ height: 6, background: 'var(--gray-100)', borderRadius: 999 }}>
                              <div style={{ height: 6, width: `${progress}%`, background: 'var(--success)', borderRadius: 999, transition: 'width .4s' }} />
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 16, textAlign: 'center', flexShrink: 0 }}>
                          {[['Pending', s.total_items - s.submitted_items - s.approved_items, 'var(--gray-400)'],
                            ['Submitted', s.submitted_items, 'var(--primary)'],
                            ['Approved', s.approved_items, 'var(--success)']].map(([label, count, color]) => (
                            <div key={label}>
                              <div style={{ fontSize: 20, fontWeight: 700, color }}>{count}</div>
                              <div className="text-sm text-muted">{label}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
        }

        {/* Create Schedule Modal */}
        {createModal && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setCreateModal(false)}>
            <div className="modal">
              <div className="modal-header">
                <h3>New Audit Schedule</h3>
                <button className="modal-close" onClick={() => setCreateModal(false)}>×</button>
              </div>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="form-grid">
                  <div className="form-group full">
                    <label>Audit Title *</label>
                    <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Q1 2025 Physical Audit" />
                  </div>
                  <div className="form-group">
                    <label>Tenure *</label>
                    <select value={form.tenure} onChange={e => setForm({ ...form, tenure: e.target.value })}>
                      <option value="quarterly">Quarterly</option>
                      <option value="half-yearly">Half-Yearly</option>
                      <option value="annually">Annually</option>
                    </select>
                  </div>
                  <div className="form-group" />
                  <div className="form-group">
                    <label>Start Date *</label>
                    <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Due Date *</label>
                    <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
                  </div>
                  <div className="form-group full">
                    <label>Assets</label>
                    <p className="text-sm text-muted" style={{ marginTop: 2 }}>Leave blank to include all active assets automatically.</p>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setCreateModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
                  {saving ? 'Creating...' : 'Create Schedule'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Schedule Items View ───────────────────────────────────────────────────
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <button className="btn btn-secondary btn-sm" onClick={() => { setView('schedules'); loadSchedules(); }} style={{ marginBottom: 8 }}>
            ← Back to Schedules
          </button>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>{activeSchedule?.title}</h2>
          <div className="text-sm text-muted">
            <span className="badge badge-assigned" style={{ marginRight: 6 }}>{TENURE_LABELS[activeSchedule?.tenure]}</span>
            Due: {activeSchedule && new Date(activeSchedule.due_date).toLocaleDateString()}
          </div>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
        {[['Pending', pendingCount, ''], ['Submitted', submittedCount, 'primary'], ['Approved', approvedCount, 'success'], ['Rejected', rejectedCount, 'danger']].map(([label, cnt, cls]) => (
          <div key={label} className={`stat-card ${cls}`}>
            <div className="stat-label">{label}</div>
            <div className="stat-value">{cnt}</div>
          </div>
        ))}
      </div>

      <div className="filter-bar">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="submitted">Submitted</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div className="card">
        <div className="table-wrap">
          {loading
            ? <p style={{ padding: 20 }} className="text-muted">Loading items...</p>
            : filteredItems.length === 0
              ? <div className="empty"><div className="empty-icon">📦</div><p>No items found</p></div>
              : <table>
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Location</th>
                      <th>Status</th>
                      <th>Photos</th>
                      <th>Submitted By</th>
                      <th>Reviewed By</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map(item => (
                      <tr key={item.id}>
                        <td>
                          <div style={{ fontWeight: 500 }}>{item.asset_name}</div>
                          <div className="text-sm text-muted">{item.asset_type} · {item.serial_number || 'No SN'}</div>
                        </td>
                        <td className="text-sm">{item.location || '—'}</td>
                        <td><span className={`badge ${STATUS_BADGE[item.status]}`}>{item.status}</span></td>
                        <td>
                          <span style={{ fontWeight: 600 }}>{item.photo_count}</span>
                          <span className="text-muted text-sm"> photo{item.photo_count !== 1 ? 's' : ''}</span>
                        </td>
                        <td className="text-sm">
                          {item.submitted_by_name
                            ? <>{item.submitted_by_name}<br /><span className="text-muted">{item.submitted_at ? new Date(item.submitted_at).toLocaleDateString() : ''}</span></>
                            : '—'}
                        </td>
                        <td className="text-sm">
                          {item.reviewed_by_name
                            ? <>{item.reviewed_by_name}<br />
                                <span className={`badge ${STATUS_BADGE[item.status]}`}>{item.status}</span>
                              </>
                            : '—'}
                        </td>
                        <td>
                          <div className="td-actions">
                            {item.status === 'pending' && (
                              <button className="btn btn-primary btn-sm" onClick={() => openItemModal(item)}>
                                Upload & Submit
                              </button>
                            )}
                            {item.status === 'submitted' && !isAdmin && (
                              <button className="btn btn-secondary btn-sm" onClick={() => openItemModal(item)}>
                                View Photos
                              </button>
                            )}
                            {item.status === 'submitted' && isAdmin && (
                              <>
                                <button className="btn btn-secondary btn-sm" onClick={() => openItemModal(item)}>
                                  View Photos
                                </button>
                                <button className="btn btn-success btn-sm" onClick={() => { setReviewModal(item); setReviewDecision('approved'); setReviewNotes(''); }}>
                                  Review
                                </button>
                              </>
                            )}
                            {(item.status === 'approved' || item.status === 'rejected') && (
                              <button className="btn btn-secondary btn-sm" onClick={() => openItemModal(item)}>
                                View
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
          }
        </div>
      </div>

      {/* Upload & Submit Modal */}
      {itemModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setItemModal(null)}>
          <div className="modal" style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <h3>
                {itemModal.status === 'pending' ? 'Upload Photos & Submit' : 'Audit Photos'}
                <span className="text-muted text-sm" style={{ marginLeft: 8, fontWeight: 400 }}>— {itemModal.asset_name}</span>
              </h3>
              <button className="modal-close" onClick={() => setItemModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 12 }}>
                <p className="text-sm text-muted">Asset: <strong>{itemModal.asset_name}</strong> · Type: {itemModal.asset_type} · SN: {itemModal.serial_number || 'N/A'} · Location: {itemModal.location || 'N/A'}</p>
              </div>

              {/* Photo grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
                {photos.map(ph => (
                  <div key={ph.id} style={{ position: 'relative', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--gray-200)' }}>
                    <img
                      src={`/api/physical-audit/uploads/${ph.filename}`}
                      alt={ph.original_name}
                      style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }}
                    />
                    <div style={{ padding: '4px 6px', fontSize: 11, color: 'var(--gray-500)', background: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ph.original_name}
                    </div>
                    {itemModal.status === 'pending' && (
                      <button
                        onClick={() => handleDeletePhoto(ph.id)}
                        style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(220,38,38,.85)', color: '#fff', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        ×
                      </button>
                    )}
                  </div>
                ))}
                {photos.length === 0 && (
                  <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '24px', color: 'var(--gray-300)', border: '2px dashed var(--gray-200)', borderRadius: 8 }}>
                    No photos uploaded yet
                  </div>
                )}
              </div>

              {itemModal.status === 'pending' && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleUploadPhotos} />
                    <button className="btn btn-secondary" onClick={() => fileInputRef.current.click()} disabled={uploading}>
                      {uploading ? 'Uploading...' : '+ Upload Photos'}
                    </button>
                    <span className="text-sm text-muted" style={{ marginLeft: 8 }}>JPEG, PNG, WEBP — up to 10MB each, max 10 files</span>
                  </div>
                  <div className="form-group">
                    <label>Notes (optional)</label>
                    <textarea value={submitNotes} onChange={e => setSubmitNotes(e.target.value)} placeholder="Any observations about this asset..." />
                  </div>
                </>
              )}

              {itemModal.status !== 'pending' && itemModal.notes && (
                <div className="form-group">
                  <label>Submitted Notes</label>
                  <p style={{ fontSize: 13 }}>{itemModal.notes}</p>
                </div>
              )}

              {(itemModal.status === 'approved' || itemModal.status === 'rejected') && itemModal.review_notes && (
                <div className="form-group mt-4">
                  <label>Review Notes</label>
                  <p style={{ fontSize: 13 }}>{itemModal.review_notes}</p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setItemModal(null)}>Close</button>
              {itemModal.status === 'pending' && (
                <button className="btn btn-primary" onClick={handleSubmit} disabled={photos.length === 0}>
                  Submit for Review
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {reviewModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setReviewModal(null)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>Review Audit — {reviewModal.asset_name}</h3>
              <button className="modal-close" onClick={() => setReviewModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
                Submitted by <strong>{reviewModal.submitted_by_name}</strong> on {reviewModal.submitted_at ? new Date(reviewModal.submitted_at).toLocaleDateString() : ''}
              </p>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Decision</label>
                <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                  {['approved', 'rejected'].map(d => (
                    <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 400 }}>
                      <input type="radio" name="decision" value={d} checked={reviewDecision === d} onChange={() => setReviewDecision(d)} />
                      <span className={`badge ${d === 'approved' ? 'badge-active' : 'badge-retired'}`} style={{ textTransform: 'capitalize' }}>{d}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label>Review Notes (optional)</label>
                <textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} placeholder="Reason for approval or rejection..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setReviewModal(null)}>Cancel</button>
              <button className={`btn ${reviewDecision === 'approved' ? 'btn-success' : 'btn-danger'}`} onClick={handleReview}>
                {reviewDecision === 'approved' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
