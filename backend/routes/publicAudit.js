const express = require('express');
const multer = require('multer');
const db = require('../db');
const asyncHandler = require('../middleware/asyncHandler');
const { getSupabase, BUCKET } = require('../lib/supabase');

const router = express.Router();

// No `authenticate` middleware anywhere in this file — these routes are
// deliberately public. Access is controlled by knowledge of the random
// per-employee token instead of a login, so an employee can open the link
// their admin shared with them and upload photos directly.

const CATEGORY_LABELS = {
  front_screen: 'Front (Screen On)',
  keyboard_trackpad: 'Keyboard & Trackpad',
  back_panel: 'Back Panel (Asset Tag Visible)',
  sides_ports: 'Left & Right Sides (Ports)',
  charger_cable: 'Charger & Cable',
  visible_damage: 'Visible Damage',
};
const CATEGORIES = Object.keys(CATEGORY_LABELS);
const CONDITIONS = ['Good', 'Fair', 'Poor', 'Damaged'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

async function loadLink(token) {
  return db.prepare('SELECT * FROM audit_links WHERE token = ?').get(token);
}

// GET /api/public-audit/:token
router.get('/:token', asyncHandler(async (req, res) => {
  const link = await loadLink(req.params.token);
  if (!link) return res.status(404).json({ error: 'Invalid or expired link' });

  let asset = null;
  if (link.asset_id) {
    asset = await db.prepare('SELECT id, name, type, serial_number, location FROM assets WHERE id = ?').get(link.asset_id);
  }

  let assetOptions = [];
  if (!link.asset_id) {
    assetOptions = await db.prepare(`SELECT id, name, type, serial_number FROM assets WHERE status = 'active' ORDER BY name`).all();
  }

  const photoRows = await db.prepare('SELECT * FROM audit_link_photos WHERE audit_link_id = ?').all(link.id);
  const sb = getSupabase();
  const photos = {};
  for (const p of photoRows) {
    photos[p.category] = { id: p.id, url: sb.storage.from(BUCKET).getPublicUrl(p.filename).data.publicUrl };
  }

  res.json({
    person_name: link.person_name,
    status: link.status,
    asset,
    assetOptions,
    categories: CATEGORY_LABELS,
    photos,
    condition_category: link.condition_category,
    notes: link.notes,
  });
}));

// POST /api/public-audit/:token/asset  — body: { asset_id }
router.post('/:token/asset', asyncHandler(async (req, res) => {
  const link = await loadLink(req.params.token);
  if (!link) return res.status(404).json({ error: 'Invalid or expired link' });
  if (link.status === 'submitted') return res.status(400).json({ error: 'This audit has already been submitted' });
  if (link.asset_id) return res.status(400).json({ error: 'Asset is already set for this link' });

  const asset_id = Number(req.body.asset_id);
  const asset = await db.prepare('SELECT id FROM assets WHERE id = ?').get(asset_id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });

  await db.prepare('UPDATE audit_links SET asset_id = ? WHERE id = ?').run(asset_id, link.id);
  res.json({ success: true });
}));

// POST /api/public-audit/:token/photos  — multipart: photo (single file), category (text field)
router.post('/:token/photos', upload.single('photo'), asyncHandler(async (req, res) => {
  const link = await loadLink(req.params.token);
  if (!link) return res.status(404).json({ error: 'Invalid or expired link' });
  if (link.status === 'submitted') return res.status(400).json({ error: 'This audit has already been submitted' });
  if (!link.asset_id) return res.status(400).json({ error: 'Please select your asset first' });

  const { category } = req.body;
  if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category' });
  if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

  const sb = getSupabase();

  // One photo per category — replace whatever was there before.
  const existing = await db.prepare('SELECT * FROM audit_link_photos WHERE audit_link_id = ? AND category = ?').get(link.id, category);
  if (existing) {
    await sb.storage.from(BUCKET).remove([existing.filename]);
    await db.prepare('DELETE FROM audit_link_photos WHERE id = ?').run(existing.id);
  }

  const ext = (req.file.originalname.match(/\.[^.]+$/) || [''])[0];
  const storagePath = `audit-link-${link.id}/${category}-${Date.now()}${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(storagePath, req.file.buffer, {
    contentType: req.file.mimetype,
  });
  if (error) throw error;

  const result = await db.prepare(`
    INSERT INTO audit_link_photos (audit_link_id, category, filename, original_name)
    VALUES (?, ?, ?, ?)
  `).run(link.id, category, storagePath, req.file.originalname);

  res.json({
    id: result.lastInsertRowid,
    category,
    url: sb.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl,
  });
}));

// DELETE /api/public-audit/:token/photos/:photoId
router.delete('/:token/photos/:photoId', asyncHandler(async (req, res) => {
  const link = await loadLink(req.params.token);
  if (!link) return res.status(404).json({ error: 'Invalid or expired link' });
  if (link.status === 'submitted') return res.status(400).json({ error: 'This audit has already been submitted' });

  const photo = await db.prepare('SELECT * FROM audit_link_photos WHERE id = ? AND audit_link_id = ?').get(req.params.photoId, link.id);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  const sb = getSupabase();
  await sb.storage.from(BUCKET).remove([photo.filename]);
  await db.prepare('DELETE FROM audit_link_photos WHERE id = ?').run(photo.id);
  res.json({ success: true });
}));

// POST /api/public-audit/:token/submit  — body: { condition_category, notes }
router.post('/:token/submit', asyncHandler(async (req, res) => {
  const link = await loadLink(req.params.token);
  if (!link) return res.status(404).json({ error: 'Invalid or expired link' });
  if (link.status === 'submitted') return res.status(400).json({ error: 'This audit has already been submitted' });
  if (!link.asset_id) return res.status(400).json({ error: 'Please select your asset first' });

  const { condition_category, notes } = req.body;
  if (!CONDITIONS.includes(condition_category)) {
    return res.status(400).json({ error: `condition_category must be one of ${CONDITIONS.join(', ')}` });
  }

  const photoRows = await db.prepare('SELECT category FROM audit_link_photos WHERE audit_link_id = ?').all(link.id);
  const have = new Set(photoRows.map(p => p.category));
  const missing = CATEGORIES.filter(c => !have.has(c));
  if (missing.length > 0) {
    return res.status(400).json({ error: `Please upload a photo for: ${missing.map(c => CATEGORY_LABELS[c]).join(', ')}` });
  }

  await db.prepare(`
    UPDATE audit_links SET status = 'submitted', condition_category = ?, notes = ?, submitted_at = now()
    WHERE id = ?
  `).run(condition_category, notes || null, link.id);

  res.json({ success: true });
}));

module.exports = router;
