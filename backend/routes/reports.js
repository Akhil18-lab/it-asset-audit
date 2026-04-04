const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/reports/summary
router.get('/summary', authenticate, (req, res) => {
  const totalAssets = db.prepare('SELECT COUNT(*) as cnt FROM assets').get().cnt;
  const byStatus = db.prepare('SELECT status, COUNT(*) as cnt FROM assets GROUP BY status').all();
  const byType = db.prepare('SELECT type, COUNT(*) as cnt FROM assets GROUP BY type ORDER BY cnt DESC').all();
  const assigned = db.prepare('SELECT COUNT(DISTINCT asset_id) as cnt FROM assignments WHERE returned_at IS NULL').get().cnt;
  const warrantyExpiring = db.prepare(`
    SELECT COUNT(*) as cnt FROM assets
    WHERE warranty_expires IS NOT NULL AND warranty_expires != ''
    AND date(warranty_expires) BETWEEN date('now') AND date('now', '+30 days')
  `).get().cnt;
  const totalValue = db.prepare('SELECT SUM(purchase_price) as total FROM assets WHERE purchase_price IS NOT NULL').get().total || 0;
  const recentActivity = db.prepare(`
    SELECT al.action, al.details, al.created_at, u.username
    FROM audit_log al
    LEFT JOIN users u ON u.id = al.user_id
    ORDER BY al.created_at DESC LIMIT 10
  `).all();

  res.json({ totalAssets, byStatus, byType, assigned, unassigned: totalAssets - assigned, warrantyExpiring, totalValue, recentActivity });
});

// GET /api/reports/assets-by-department
router.get('/by-department', authenticate, (req, res) => {
  const data = db.prepare(`
    SELECT department, COUNT(*) as cnt
    FROM assignments
    WHERE returned_at IS NULL AND department IS NOT NULL AND department != ''
    GROUP BY department
    ORDER BY cnt DESC
  `).all();
  res.json(data);
});

module.exports = router;
