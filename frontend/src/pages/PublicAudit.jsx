import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import publicApi from '../publicApi';

const CONDITIONS = ['Good', 'Fair', 'Poor', 'Damaged'];

function CenterMsg({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#444', padding: 20, textAlign: 'center', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {children}
    </div>
  );
}

export default function PublicAudit() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedAsset, setSelectedAsset] = useState('');
  const [savingAsset, setSavingAsset] = useState(false);
  const [uploadingCat, setUploadingCat] = useState(null);
  const [condition, setCondition] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileInputs = useRef({});

  function load() {
    setLoading(true); setError('');
    publicApi.get(`/public-audit/${token}`)
      .then((r) => {
        setData(r.data);
        setCondition(r.data.condition_category || '');
        setNotes(r.data.notes || '');
      })
      .catch((err) => setError(err.response?.data?.error || 'This link is invalid or has expired.'))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);

  async function handleSelectAsset() {
    if (!selectedAsset) return;
    setSavingAsset(true);
    try {
      await publicApi.post(`/public-audit/${token}/asset`, { asset_id: Number(selectedAsset) });
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to select asset');
    } finally {
      setSavingAsset(false);
    }
  }

  async function handleUpload(category, file) {
    if (!file) return;
    setUploadingCat(category);
    const fd = new FormData();
    fd.append('photo', file);
    fd.append('category', category);
    try {
      await publicApi.post(`/public-audit/${token}/photos`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploadingCat(null);
    }
  }

  async function handleSubmit() {
    if (!condition) { alert('Please select a condition category'); return; }
    setSubmitting(true);
    try {
      await publicApi.post(`/public-audit/${token}/submit`, { condition_category: condition, notes });
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <CenterMsg>Loading…</CenterMsg>;
  if (error) return <CenterMsg>{error}</CenterMsg>;
  if (!data) return null;

  const allCategoriesDone = Object.keys(data.categories).every((c) => data.photos[c]);

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>IT Asset Physical Audit</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>Hi {data.person_name}, please upload photos of your assigned system.</p>

      {data.status === 'submitted' ? (
        <div style={{ padding: 20, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
          <strong>✓ Already submitted.</strong> Thank you — your audit has been recorded.
          {data.asset && <p style={{ marginTop: 8, fontSize: 14 }}>Asset: {data.asset.name}</p>}
          <p style={{ marginTop: 4, fontSize: 14 }}>Condition: {data.condition_category}</p>
        </div>
      ) : (
        <>
          {!data.asset ? (
            <div style={{ marginBottom: 24, padding: 16, border: '1px solid #e5e7eb', borderRadius: 8 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>Select your asset</label>
              <select value={selectedAsset} onChange={(e) => setSelectedAsset(e.target.value)} style={{ width: '100%', padding: 8, marginBottom: 8, borderRadius: 6, border: '1px solid #d1d5db' }}>
                <option value="">-- Choose your laptop/asset --</option>
                {data.assetOptions.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.type}{a.serial_number ? ` · ${a.serial_number}` : ''})</option>
                ))}
              </select>
              <button
                onClick={handleSelectAsset}
                disabled={!selectedAsset || savingAsset}
                style={{ padding: '8px 16px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', opacity: !selectedAsset || savingAsset ? 0.6 : 1 }}
              >
                {savingAsset ? 'Saving…' : 'Confirm Asset'}
              </button>
            </div>
          ) : (
            <div style={{ marginBottom: 24, padding: 16, background: '#f9fafb', borderRadius: 8, fontSize: 14 }}>
              <strong>Asset:</strong> {data.asset.name} ({data.asset.type}){data.asset.serial_number ? ` · SN: ${data.asset.serial_number}` : ''}
            </div>
          )}

          {data.asset && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
                {Object.entries(data.categories).map(([key, label]) => (
                  <div key={key} style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                    {data.photos[key]
                      ? <img src={data.photos[key].url} alt={label} style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block' }} />
                      : <div style={{ height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: 28 }}>📷</div>}
                    <div style={{ padding: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{label}</div>
                      <input
                        ref={(el) => { fileInputs.current[key] = el; }}
                        type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                        onChange={(e) => handleUpload(key, e.target.files[0])}
                      />
                      <button
                        onClick={() => fileInputs.current[key].click()}
                        disabled={uploadingCat === key}
                        style={{ width: '100%', padding: '6px 0', fontSize: 12, background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer' }}
                      >
                        {uploadingCat === key ? 'Uploading…' : data.photos[key] ? 'Replace' : 'Upload'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Condition Category *</label>
                <select value={condition} onChange={(e) => setCondition(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }}>
                  <option value="">-- Select condition --</option>
                  {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Notes (optional)</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }} placeholder="Any observations..." />
              </div>

              <button
                onClick={handleSubmit}
                disabled={!allCategoriesDone || !condition || submitting}
                style={{ width: '100%', padding: '12px 0', background: allCategoriesDone && condition ? '#4f46e5' : '#c7c7c7', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: allCategoriesDone && condition ? 'pointer' : 'not-allowed' }}
              >
                {submitting ? 'Submitting…' : 'Submit Audit'}
              </button>
              {!allCategoriesDone && <p style={{ fontSize: 12, color: '#999', marginTop: 8, textAlign: 'center' }}>Upload all 6 photos to enable submit.</p>}
            </>
          )}
        </>
      )}
    </div>
  );
}
