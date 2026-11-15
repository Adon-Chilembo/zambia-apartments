const express = require('express');
const bcrypt = require('bcryptjs');
const { get, run } = require('../db');
const { flash } = require('../helpers');

const router = express.Router();

const safeNext = (n) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : null);
const home = (user) => (user.role === 'landlord' ? '/landlord' : '/tenant');

router.get('/login', (req, res) => {
  if (req.user) return res.redirect(home(req.user));
  res.render('login', { title: 'Log in', next: safeNext(req.query.next) || '', email: '' });
});

router.post('/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = get('SELECT * FROM users WHERE email = ?', email);
  if (!user || !bcrypt.compareSync(String(req.body.password || ''), user.password_hash)) {
    return res.status(401).render('login', {
      title: 'Log in',
      next: safeNext(req.body.next) || '',
      email,
      error: 'Wrong email or password.',
    });
  }
  req.session.regenerate((err) => {
    if (err) throw err;
    req.session.userId = user.id;
    flash(req, 'success', `Welcome back, ${user.name.split(' ')[0]}.`);
    res.redirect(safeNext(req.body.next) || home(user));
  });
});

router.get('/register', (req, res) => {
  if (req.user) return res.redirect(home(req.user));
  const role = req.query.role === 'landlord' ? 'landlord' : 'tenant';
  res.render('register', { title: 'Create account', form: { role, code: req.query.code || '' }, next: safeNext(req.query.next) || '' });
});

router.post('/register', (req, res) => {
  const form = {
    name: String(req.body.name || '').trim(),
    email: String(req.body.email || '').trim().toLowerCase(),
    phone: String(req.body.phone || '').trim(),
    role: req.body.role === 'landlord' ? 'landlord' : 'tenant',
    code: String(req.body.code || '').trim().toUpperCase(),
  };
  const password = String(req.body.password || '');
  let error = null;
  if (!form.name || !form.email) error = 'Name and email are required.';
  else if (!/^\S+@\S+\.\S+$/.test(form.email)) error = 'Enter a valid email address.';
  else if (password.length < 8) error = 'Password must be at least 8 characters.';
  else if (get('SELECT id FROM users WHERE email = ?', form.email)) error = 'An account with that email already exists.';
  if (error) return res.status(400).render('register', { title: 'Create account', form, error, next: safeNext(req.body.next) || '' });

  const result = run(
    'INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    form.name,
    form.email,
    form.phone,
    bcrypt.hashSync(password, 10),
    form.role
  );
  req.session.regenerate((err) => {
    if (err) throw err;
    req.session.userId = Number(result.lastInsertRowid);
    req.session.csrf = null;
    if (form.role === 'tenant' && form.code) {
      req.session.pendingInvite = form.code;
    }
    flash(req, 'success', 'Your account is ready.');
    res.redirect(safeNext(req.body.next) || (form.role === 'landlord' ? '/landlord' : '/tenant'));
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
