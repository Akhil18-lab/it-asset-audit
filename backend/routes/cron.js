const express = require('express');
const db = require('../db');
const { sendMail, auditDueReminder } = require('../mailer');

const router = express.Router();

// GET /api/cron/audit-reminders
// Triggered daily by Vercel Cron (see vercel.json). Sends reminder emails for
// audits due in 7 or 1 day(s). This replaces the old node-cron based
// scheduler.js, which relied on a long-running process — something a
// serverless deployment doesn't have.
router.get('/audit-reminders', async (req, res) => {
  // Vercel automatically sends this header when CRON_SECRET is set as an env
  // var, so only Vercel's own scheduler (or someone who has the secret) can
  // trigger this endpoint. See: https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    await db.ensureInitialized();
    console.log('[Cron] Running daily audit reminder check...');

    const schedules = await db.prepare(`
      SELECT s.*,
        (SELECT COUNT(*) FROM physical_audits pa WHERE pa.schedule_id = s.id AND pa.status = 'pending') AS pending_count
      FROM audit_schedules s
      WHERE s.due_date::date >= CURRENT_DATE
        AND (SELECT COUNT(*) FROM physical_audits pa WHERE pa.schedule_id = s.id AND pa.status = 'pending') > 0
    `).all();

    let remindersSent = 0;

    for (const schedule of schedules) {
      const pendingCount = parseInt(schedule.pending_count, 10);
      const daysLeft = Math.ceil((new Date(schedule.due_date) - new Date()) / (1000 * 60 * 60 * 24));

      // Only remind at 7 days and 1 day before due
      if (daysLeft !== 7 && daysLeft !== 1) continue;

      const users = await db.prepare('SELECT username FROM users').all();
      const template = auditDueReminder({
        title: schedule.title,
        dueDate: new Date(schedule.due_date).toLocaleDateString(),
        pendingCount,
        daysLeft,
      });

      for (const user of users) {
        console.log(`[Cron] Reminder for "${schedule.title}" -> ${user.username} (${daysLeft} days left)`);
      }

      if (process.env.NOTIFICATION_EMAIL) {
        await sendMail({ to: process.env.NOTIFICATION_EMAIL, ...template });
      }

      await db.prepare(`INSERT INTO audit_log (action, entity_type, entity_id, details) VALUES (?, ?, ?, ?)`)
        .run('REMINDER_SENT', 'audit_schedule', schedule.id,
          `Sent ${daysLeft}-day reminder for "${schedule.title}" (${pendingCount} pending)`);

      remindersSent++;
    }

    res.json({ success: true, schedulesChecked: schedules.length, remindersSent });
  } catch (err) {
    console.error('[Cron] Error during reminder check:', err.message);
    res.status(500).json({ error: 'Reminder check failed' });
  }
});

module.exports = router;
