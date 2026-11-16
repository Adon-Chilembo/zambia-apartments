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
const services = require('./services');
const uploads = require('./uploads');
const multer = require('multer');

// Landing-page background. Default: a free Unsplash photo (Unsplash licence) saved in public/demo-photos.
// Override with HERO_IMAGE_URL.
const HERO_IMAGE_URL = process.env.HERO_IMAGE_URL || '/static/demo-photos/hero-home-at-dusk.jpg';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use('/static', express.static(path.join(__dirname, '..', 'public')));
// Landlord-uploaded apartment photos (random file names, images only).
app.use('/uploads', express.static(uploads.UPLOAD_DIR, { maxAge: '7d', index: false }));

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
  res.locals.svc = services;
  res.locals.heroImage = HERO_IMAGE_URL;
  delete req.session.flash;
  next();
});

app.use((req, res, next) => {
  // File-upload forms are multipart, so their token travels in the URL instead of the body.
  const token = (req.body && req.body._csrf) || req.query._csrf;
  if (req.method === 'POST' && token !== req.session.csrf) {
    return res.status(403).render('error', { title: 'Form expired', message: 'Your form expired. Go back, refresh the page and try again.' });
  }
  next();
});

app.use(require('./routes/public'));
app.use(require('./routes/auth'));
app.use('/tenant', require('./routes/tenant'));
app.use('/pay', require('./routes/pay'));
app.use('/landlord', require('./routes/landlord'));
app.use('/account', require('./routes/account'));

app.use((req, res) => res.status(404).render('error', { title: 'Not found', message: 'That page does not exist.' }));
app.use((err, req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: `A photo is too large. Each photo must be under ${uploads.MAX_FILE_MB} MB.`,
      LIMIT_FILE_COUNT: `Upload at most ${uploads.MAX_FILES_PER_UPLOAD} photos at a time.`,
    };
    helpers.flash(req, 'error', messages[err.code] || 'Upload failed: ' + err.message);
    return res.redirect(req.get('referer')?.startsWith(`${req.protocol}://${req.get('host')}/`) ? req.get('referer') : '/landlord');
  }
  console.error(err);
  res.status(500).render('error', { title: 'Something went wrong', message: 'An unexpected error occurred. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`Zambia Apartments running at http://localhost:${PORT}`);
  console.log(`Payments: ${payments.provider === 'flutterwave' ? `Flutterwave Mobile Money (${payments.keyMode} key)` : 'built-in Mobile Money simulator (no FLW_SECRET_KEY in .env)'}`);
  payments.checkKey();
  const mailer = require('./mailer');
  console.log(`Email: ${mailer.mode === 'smtp' ? 'sending through ' + process.env.SMTP_HOST : 'saving to ' + path.relative(process.cwd(), mailer.OUTBOX_DIR) + ' (no SMTP_HOST in .env)'}`);
  mailer.checkConnection();
});
