const express = require('express');
const db = require('../db');
const { authenticate, adminOnly } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

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

// DELETE /api/assets/:id  (admin only)
router.delete('/:id', authenticate, adminOnly, asyncHandler(async (req, res) => {
  const asset = await db.prepare('SELECT name FROM assets WHERE id = ?').get(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });

  await db.prepare('DELETE FROM assignments WHERE asset_id = ?').run(req.params.id);
  await db.prepare('DELETE FROM assets WHERE id = ?').run(req.params.id);
  await db.prepare(`INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)`)
    .run(req.user.id, 'DELETE_ASSET', 'asset', req.params.id, `Deleted asset: ${asset.name}`);

  res.json({ success: true });
}));

module.exports = router;
