const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

// GET /api/reports/summary
router.get('/summary', authenticate, asyncHandler(async (req, res) => {
  const totalAssetsRow = await db.prepare('SELECT COUNT(*) as cnt FROM assets').get();
  const totalAssets = parseInt(totalAssetsRow.cnt, 10);
  const byStatus = await db.prepare('SELECT status, COUNT(*) as cnt FROM assets GROUP BY status').all();
  const byType = await db.prepare('SELECT type, COUNT(*) as cnt FROM assets GROUP BY type ORDER BY cnt DESC').all();
  const assignedRow = await db.prepare('SELECT COUNT(DISTINCT asset_id) as cnt FROM assignments WHERE returned_at IS NULL').get();
  const assigned = parseInt(assignedRow.cnt, 10);
  const warrantyExpiringRow = await db.prepare(`
    SELECT COUNT(*) as cnt FROM assets
    WHERE warranty_expires IS NOT NULL AND warranty_expires != ''
    AND warranty_expires::date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days')
  `).get();
  const warrantyExpiring = parseInt(warrantyExpiringRow.cnt, 10);
  const totalValueRow = await db.prepare('SELECT SUM(purchase_price) as total FROM assets WHERE purchase_price IS NOT NULL').get();
  const totalValue = parseFloat(totalValueRow.total) || 0;
  const recentActivity = await db.prepare(`
    SELECT al.action, al.details, al.created_at, u.username
    FROM audit_log al
    LEFT JOIN users u ON u.id = al.user_id
    ORDER BY al.created_at DESC LIMIT 10
  `).all();

  res.json({ totalAssets, byStatus, byType, assigned, unassigned: totalAssets - assigned, warrantyExpiring, totalValue, recentActivity });
}));

// GET /api/reports/assets-by-department
router.get('/by-department', authenticate, asyncHandler(async (req, res) => {
  const data = await db.prepare(`
    SELECT department, COUNT(*) as cnt
    FROM assignments
    WHERE returned_at IS NULL AND department IS NOT NULL AND department != ''
    GROUP BY department
    ORDER BY cnt DESC
  `).all();
  res.json(data);
}));

module.exports = router;
