const express = require('express');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const db = require('../db');
const { authenticate, adminOnly } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { sendMail, auditScheduleCreated, auditItemSubmitted, auditItemReviewed } = require('../mailer');

const router = express.Router();

// Vercel's serverless filesystem is read-only (except /tmp, which doesn't
// survive between requests), so photos can no longer be saved to a local
// `uploads/` folder like the original SQLite version did. They're uploaded
// to a Supabase Storage bucket instead — set SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_STORAGE_BUCKET (default below) in
// your environment variables, and create that bucket (as Public) in the
// Supabase dashboard under Storage.
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'audit-photos';
let supabase = null;
function getSupabase() {
  if (!supabase) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set — photo upload is unavailable');
    }
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return supabase;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// ── Schedules ────────────────────────────────────────────────────────────────

// GET /api/physical-audit/schedules
router.get('/schedules', authenticate, asyncHandler(async (req, res) => {
  const schedules = await db.prepare(`
    SELECT s.*, u.full_name AS created_by_name,
      (SELECT COUNT(*) FROM physical_audits pa WHERE pa.schedule_id = s.id) AS total_items,
      (SELECT COUNT(*) FROM physical_audits pa WHERE pa.schedule_id = s.id AND pa.status = 'submitted') AS submitted_items,
      (SELECT COUNT(*) FROM physical_audits pa WHERE pa.schedule_id = s.id AND pa.status = 'approved') AS approved_items
    FROM audit_schedules s
    JOIN users u ON u.id = s.created_by
    ORDER BY s.created_at DESC
  `).all();
  res.json(schedules);
}));

// POST /api/physical-audit/schedules  (admin only)
router.post('/schedules', authenticate, adminOnly, asyncHandler(async (req, res) => {
  const { title, tenure, start_date, due_date, asset_ids } = req.body;
  if (!title || !tenure || !start_date || !due_date) {
    return res.status(400).json({ error: 'title, tenure, start_date, due_date required' });
  }

  const result = await db.prepare(`
    INSERT INTO audit_schedules (title, tenure, start_date, due_date, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(title, tenure, start_date, due_date, req.user.id);

  const scheduleId = result.lastInsertRowid;

  // Add assets to audit (either specific ones or all active)
  let assets;
  if (asset_ids && asset_ids.length > 0) {
    assets = await db.prepare(`SELECT id FROM assets WHERE id IN (${asset_ids.map(() => '?').join(',')})`)
      .all(...asset_ids);
  } else {
    assets = await db.prepare(`SELECT id FROM assets WHERE status = 'active'`).all();
  }

  const insertItem = db.prepare(`
    INSERT INTO physical_audits (schedule_id, asset_id) VALUES (?, ?)
  `);
  for (const asset of assets) await insertItem.run(scheduleId, asset.id);

  await db.prepare(`INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)`)
    .run(req.user.id, 'CREATE_AUDIT_SCHEDULE', 'audit_schedule', scheduleId,
      `Created ${tenure} audit: "${title}" with ${assets.length} assets`);

  // Notify all users by email
  const allUsers = await db.prepare('SELECT username FROM users').all();
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
}));

// GET /api/physical-audit/schedules/:id/items
router.get('/schedules/:id/items', authenticate, asyncHandler(async (req, res) => {
  const schedule = await db.prepare('SELECT * FROM audit_schedules WHERE id = ?').get(req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

  const items = await db.prepare(`
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
}));

// ── Audit Items ───────────────────────────────────────────────────────────────

