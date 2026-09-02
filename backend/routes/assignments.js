const express = require('express');
const db = require('../db');
const { authenticate, adminOnly } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

// GET /api/assignments
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const assignments = await db.prepare(`
    SELECT asgn.*, a.name AS asset_name, a.type AS asset_type, a.serial_number,
           u.full_name AS assigned_by_name
    FROM assignments asgn
    JOIN assets a ON a.id = asgn.asset_id
    JOIN users u ON u.id = asgn.assigned_by
    ORDER BY asgn.assigned_at DESC
  `).all();
  res.json(assignments);
}));

// POST /api/assignments  (admin only)
router.post('/', authenticate, adminOnly, asyncHandler(async (req, res) => {
  const { asset_id, assigned_to, department, notes } = req.body;
  if (!asset_id || !assigned_to) {
    return res.status(400).json({ error: 'asset_id and assigned_to are required' });
  }

  const asset = await db.prepare('SELECT * FROM assets WHERE id = ?').get(asset_id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });

  const active = await db.prepare('SELECT id FROM assignments WHERE asset_id = ? AND returned_at IS NULL').get(asset_id);
  if (active) return res.status(409).json({ error: 'Asset is already assigned. Return it first.' });

  const result = await db.prepare(`
    INSERT INTO assignments (asset_id, assigned_to, department, assigned_by, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(asset_id, assigned_to, department, req.user.id, notes);

  await db.prepare(`INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)`)
    .run(req.user.id, 'ASSIGN_ASSET', 'assignment', result.lastInsertRowid,
      `Assigned asset "${asset.name}" to ${assigned_to}`);

  res.status(201).json({ id: result.lastInsertRowid });
}));

// PUT /api/assignments/:id/return  (admin only)
router.put('/:id/return', authenticate, adminOnly, asyncHandler(async (req, res) => {
  const asgn = await db.prepare('SELECT * FROM assignments WHERE id = ?').get(req.params.id);
  if (!asgn) return res.status(404).json({ error: 'Assignment not found' });
  if (asgn.returned_at) return res.status(400).json({ error: 'Already returned' });

  await db.prepare(`UPDATE assignments SET returned_at = now() WHERE id = ?`).run(req.params.id);

  const asset = await db.prepare('SELECT name FROM assets WHERE id = ?').get(asgn.asset_id);
  await db.prepare(`INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)`)
    .run(req.user.id, 'RETURN_ASSET', 'assignment', asgn.id,
      `Returned asset "${asset?.name}" from ${asgn.assigned_to}`);

  res.json({ success: true });
}));

module.exports = router;
