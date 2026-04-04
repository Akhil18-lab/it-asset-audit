const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const { authenticate, adminOnly } = require('../middleware/auth');
const { sendMail, auditScheduleCreated, auditItemSubmitted, auditItemReviewed } = require('../mailer');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `audit-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// ── Schedules ────────────────────────────────────────────────────────────────

// GET /api/physical-audit/schedules
router.get('/schedules', authenticate, (req, res) => {
  const schedules = db.prepare(`
    SELECT s.*, u.full_name AS created_by_name,
      (SELECT COUNT(*) FROM physical_audits pa WHERE pa.schedule_id = s.id) AS total_items,
      (SELECT COUNT(*) FROM physical_audits pa WHERE pa.schedule_id = s.id AND pa.status = 'submitted') AS submitted_items,
      (SELECT COUNT(*) FROM physical_audits pa WHERE pa.schedule_id = s.id AND pa.status = 'approved') AS approved_items
    FROM audit_schedules s
    JOIN users u ON u.id = s.created_by
    ORDER BY s.created_at DESC
  `).all();
  res.json(schedules);
});

// POST /api/physical-audit/schedules  (admin only)
router.post('/schedules', authenticate, adminOnly, (req, res) => {
  const { title, tenure, start_date, due_date, asset_ids } = req.body;
  if (!title || !tenure || !start_date || !due_date) {
    return res.status(400).json({ error: 'title, tenure, start_date, due_date required' });
  }

  const result = db.prepare(`
    INSERT INTO audit_schedules (title, tenure, start_date, due_date, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(title, tenure, start_date, due_date, req.user.id);

  const scheduleId = result.lastInsertRowid;

  // Add assets to audit (either specific ones or all active)
  let assets;
  if (asset_ids && asset_ids.length > 0) {
    assets = db.prepare(`SELECT id FROM assets WHERE id IN (${asset_ids.map(() => '?').join(',')})`)
      .all(...asset_ids);
  } else {
    assets = db.prepare(`SELECT id FROM assets WHERE status = 'active'`).all();
  }

  const insertItem = db.prepare(`
    INSERT INTO physical_audits (schedule_id, asset_id) VALUES (?, ?)
  `);
  for (const asset of assets) insertItem.run(scheduleId, asset.id);

  db.prepare(`INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)`)
    .run(req.user.id, 'CREATE_AUDIT_SCHEDULE', 'audit_schedule', scheduleId,
      `Created ${tenure} audit: "${title}" with ${assets.length} assets`);

  // Notify all users by email
  const allUsers = db.prepare('SELECT username FROM users').all();
  const emailTemplate = auditScheduleCreated({
    title, tenure,
    dueDate: new Date(due_date).toLocaleDateString(),
    assetCount: assets.length,
  });
  if (process.env.NOTIFICATION_EMAIL) {
    sendMail({ to: process.env.NOTIFICATION_EMAIL, ...emailTemplate }).catch(() => {});
  }
  console.log(`[Email] Audit schedule "${title}" created — would notify ${allUsers.length} user(s)`);

  res.status(201).json({ id: scheduleId, asset_count: assets.length });
});

// GET /api/physical-audit/schedules/:id/items
router.get('/schedules/:id/items', authenticate, (req, res) => {
  const schedule = db.prepare('SELECT * FROM audit_schedules WHERE id = ?').get(req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

  const items = db.prepare(`
    SELECT pa.*,
      a.name AS asset_name, a.type AS asset_type, a.serial_number, a.location,
      a.manufacturer, a.model,
      u1.full_name AS submitted_by_name,
      u2.full_name AS reviewed_by_name,
      (SELECT COUNT(*) FROM audit_photos ap WHERE ap.physical_audit_id = pa.id) AS photo_count
    FROM physical_audits pa
    JOIN assets a ON a.id = pa.asset_id
    LEFT JOIN users u1 ON u1.id = pa.submitted_by
    LEFT JOIN users u2 ON u2.id = pa.reviewed_by
    WHERE pa.schedule_id = ?
    ORDER BY a.name
  `).all(req.params.id);

  res.json({ schedule, items });
});

// ── Audit Items ───────────────────────────────────────────────────────────────

// POST /api/physical-audit/items/:id/photos — upload photos for an audit item
router.post('/items/:id/photos', authenticate, upload.array('photos', 10), (req, res) => {
  const item = db.prepare('SELECT * FROM physical_audits WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Audit item not found' });
  if (item.status === 'approved') return res.status(400).json({ error: 'Cannot modify an approved audit' });

  const insertPhoto = db.prepare(`
    INSERT INTO audit_photos (physical_audit_id, filename, original_name) VALUES (?, ?, ?)
  `);
  for (const file of req.files) {
    insertPhoto.run(item.id, file.filename, file.originalname);
  }
  res.json({ uploaded: req.files.length });
});

