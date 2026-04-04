const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/audit
router.get('/', authenticate, (req, res) => {
  const { action, entity_type, limit = 100, offset = 0 } = req.query;
  let query = `
    SELECT al.*, u.username, u.full_name
    FROM audit_log al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE 1=1
  `;
  const params = [];
  if (action) { query += ' AND al.action = ?'; params.push(action); }
  if (entity_type) { query += ' AND al.entity_type = ?'; params.push(entity_type); }
  query += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const rows = db.prepare(query).all(...params);
  const total = db.prepare(`SELECT COUNT(*) as cnt FROM audit_log WHERE 1=1${action ? ' AND action=?' : ''}${entity_type ? ' AND entity_type=?' : ''}`).get(
    ...[action, entity_type].filter(Boolean)
  ).cnt;

  res.json({ rows, total });
});

module.exports = router;
