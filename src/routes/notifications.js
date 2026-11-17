const express = require('express');
const { all } = require('../db');
const { flash } = require('../helpers');
const notifications = require('../notifications');

const router = express.Router();
router.use((req, res, next) => {
  if (!req.user) {
    flash(req, 'info', 'Please log in to continue.');
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  }
  next();
});

router.get('/', (req, res) => {
  const items = all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 100', req.user.id);
  res.render('notifications', { title: 'Notifications', items });
});

// Open one: mark it read, then go to the page it is about.
router.get('/:id', (req, res) => {
  const n = notifications.open(req.user.id, req.params.id);
  res.redirect((n && n.link) || '/notifications');
});

router.post('/read-all', (req, res) => {
  notifications.markAllRead(req.user.id);
  const back = req.get('referer') || '';
  res.redirect(back.startsWith(`${req.protocol}://${req.get('host')}/`) ? back : '/notifications');
});

module.exports = router;