// GET /api/physical-audit/items/:id/photos
router.get('/items/:id/photos', authenticate, (req, res) => {
  const photos = db.prepare('SELECT * FROM audit_photos WHERE physical_audit_id = ? ORDER BY uploaded_at')
    .all(req.params.id);
  res.json(photos);
});

// DELETE /api/physical-audit/photos/:id
router.delete('/photos/:id', authenticate, (req, res) => {
  const photo = db.prepare('SELECT * FROM audit_photos WHERE id = ?').get(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  const filePath = path.join(UPLOADS_DIR, photo.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM audit_photos WHERE id = ?').run(photo.id);
  res.json({ success: true });
});

// POST /api/physical-audit/items/:id/submit
router.post('/items/:id/submit', authenticate, (req, res) => {
  const item = db.prepare('SELECT * FROM physical_audits WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Audit item not found' });
  if (item.status !== 'pending') return res.status(400).json({ error: 'Item already submitted or processed' });

  const photoCount = db.prepare('SELECT COUNT(*) as cnt FROM audit_photos WHERE physical_audit_id = ?').get(item.id).cnt;
  if (photoCount === 0) return res.status(400).json({ error: 'Please upload at least one photo before submitting' });

  db.prepare(`
    UPDATE physical_audits SET status='submitted', submitted_by=?, submitted_at=datetime('now'), notes=?
    WHERE id=?
  `).run(req.user.id, req.body.notes || null, item.id);

  const asset = db.prepare('SELECT name FROM assets WHERE id = ?').get(item.asset_id);
  db.prepare(`INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)`)
    .run(req.user.id, 'SUBMIT_AUDIT_ITEM', 'physical_audit', item.id,
      `Submitted audit for asset "${asset?.name}"`);

  // Notify admins by email
  const schedule = db.prepare('SELECT title FROM audit_schedules WHERE id = ?').get(item.schedule_id);
  const emailTemplate = auditItemSubmitted({
    assetName: asset?.name,
    submittedBy: req.user.full_name,
    scheduleTitle: schedule?.title,
  });
  if (process.env.NOTIFICATION_EMAIL) {
    sendMail({ to: process.env.NOTIFICATION_EMAIL, ...emailTemplate }).catch(() => {});
  }
  console.log(`[Email] Audit submitted for "${asset?.name}" by ${req.user.full_name}`);

  res.json({ success: true });
});

// POST /api/physical-audit/items/:id/review  (admin only)
router.post('/items/:id/review', authenticate, adminOnly, (req, res) => {
  const { decision, review_notes } = req.body; // decision: 'approved' | 'rejected'
  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be approved or rejected' });
  }

  const item = db.prepare('SELECT * FROM physical_audits WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Audit item not found' });
  if (item.status !== 'submitted') return res.status(400).json({ error: 'Item must be submitted before review' });

  db.prepare(`
    UPDATE physical_audits SET status=?, reviewed_by=?, reviewed_at=datetime('now'), review_notes=?
    WHERE id=?
  `).run(decision, req.user.id, review_notes || null, item.id);

  const asset = db.prepare('SELECT name FROM assets WHERE id = ?').get(item.asset_id);
  db.prepare(`INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)`)
    .run(req.user.id, `AUDIT_${decision.toUpperCase()}`, 'physical_audit', item.id,
      `${decision} audit for asset "${asset?.name}"`);

  // Notify submitter by email
  const scheduleForReview = db.prepare('SELECT title FROM audit_schedules WHERE id = ?').get(item.schedule_id);
  const reviewEmailTemplate = auditItemReviewed({
    assetName: asset?.name,
    decision,
    reviewNotes: review_notes,
    scheduleTitle: scheduleForReview?.title,
  });
  if (process.env.NOTIFICATION_EMAIL) {
    sendMail({ to: process.env.NOTIFICATION_EMAIL, ...reviewEmailTemplate }).catch(() => {});
  }
  console.log(`[Email] Audit "${decision}" for "${asset?.name}" by ${req.user.full_name}`);

  res.json({ success: true });
});

// GET /api/physical-audit/uploads/:filename — serve uploaded photos
router.get('/uploads/:filename', authenticate, (req, res) => {
  const filePath = path.join(UPLOADS_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(filePath);
});

module.exports = router;
