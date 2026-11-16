// Account settings shared by landlords and tenants: phone number and email alerts.
const express = require('express');
const { get, all, run } = require('../db');
const { flash } = require('../helpers');
const mailer = require('../mailer');

const router = express.Router();

router.use((req, res, next) => {
  if (!req.user) {
    flash(req, 'info', 'Please log in to continue.');
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  }
  next();
});

router.get('/', (req, res) => {
  const me = get('SELECT id, name, email, phone, role, email_notifications, show_contact, whatsapp FROM users WHERE id = ?', req.user.id);
  const recent = all('SELECT kind, subject, status, created_at FROM email_log WHERE user_id = ? ORDER BY id DESC LIMIT 8', req.user.id);
  res.render('account', { title: 'Account', me, recent, mailMode: mailer.mode });
});

router.post('/', (req, res) => {
  run(
    'UPDATE users SET phone = ?, email_notifications = ? WHERE id = ?',
    String(req.body.phone || '').trim().slice(0, 40),
    req.body.email_notifications === 'on' ? 1 : 0,
    req.user.id
  );
  // Landlords choose whether visitors see their phone / WhatsApp on listings.
  if (req.user.role === 'landlord') {
    run(
      'UPDATE users SET show_contact = ?, whatsapp = ? WHERE id = ?',
      req.body.show_contact === 'on' ? 1 : 0,
      String(req.body.whatsapp || '').trim().slice(0, 40) || null,
      req.user.id
    );
  }
  flash(req, 'success', 'Your settings were saved.');
  res.redirect('/account');
});

module.exports = router;
