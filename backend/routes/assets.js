const express = require('express');
const multer = require('multer');
const db = require('../db');
const { authenticate, adminOnly } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { getSupabase, BUCKET } = require('../lib/supabase');

const router = express.Router();

const CONDITION_CATEGORIES = ['front_screen', 'keyboard_trackpad', 'back_panel', 'sides_ports', 'charger_cable'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// GET /api/assets
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { status, type, search } = req.query;
  let query = `
    SELECT a.*,
      (SELECT assigned_to FROM assignments WHERE asset_id = a.id AND returned_at IS NULL LIMIT 1) AS current_assignee,
      (SELECT department FROM assignments WHERE asset_id = a.id AND returned_at IS NULL LIMIT 1) AS current_department
    FROM assets a WHERE 1=1
  `;
  const params = [];
  if (status) { query += ' AND a.status = ?'; params.push(status); }
  if (type) { query += ' AND a.type = ?'; params.push(type); }
  if (search) {
    query += ' AND (a.name ILIKE ? OR a.serial_number ILIKE ? OR a.manufacturer ILIKE ? OR a.model ILIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  query += ' ORDER BY a.created_at DESC';
  res.json(await db.prepare(query).all(...params));
}));

// GET /api/assets/:id
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const asset = await db.prepare(`
    SELECT a.*,
      (SELECT assigned_to FROM assignments WHERE asset_id = a.id AND returned_at IS NULL LIMIT 1) AS current_assignee,
      (SELECT department FROM assignments WHERE asset_id = a.id AND returned_at IS NULL LIMIT 1) AS current_department
    FROM assets a WHERE a.id = ?
  `).get(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  asset.assignment_history = await db.prepare(`
    SELECT asgn.*, u.full_name AS assigned_by_name
    FROM assignments asgn
    JOIN users u ON u.id = asgn.assigned_by
    WHERE asgn.asset_id = ?
    ORDER BY asgn.assigned_at DESC
  `).all(req.params.id);

  const photoRows = await db.prepare('SELECT * FROM asset_condition_photos WHERE asset_id = ?').all(req.params.id);
  const conditionPhotos = {};
  if (photoRows.length > 0) {
    const sb = getSupabase();
    for (const p of photoRows) {
      conditionPhotos[p.category] = { id: p.id, url: sb.storage.from(BUCKET).getPublicUrl(p.filename).data.publicUrl };
    }
  }
  asset.condition_photos = conditionPhotos;

  res.json(asset);
}));

