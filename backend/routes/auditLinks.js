const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { authenticate, adminOnly } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { getSupabase, BUCKET } = require('../lib/supabase');

const router = express.Router();

function makeToken() {
  return crypto.randomBytes(16).toString('hex');
}

// POST /api/audit-links/bulk  (admin only) — body: { names: ["Name 1", "Name 2", ...] }
// Creates one no-login audit link per name. If the name matches someone with
// an active (not-yet-returned) assignment, that asset is pre-filled;
// otherwise the employee picks their own asset when they open the link.
router.post('/bulk', authenticate, adminOnly, asyncHandler(async (req, res) => {
  const { names } = req.body;
  if (!Array.isArray(names) || names.length === 0) {
    return res.status(400).json({ error: 'names must be a non-empty array' });
  }

  const created = [];
  for (const raw of names) {
    const person_name = String(raw || '').trim();
    if (!person_name) continue;

    const match = await db.prepare(`
      SELECT a.id, a.name, a.type
      FROM assignments asgn
      JOIN assets a ON a.id = asgn.asset_id
      WHERE LOWER(asgn.assigned_to) = LOWER(?) AND asgn.returned_at IS NULL
      ORDER BY asgn.assigned_at DESC
      LIMIT 1
    `).get(person_name);

    const token = makeToken();
    const result = await db.prepare(`
      INSERT INTO audit_links (token, person_name, asset_id, created_by)
      VALUES (?, ?, ?, ?)
    `).run(token, person_name, match ? match.id : null, req.user.id);

    created.push({
      id: result.lastInsertRowid,
      token,
      person_name,
      matched_asset: match ? { id: match.id, name: match.name, type: match.type } : null,
    });
  }

  if (created.length > 0) {
    await db.prepare(`INSERT INTO audit_log (user_id, action, entity_type, details) VALUES (?, ?, ?, ?)`)
      .run(req.user.id, 'CREATE_AUDIT_LINKS', 'audit_link', `Generated ${created.length} employee audit link(s)`);
  }

  res.status(201).json({ created });
}));

// GET /api/audit-links  (admin only)
router.get('/', authenticate, adminOnly, asyncHandler(async (req, res) => {
  const links = await db.prepare(`
    SELECT l.*, a.name AS asset_name, a.type AS asset_type, a.serial_number,
      (SELECT COUNT(*) FROM audit_link_photos p WHERE p.audit_link_id = l.id) AS photo_count
    FROM audit_links l
    LEFT JOIN assets a ON a.id = l.asset_id
    ORDER BY l.created_at DESC
  `).all();
  res.json(links);
}));

// GET /api/audit-links/:id/photos  (admin only)
router.get('/:id/photos', authenticate, adminOnly, asyncHandler(async (req, res) => {
  const photos = await db.prepare('SELECT * FROM audit_link_photos WHERE audit_link_id = ? ORDER BY category')
    .all(req.params.id);
  const sb = getSupabase();
  const withUrls = photos.map((p) => ({
    ...p,
    url: sb.storage.from(BUCKET).getPublicUrl(p.filename).data.publicUrl,
  }));
  res.json(withUrls);
}));

// DELETE /api/audit-links/:id  (admin only)
router.delete('/:id', authenticate, adminOnly, asyncHandler(async (req, res) => {
  const link = await db.prepare('SELECT * FROM audit_links WHERE id = ?').get(req.params.id);
  if (!link) return res.status(404).json({ error: 'Link not found' });

  const photos = await db.prepare('SELECT filename FROM audit_link_photos WHERE audit_link_id = ?').all(req.params.id);
  if (photos.length > 0) {
    try {
      const sb = getSupabase();
      await sb.storage.from(BUCKET).remove(photos.map(p => p.filename));
    } catch (e) {
      // Storage may be unreachable/misconfigured — don't block deleting the link record over it.
      console.error('Failed to remove storage files for audit link', req.params.id, e);
    }
  }

  await db.prepare('DELETE FROM audit_link_photos WHERE audit_link_id = ?').run(req.params.id);
  await db.prepare('DELETE FROM audit_links WHERE id = ?').run(req.params.id);
  res.json({ success: true });
}));

module.exports = router;