// POST /api/physical-audit/items/:id/photos — upload photos for an audit item
router.post('/items/:id/photos', authenticate, upload.array('photos', 10), asyncHandler(async (req, res) => {
  const item = await db.prepare('SELECT * FROM physical_audits WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Audit item not found' });
  if (item.status === 'approved') return res.status(400).json({ error: 'Cannot modify an approved audit' });

  const sb = getSupabase();
  const insertPhoto = db.prepare(`
    INSERT INTO audit_photos (physical_audit_id, filename, original_name) VALUES (?, ?, ?)
  `);

  for (const file of req.files) {
    const ext = (file.originalname.match(/\.[^.]+$/) || [''])[0];
    const storagePath = `audit-${item.id}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(storagePath, file.buffer, {
      contentType: file.mimetype,
    });
    if (error) throw error;
    await insertPhoto.run(item.id, storagePath, file.originalname);
  }
  res.json({ uploaded: req.files.length });
}));

// GET /api/physical-audit/items/:id/photos
router.get('/items/:id/photos', authenticate, asyncHandler(async (req, res) => {
  const photos = await db.prepare('SELECT * FROM audit_photos WHERE physical_audit_id = ? ORDER BY uploaded_at')
    .all(req.params.id);

  // Attach a viewable URL for each photo (bucket must be Public, or switch
  // this to createSignedUrl if you'd rather keep it private).
  const sb = getSupabase();
  const withUrls = photos.map((p) => ({
    ...p,
    url: sb.storage.from(BUCKET).getPublicUrl(p.filename).data.publicUrl,
  }));
  res.json(withUrls);
}));

// DELETE /api/physical-audit/photos/:id
router.delete('/photos/:id', authenticate, asyncHandler(async (req, res) => {
  const photo = await db.prepare('SELECT * FROM audit_photos WHERE id = ?').get(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  const sb = getSupabase();
  await sb.storage.from(BUCKET).remove([photo.filename]);
  await db.prepare('DELETE FROM audit_photos WHERE id = ?').run(photo.id);
  res.json({ success: true });
}));

// POST /api/physical-audit/items/:id/submit
router.post('/items/:id/submit', authenticate, asyncHandler(async (req, res) => {
  const item = await db.prepare('SELECT * FROM physical_audits WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Audit item not found' });
  if (item.status !== 'pending') return res.status(400).json({ error: 'Item already submitted or processed' });

  const photoCountRow = await db.prepare('SELECT COUNT(*) as cnt FROM audit_photos WHERE physical_audit_id = ?').get(item.id);
  if (parseInt(photoCountRow.cnt, 10) === 0) return res.status(400).json({ error: 'Please upload at least one photo before submitting' });

  await db.prepare(`
    UPDATE physical_audits SET status='submitted', submitted_by=?, submitted_at=now(), notes=?
    WHERE id=?
  `).run(req.user.id, req.body.notes || null, item.id);

  const asset = await db.prepare('SELECT name FROM assets WHERE id = ?').get(item.asset_id);
  await db.prepare(`INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)`)
    .run(req.user.id, 'SUBMIT_AUDIT_ITEM', 'physical_audit', item.id,
      `Submitted audit for asset "${asset?.name}"`);

  // Notify admins by email
  const schedule = await db.prepare('SELECT title FROM audit_schedules WHERE id = ?').get(item.schedule_id);
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
}));

// POST /api/physical-audit/items/:id/review  (admin only)
router.post('/items/:id/review', authenticate, adminOnly, asyncHandler(async (req, res) => {
  const { decision, review_notes } = req.body; // decision: 'approved' | 'rejected'
  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be approved or rejected' });
  }

  const item = await db.prepare('SELECT * FROM physical_audits WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Audit item not found' });
  if (item.status !== 'submitted') return res.status(400).json({ error: 'Item must be submitted before review' });

  await db.prepare(`
    UPDATE physical_audits SET status=?, reviewed_by=?, reviewed_at=now(), review_notes=?
    WHERE id=?
  `).run(decision, req.user.id, review_notes || null, item.id);

  const asset = await db.prepare('SELECT name FROM assets WHERE id = ?').get(item.asset_id);
  await db.prepare(`INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)`)
    .run(req.user.id, `AUDIT_${decision.toUpperCase()}`, 'physical_audit', item.id,
      `${decision} audit for asset "${asset?.name}"`);

  // Notify submitter by email
  const scheduleForReview = await db.prepare('SELECT title FROM audit_schedules WHERE id = ?').get(item.schedule_id);
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
}));

module.exports = router;
