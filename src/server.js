const path = require('node:path');
const crypto = require('node:crypto');

// Load settings (e.g. PAYSTACK_SECRET_KEY) from .env if the file exists.
try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch (err) {
  if (err.code !== 'ENOENT') console.warn('Could not read .env:', err.message);
}

const express = require('express');
const session = require('express-session');
const { get } = require('./db');
const payments = require('./payments');
const helpers = require('./helpers');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use('/static', express.static(path.join(__dirname, '..', 'public')));

// Payment-provider webhooks send JSON, so mount before the form parser.
app.use('/webhooks', require('./routes/webhooks'));

app.use(express.urlencoded({ extended: false }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 },
  })
);

// Current user, flash messages, CSRF token and view helpers.
app.use((req, res, next) => {
  req.user = req.session.userId
    ? get('SELECT id, name, email, phone, role, occupation, emergency_contact FROM users WHERE id = ?', req.session.userId)
    : null;
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.locals.user = req.user;
  res.locals.csrf = req.session.csrf;
  res.locals.flash = req.session.flash || null;
  res.locals.path = req.path;
  res.locals.paymentProvider = payments.provider;
  res.locals.paymentKeyMode = payments.keyMode;
  res.locals.h = helpers;
  delete req.session.flash;
  next();
});

app.use((req, res, next) => {
  if (req.method === 'POST' && req.body._csrf !== req.session.csrf) {
    return res.status(403).render('error', { title: 'Form expired', message: 'Your form expired. Go back, refresh the page and try again.' });
  }
  next();
});

app.use(require('./routes/public'));
app.use(require('./routes/auth'));
app.use('/tenant', require('./routes/tenant'));
app.use('/pay', require('./routes/pay'));
app.use('/landlord', require('./routes/landlord'));

app.use((req, res) => res.status(404).render('error', { title: 'Not found', message: 'That page does not exist.' }));
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Something went wrong', message: 'An unexpected error occurred. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`Zambia Apartments running at http://localhost:${PORT}`);
  console.log(`Payments: ${payments.provider === 'flutterwave' ? `Flutterwave Mobile Money (${payments.keyMode} key)` : 'built-in Mobile Money simulator (no FLW_SECRET_KEY in .env)'}`);
  payments.checkKey();
});
