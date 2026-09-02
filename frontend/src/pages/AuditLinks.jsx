import { useState, useEffect } from 'react';
import api from '../api';

const CATEGORY_LABELS = {
  front_screen: 'Front (Screen On)',
  keyboard_trackpad: 'Keyboard & Trackpad',
  back_panel: 'Back Panel (Asset Tag Visible)',
  sides_ports: 'Left & Right Sides (Ports)',
  charger_cable: 'Charger & Cable',
  visible_damage: 'Visible Damage',
};

export default function AuditLinks() {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [namesText, setNamesText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [viewLink, setViewLink] = useState(null);
  const [viewPhotos, setViewPhotos] = useState([]);
  const [copiedToken, setCopiedToken] = useState('');

  function load() {
    setLoading(true);
    api.get('/audit-links').then((r) => setLinks(r.data)).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function handleGenerate() {
    const names = namesText.split('\n').map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) { setError('Enter at least one name'); return; }
    setGenerating(true); setError('');
    try {
      const { data } = await api.post('/audit-links/bulk', { names });
      setResult(data.created);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate links');
    } finally {
      setGenerating(false);
    }
  }

  function linkUrl(token) {
    return `${window.location.origin}/self-audit/${token}`;
  }

  function copyLink(token) {
    navigator.clipboard.writeText(linkUrl(token));
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(''), 1500);
  }

  async function openView(link) {
    setViewLink(link);
    const { data } = await api.get(`/audit-links/${link.id}/photos`);
    setViewPhotos(data);
  }

  async function handleDelete(id) {
    if (!confirm('Delete this link?')) return;
    await api.delete(`/audit-links/${id}`);
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>Employee Audit Links</h2>
          <p className="text-muted text-sm">Generate a no-login upload link per employee for physical asset checks</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setNamesText(''); setResult(null); setError(''); setModal(true); }}>
          + Generate Links
        </button>
      </div>

      <div className="card">
        <div className="table-wrap">
          {loading
            ? <p style={{ padding: 20 }} className="text-muted">Loading...</p>
            : links.length === 0
              ? <div className="empty"><div className="empty-icon">🔗</div><p>No links generated yet</p></div>
              : <table>
                  <thead>
                    <tr><th>Name</th><th>Asset</th><th>Status</th><th>Condition</th><th>Photos</th><th>Link</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {links.map((l) => (
                      <tr key={l.id}>
                        <td style={{ fontWeight: 500 }}>{l.person_name}</td>
                        <td className="text-sm">{l.asset_name || <span className="text-muted">Not selected yet</span>}</td>
                        <td><span className={`badge ${l.status === 'submitted' ? 'badge-active' : 'badge-inactive'}`}>{l.status}</span></td>
                        <td className="text-sm">{l.condition_category || '—'}</td>
                        <td className="text-sm">{l.photo_count}</td>
                        <td>
                          <button className="btn btn-secondary btn-sm" onClick={() => copyLink(l.token)}>
                            {copiedToken === l.token ? 'Copied!' : 'Copy Link'}
                          </button>
                        </td>
                        <td>
                          <div className="td-actions">
                            <button className="btn btn-secondary btn-sm" onClick={() => openView(l)}>View</button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(l.id)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
          }
        </div>
      </div>

      {/* Generate Modal */}
      {modal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3>Generate Employee Links</h3>
              <button className="modal-close" onClick={() => setModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}
              {!result ? (
                <div className="form-group full">
                  <label>Employee Names (one per line)</label>
                  <textarea rows={10} value={namesText} onChange={(e) => setNamesText(e.target.value)}
                    placeholder={'Abhishek Jadhav\nAkhil Sharma\nAman Kumar Pandey\n...'} />
                  <p className="text-sm text-muted" style={{ marginTop: 6 }}>
                    If a name matches someone with an active asset assignment, their asset is pre-filled automatically. Otherwise they'll pick it themselves when they open the link.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-muted" style={{ marginBottom: 10 }}>{result.length} link(s) generated. Copy and share each one.</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                    {result.map((r) => (
                      <div key={r.token} className="card" style={{ padding: 10 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{r.person_name}</div>
                        <div className="text-sm text-muted" style={{ marginBottom: 6 }}>
                          {r.matched_asset ? `Matched: ${r.matched_asset.name}` : 'No asset matched — employee will select their own'}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input readOnly value={linkUrl(r.token)} style={{ flex: 1, fontSize: 12 }} onFocus={(e) => e.target.select()} />
                          <button className="btn btn-secondary btn-sm" onClick={() => copyLink(r.token)}>
                            {copiedToken === r.token ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(false)}>{result ? 'Close' : 'Cancel'}</button>
              {!result && (
                <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
                  {generating ? 'Generating...' : 'Generate Links'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* View Photos Modal */}
      {viewLink && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setViewLink(null)}>
          <div className="modal" style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <h3>{viewLink.person_name} <span className="text-muted text-sm" style={{ fontWeight: 400 }}>— {viewLink.asset_name || 'No asset'}</span></h3>
              <button className="modal-close" onClick={() => setViewLink(null)}>×</button>
            </div>
            <div className="modal-body">
              <p className="text-sm text-muted" style={{ marginBottom: 10 }}>
                Status: <strong>{viewLink.status}</strong>
                {viewLink.condition_category && <> · Condition: <strong>{viewLink.condition_category}</strong></>}
              </p>
              {viewLink.notes && <p className="text-sm" style={{ marginBottom: 10 }}>Notes: {viewLink.notes}</p>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
                  const photo = viewPhotos.find((p) => p.category === key);
                  return (
                    <div key={key} style={{ border: '1px solid var(--gray-200)', borderRadius: 6, overflow: 'hidden' }}>
                      {photo
                        ? <img src={photo.url} alt={label} style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }} />
                        : <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-300)', fontSize: 12 }}>No photo</div>}
                      <div style={{ padding: '4px 6px', fontSize: 11, color: 'var(--gray-500)' }}>{label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setViewLink(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