// POST /api/assets  (admin only)
router.post('/', authenticate, adminOnly, asyncHandler(async (req, res) => {
  const {
    name, type, manufacturer, model, serial_number, status,
    location, ip_address, mac_address, purchased_at, warranty_expires,
    purchase_price, notes,
    condition_front_screen, condition_keyboard_trackpad, condition_back_panel,
    condition_sides_ports, condition_charger_cable
  } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'name and type are required' });

  try {
    const result = await db.prepare(`
      INSERT INTO assets (name, type, manufacturer, model, serial_number, status,
        location, ip_address, mac_address, purchased_at, warranty_expires, purchase_price, notes,
        condition_front_screen, condition_keyboard_trackpad, condition_back_panel,
        condition_sides_ports, condition_charger_cable)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, type, manufacturer, model, serial_number, status || 'active',
      location, ip_address, mac_address, purchased_at, warranty_expires,
      purchase_price, notes,
      condition_front_screen, condition_keyboard_trackpad, condition_back_panel,
      condition_sides_ports, condition_charger_cable);

    await db.prepare(`INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)`)
      .run(req.user.id, 'CREATE_ASSET', 'asset', result.lastInsertRowid, `Created asset: ${name}`);

    res.status(201).json({ id: result.lastInsertRowid, ...req.body, status: status || 'active' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Serial number already exists' });
    throw err;
  }
}));

// PUT /api/assets/:id  (admin only)
router.put('/:id', authenticate, adminOnly, asyncHandler(async (req, res) => {
  const {
    name, type, manufacturer, model, serial_number, status,
    location, ip_address, mac_address, purchased_at, warranty_expires,
    purchase_price, notes,
    condition_front_screen, condition_keyboard_trackpad, condition_back_panel,
    condition_sides_ports, condition_charger_cable
  } = req.body;

  const existing = await db.prepare('SELECT id FROM assets WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Asset not found' });

  try {
    await db.prepare(`
      UPDATE assets SET name=?, type=?, manufacturer=?, model=?, serial_number=?, status=?,
        location=?, ip_address=?, mac_address=?, purchased_at=?, warranty_expires=?,
        purchase_price=?, notes=?,
        condition_front_screen=?, condition_keyboard_trackpad=?, condition_back_panel=?,
        condition_sides_ports=?, condition_charger_cable=?,
        updated_at=now()
      WHERE id=?
    `).run(name, type, manufacturer, model, serial_number, status,
      location, ip_address, mac_address, purchased_at, warranty_expires,
      purchase_price, notes,
      condition_front_screen, condition_keyboard_trackpad, condition_back_panel,
      condition_sides_ports, condition_charger_cable, req.params.id);

    await db.prepare(`INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)`)
      .run(req.user.id, 'UPDATE_ASSET', 'asset', req.params.id, `Updated asset: ${name}`);

    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Serial number already exists' });
    throw err;
  }
}));

// POST /api/assets/:id/condition-photos  (admin only) — multipart: photo (file), category (text)
router.post('/:id/condition-photos', authenticate, adminOnly, upload.single('photo'), asyncHandler(async (req, res) => {
  const asset = await db.prepare('SELECT id FROM assets WHERE id = ?').get(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });

  const { category } = req.body;
  if (!CONDITION_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category' });
  if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

  const sb = getSupabase();

  // One photo per category per asset — replace whatever was there before.
  const existingPhoto = await db.prepare('SELECT * FROM asset_condition_photos WHERE asset_id = ? AND category = ?').get(asset.id, category);
  if (existingPhoto) {
    await sb.storage.from(BUCKET).remove([existingPhoto.filename]);
    await db.prepare('DELETE FROM asset_condition_photos WHERE id = ?').run(existingPhoto.id);
  }

  const ext = (req.file.originalname.match(/\.[^.]+$/) || [''])[0];
  const storagePath = `asset-${asset.id}/${category}-${Date.now()}${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(storagePath, req.file.buffer, {
    contentType: req.file.mimetype,
  });
  if (error) throw error;

  const result = await db.prepare(`
    INSERT INTO asset_condition_photos (asset_id, category, filename, original_name)
    VALUES (?, ?, ?, ?)
  `).run(asset.id, category, storagePath, req.file.originalname);

  res.json({
    id: result.lastInsertRowid,
    category,
    url: sb.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl,
  });
}));

// DELETE /api/assets/:id/condition-photos/:photoId  (admin only)
router.delete('/:id/condition-photos/:photoId', authenticate, adminOnly, asyncHandler(async (req, res) => {
  const photo = await db.prepare('SELECT * FROM asset_condition_photos WHERE id = ? AND asset_id = ?').get(req.params.photoId, req.params.id);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  const sb = getSupabase();
  await sb.storage.from(BUCKET).remove([photo.filename]);
  await db.prepare('DELETE FROM asset_condition_photos WHERE id = ?').run(photo.id);
  res.json({ success: true });
}));

// DELETE /api/assets/:id  (admin only)
router.delete('/:id', authenticate, adminOnly, asyncHandler(async (req, res) => {
  const asset = await db.prepare('SELECT name FROM assets WHERE id = ?').get(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });

  const photos = await db.prepare('SELECT filename FROM asset_condition_photos WHERE asset_id = ?').all(req.params.id);
  if (photos.length > 0) {
    try {
      const sb = getSupabase();
      await sb.storage.from(BUCKET).remove(photos.map(p => p.filename));
    } catch (e) {
      console.error('Failed to remove storage files for asset', req.params.id, e);
    }
  }
  await db.prepare('DELETE FROM asset_condition_photos WHERE asset_id = ?').run(req.params.id);
  await db.prepare('DELETE FROM assignments WHERE asset_id = ?').run(req.params.id);
  await db.prepare('DELETE FROM assets WHERE id = ?').run(req.params.id);
  await db.prepare(`INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)`)
    .run(req.user.id, 'DELETE_ASSET', 'asset', req.params.id, `Deleted asset: ${asset.name}`);

  res.json({ success: true });
}));

module.exports = router;
