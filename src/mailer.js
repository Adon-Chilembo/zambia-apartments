// Sending email.
// With SMTP_HOST set in .env, emails are sent through that mail server.
// Without it, each email is saved as an HTML file in data/outbox/ so you can see exactly what would be sent.
// Emails are never sent to demo addresses (.test, .example, .invalid, .localhost).
const fs = require('node:fs');
const path = require('node:path');
const nodemailer = require('nodemailer');
const { run } = require('./db');

const SMTP_HOST = (process.env.SMTP_HOST || '').trim();
const mode = SMTP_HOST ? 'smtp' : 'outbox';
const FROM = process.env.MAIL_FROM || 'Zambia Apartments <no-reply@zambia-apartments.local>';
const OUTBOX_DIR = process.env.OUTBOX_DIR || path.join(__dirname, '..', 'data', 'outbox');
const DEMO_DOMAIN = /\.(test|example|invalid|localhost)$/i;

let transporter = null;
if (mode === 'smtp') {
  const port = Number(process.env.SMTP_PORT) || 587;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
} else {
  fs.mkdirSync(OUTBOX_DIR, { recursive: true });
}

function log(userId, to, kind, subject, status, detail = null) {
  try {
    run('INSERT INTO email_log (user_id, to_email, kind, subject, status, detail) VALUES (?, ?, ?, ?, ?, ?)', userId, to, kind, subject, status, detail);
  } catch (err) {
    console.error('Could not log email:', err.message);
  }
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function saveToOutbox(to, kind, subject, html) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeTo = to.replace(/[^a-z0-9@._-]/gi, '_');
  const file = path.join(OUTBOX_DIR, `${stamp}-${kind}-${safeTo}.html`);
  const header = `<div style="font:13px/1.5 system-ui,sans-serif;background:#fff8e6;border-bottom:1px solid #f0d58a;padding:10px 16px;color:#5c4400">
    <b>Saved, not sent</b> (no mail server configured)<br>
    <b>To:</b> ${escapeHtml(to)} &nbsp; <b>From:</b> ${escapeHtml(FROM)}<br><b>Subject:</b> ${escapeHtml(subject)}</div>`;
  fs.writeFileSync(file, html.replace('<body>', '<body>' + header));
  return file;
}

/**
 * Send one email. Never throws: failures are logged so the page the user is on still works.
 * @returns {Promise<string>} the status written to email_log
 */
async function send({ to, userId = null, kind, subject, html, text }) {
  if (!to) return 'skipped';
  if (mode === 'outbox') {
    try {
      const file = saveToOutbox(to, kind, subject, html);
      log(userId, to, kind, subject, 'saved', path.basename(file));
      return 'saved';
    } catch (err) {
      log(userId, to, kind, subject, 'failed', err.message);
      return 'failed';
    }
  }
  if (DEMO_DOMAIN.test(to.split('@')[1] || '')) {
    log(userId, to, kind, subject, 'skipped', 'demo address');
    return 'skipped';
  }
  try {
    const info = await transporter.sendMail({ from: FROM, to, subject, html, text });
    log(userId, to, kind, subject, 'sent', info.messageId || null);
    return 'sent';
  } catch (err) {
    console.error(`Email to ${to} failed:`, err.message);
    log(userId, to, kind, subject, 'failed', err.message);
    return 'failed';
  }
}

/** Check the mail server at startup. Logs the result; never throws. */
async function checkConnection() {
  if (mode !== 'smtp') return;
  try {
    await transporter.verify();
    console.log(`Mail server ${SMTP_HOST} accepted the connection.`);
  } catch (err) {
    console.error(`Mail server ${SMTP_HOST} refused the connection: ${err.message} - check SMTP settings in .env`);
  }
}

module.exports = { mode, OUTBOX_DIR, send, checkConnection, escapeHtml };
