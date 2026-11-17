// A worker's own area: profile & CV, listing plan, top-list promotion and reviews.
const express = require('express');
const { get, all, run } = require('../db');
const { flash, requireRole } = require('../helpers');
const { isTrade } = require('../trades');
const uploads = require('../uploads');
const workers = require('../workers');

const router = express.Router();
router.use(requireRole('worker'));

/** Every worker account has a profile row; make it on first visit. */
function ensureProfile(userId) {
  if (!get('SELECT id FROM workers WHERE user_id = ?', userId)) run('INSERT INTO workers (user_id) VALUES (?)', userId);
  return workers.byUser(userId);
}

router.get('/', (req, res) => {
  const w = ensureProfile(req.user.id);
  const reviews = workers.reviewsFor(w.id);
  const feeHistory = all("SELECT * FROM fee_payments WHERE user_id = ? AND kind IN ('worker','featured') ORDER BY id DESC LIMIT 20", req.user.id);
  const complete = Boolean(w.headline && w.bio && w.city);
  const tab = ['profile', 'plan', 'reviews'].includes(req.query.tab) ? req.query.tab : complete ? 'plan' : 'profile';
  res.render('worker/dashboard', { title: 'My services', w, reviews, feeHistory, complete, tab });
});

router.post('/profile', (req, res, next) => {
  // Multipart form: the CSRF token travels in the URL and is checked before this runs.
  uploads.workerUpload(req, res, (err) => {
    if (err) return next(err);
    const w = ensureProfile(req.user.id);
    const cv = req.files && req.files.cv && req.files.cv[0];
    const photo = req.files && req.files.photo && req.files.photo[0];
    if (cv && !uploads.isRealPdf(cv.path)) {
      uploads.removeFile(cv.filename);
      if (photo) uploads.removeFile(photo.filename);
      flash(req, 'error', 'Your CV must be a PDF file.');
      return res.redirect('/worker?tab=profile');
    }
    if (photo && !uploads.isRealImage(photo.path)) {
      uploads.removeFile(photo.filename);
      if (cv) uploads.removeFile(cv.filename);
      flash(req, 'error', 'Your photo must be a JPG, PNG or WebP image.');
      return res.redirect('/worker?tab=profile');
    }
    const b = req.body;
    const years = parseInt(b.experience_years, 10);
    run(
      `UPDATE workers SET trade = ?, headline = ?, bio = ?, skills = ?, experience_years = ?, city = ?, areas = ?, rates = ?,
              cv_filename = COALESCE(?, cv_filename), photo_filename = COALESCE(?, photo_filename) WHERE id = ?`,
      isTrade(b.trade) ? b.trade : 'other',
      String(b.headline || '').trim().slice(0, 120),
      String(b.bio || '').trim().slice(0, 4000),
      String(b.skills || '').trim().slice(0, 500),
      Number.isInteger(years) && years >= 0 && years <= 60 ? years : null,
      String(b.city || '').trim().slice(0, 60),
      String(b.areas || '').trim().slice(0, 200),
      String(b.rates || '').trim().slice(0, 200),
      cv ? cv.filename : null,
      photo ? photo.filename : null,
      w.id
    );
    if (cv && w.cv_filename) uploads.removeFile(w.cv_filename);
    if (photo && w.photo_filename) uploads.removeFile(w.photo_filename);
    run('UPDATE users SET phone = ?, whatsapp = ? WHERE id = ?', String(b.phone || '').trim().slice(0, 40), String(b.whatsapp || '').trim().slice(0, 40) || null, req.user.id);
    flash(req, 'success', w.listed ? 'Your profile was saved.' : 'Your profile was saved. Pay the monthly fee to appear in the maintenance workers list.');
    res.redirect(w.listed ? '/worker?tab=profile' : '/worker?tab=plan');
  });
});

router.post('/cv/delete', (req, res) => {
  const w = ensureProfile(req.user.id);
  if (w.cv_filename) {
    uploads.removeFile(w.cv_filename);
    run('UPDATE workers SET cv_filename = NULL WHERE id = ?', w.id);
  }
  flash(req, 'info', 'Your CV was removed.');
  res.redirect('/worker?tab=profile');
});

module.exports = router;
