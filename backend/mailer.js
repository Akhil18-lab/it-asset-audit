const nodemailer = require('nodemailer');

// Configure via environment variables in .env
// For Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_USER=you@gmail.com, SMTP_PASS=app-password
// For Outlook: SMTP_HOST=smtp.office365.com, SMTP_PORT=587
// For testing: leave SMTP_HOST blank to use Ethereal (fake SMTP, logs to console)

let transporter;

async function getTransporter() {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else {
    // Development: use Ethereal fake SMTP (prints preview URL to console)
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    console.log('[Mailer] Using Ethereal test SMTP. Set SMTP_* env vars for real email.');
  }
  return transporter;
}

const FROM = process.env.SMTP_FROM || '"IT Asset Audit" <noreply@itasset.local>';

async function sendMail({ to, subject, html }) {
  try {
    const t = await getTransporter();
    const info = await t.sendMail({ from: FROM, to, subject, html });
    const preview = nodemailer.getTestMessageUrl(info);
    if (preview) console.log(`[Mailer] Preview: ${preview}`);
    return info;
  } catch (err) {
    console.error('[Mailer] Failed to send email:', err.message);
  }
}

// ── Email Templates ──────────────────────────────────────────────────────────

function auditScheduleCreated({ title, tenure, dueDate, assetCount }) {
  return {
    subject: `New Audit Schedule: ${title}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <div style="background:#2563eb;color:#fff;padding:24px;border-radius:8px 8px 0 0">
          <h2 style="margin:0">📅 New Physical Audit Scheduled</h2>
        </div>
        <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
          <p>A new <strong>${tenure}</strong> audit has been created.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px;color:#6b7280">Title</td><td style="padding:8px;font-weight:600">${title}</td></tr>
            <tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Tenure</td><td style="padding:8px;font-weight:600;text-transform:capitalize">${tenure}</td></tr>
            <tr><td style="padding:8px;color:#6b7280">Due Date</td><td style="padding:8px;font-weight:600">${dueDate}</td></tr>
            <tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Assets</td><td style="padding:8px;font-weight:600">${assetCount} asset(s) to audit</td></tr>
          </table>
          <p style="color:#6b7280;font-size:14px">Please log in to the IT Asset Audit system to complete your assigned items before the due date.</p>
        </div>
      </div>`,
  };
}

function auditItemSubmitted({ assetName, submittedBy, scheduleTitle }) {
  return {
    subject: `Audit Submission Ready for Review: ${assetName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <div style="background:#16a34a;color:#fff;padding:24px;border-radius:8px 8px 0 0">
          <h2 style="margin:0">✅ Audit Item Submitted</h2>
        </div>
        <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
          <p><strong>${submittedBy}</strong> has submitted an audit item for your review.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px;color:#6b7280">Asset</td><td style="padding:8px;font-weight:600">${assetName}</td></tr>
            <tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Audit</td><td style="padding:8px">${scheduleTitle}</td></tr>
          </table>
          <p style="color:#6b7280;font-size:14px">Log in to the IT Asset Audit system to review and approve/reject this submission.</p>
        </div>
      </div>`,
  };
}

function auditItemReviewed({ assetName, decision, reviewNotes, scheduleTitle }) {
  const isApproved = decision === 'approved';
  return {
    subject: `Audit ${isApproved ? 'Approved ✅' : 'Rejected ❌'}: ${assetName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <div style="background:${isApproved ? '#16a34a' : '#dc2626'};color:#fff;padding:24px;border-radius:8px 8px 0 0">
          <h2 style="margin:0">${isApproved ? '✅ Audit Approved' : '❌ Audit Rejected'}</h2>
        </div>
        <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
          <p>Your audit submission for <strong>${assetName}</strong> has been <strong>${decision}</strong>.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px;color:#6b7280">Asset</td><td style="padding:8px;font-weight:600">${assetName}</td></tr>
            <tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Audit</td><td style="padding:8px">${scheduleTitle}</td></tr>
            <tr><td style="padding:8px;color:#6b7280">Decision</td><td style="padding:8px;font-weight:600;text-transform:capitalize">${decision}</td></tr>
            ${reviewNotes ? `<tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Notes</td><td style="padding:8px">${reviewNotes}</td></tr>` : ''}
          </table>
        </div>
      </div>`,
  };
}

function auditDueReminder({ title, dueDate, pendingCount, daysLeft }) {
  return {
    subject: `⚠️ Audit Reminder: "${title}" due in ${daysLeft} day(s)`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <div style="background:#d97706;color:#fff;padding:24px;border-radius:8px 8px 0 0">
          <h2 style="margin:0">⚠️ Audit Due Soon</h2>
        </div>
        <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
          <p>The following audit is due soon and has pending items:</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px;color:#6b7280">Audit</td><td style="padding:8px;font-weight:600">${title}</td></tr>
            <tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Due Date</td><td style="padding:8px;font-weight:600">${dueDate}</td></tr>
            <tr><td style="padding:8px;color:#6b7280">Days Left</td><td style="padding:8px;font-weight:600;color:#d97706">${daysLeft} day(s)</td></tr>
            <tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Pending Items</td><td style="padding:8px;font-weight:600">${pendingCount}</td></tr>
          </table>
          <p style="color:#6b7280;font-size:14px">Please log in and complete your pending audit items before the due date.</p>
        </div>
      </div>`,
  };
}

module.exports = { sendMail, auditScheduleCreated, auditItemSubmitted, auditItemReviewed, auditDueReminder };
