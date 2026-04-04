const cron = require('node-cron');
const db = require('./db');
const { sendMail, auditDueReminder } = require('./mailer');

// Runs daily at 8:00 AM — sends reminder emails for audits due in 7 or 1 day(s)
function startScheduler() {
  cron.schedule('0 8 * * *', async () => {
    console.log('[Scheduler] Running daily audit reminder check...');
    try {
      const schedules = db.prepare(`
        SELECT s.*,
          (SELECT COUNT(*) FROM physical_audits pa WHERE pa.schedule_id = s.id AND pa.status = 'pending') AS pending_count
        FROM audit_schedules s
        WHERE date(s.due_date) >= date('now')
          AND (SELECT COUNT(*) FROM physical_audits pa WHERE pa.schedule_id = s.id AND pa.status = 'pending') > 0
      `).all();

      for (const schedule of schedules) {
        const daysLeft = Math.ceil((new Date(schedule.due_date) - new Date()) / (1000 * 60 * 60 * 24));

        // Only remind at 7 days and 1 day before due
        if (daysLeft !== 7 && daysLeft !== 1) continue;

        // Get all user emails
        const users = db.prepare('SELECT username FROM users').all();
        const template = auditDueReminder({
          title: schedule.title,
          dueDate: new Date(schedule.due_date).toLocaleDateString(),
          pendingCount: schedule.pending_count,
          daysLeft,
        });

        for (const user of users) {
          // In real deployment user emails would be stored in the users table
          // Here we log the reminder intent
          console.log(`[Scheduler] Reminder for "${schedule.title}" → ${user.username} (${daysLeft} days left)`);
        }

        // If NOTIFICATION_EMAIL is set, send a consolidated reminder there
        if (process.env.NOTIFICATION_EMAIL) {
          await sendMail({
            to: process.env.NOTIFICATION_EMAIL,
            ...template,
          });
        }

        db.prepare(`INSERT INTO audit_log (action, entity_type, entity_id, details) VALUES (?, ?, ?, ?)`)
          .run('REMINDER_SENT', 'audit_schedule', schedule.id,
            `Sent ${daysLeft}-day reminder for "${schedule.title}" (${schedule.pending_count} pending)`);
      }
    } catch (err) {
      console.error('[Scheduler] Error during reminder check:', err.message);
    }
  });

  console.log('[Scheduler] Daily audit reminder job scheduled (08:00 AM)');
}

module.exports = { startScheduler };
