// Public workers directory: search, profiles, CVs and reviews from landlords and tenants.
const express = require('express');
const { get, all, run } = require('../db');
const { flash } = require('../helpers');
const { TRADES, isTrade } = require('../trades');
const workers = require('../workers');
const notify = require('../notify');

const router = express.Router();

router.get('/', (req, res) => {
  const filters = {
    q: String(req.query.q || '').trim().slice(0, 80),
    trade: isTrade(req.query.trade) ? req.query.trade : '',
    city: String(req.query.city || '').trim().slice(0, 60),
    sort: ['reviews', 'new'].includes(req.query.sort) ? req.query.sort : '',
  };
  const results = workers.search(filters);
  const filtered = Boolean(filters.q || filters.trade || filters.city);
  const cities = all("SELECT DISTINCT city FROM workers WHERE city IS NOT NULL AND city != '' AND subscription_until >= date('now') ORDER BY city").map((r) => r.city);
  const tradeCounts = Object.fromEntries(
    all("SELECT trade, COUNT(*) AS n FROM workers WHERE subscription_until >= date('now') GROUP BY trade").map((r) => [r.trade, r.n])
  );
  res.render('workers/index', {
    title: 'Maintenance workers',
    results,
    top: filtered ? [] : workers.topList(),
    filters,
    filtered,
    cities,
    trades: TRADES,
    tradeCounts,
  });
});

router.get('/:id', (req, res) => {
  const w = workers.byId(req.params.id);
  const own = req.user && w && w.user_id === req.user.id;
  if (!w || (!w.listed && !own)) return res.status(404).render('error', { title: 'Not found', message: 'That maintenance worker is not listed right now.' });
  const reviews = workers.reviewsFor(w.id);
  const mine = req.user ? reviews.find((r) => r.reviewer_id === req.user.id) : null;
  const canReview = Boolean(req.user && ['landlord', 'tenant'].includes(req.user.role));
  res.render('workers/show', { title: w.name, w, reviews, mine, canReview, own });
});

// Landlords and tenants rate a worker (1 to 5 stars). Rating again replaces your earlier review.
router.post('/:id/review', (req, res) => {
  if (!req.user) {
    flash(req, 'info', 'Log in as a landlord or tenant to rate this maintenance worker.');
    return res.redirect('/login?next=' + encodeURIComponent('/workers/' + req.params.id));
  }
  if (!['landlord', 'tenant'].includes(req.user.role)) {
    flash(req, 'error', 'Only landlords and tenants can rate maintenance workers.');
    return res.redirect('/workers/' + req.params.id);
  }
  const w = get("SELECT id FROM workers WHERE id = ? AND subscription_until >= date('now')", req.params.id);
  if (!w) return res.redirect('/workers');
  const rating = Number(req.body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    flash(req, 'error', 'Choose between 1 and 5 stars.');
    return res.redirect('/workers/' + w.id + '#review');
  }
  const comment = String(req.body.comment || '').trim().slice(0, 1000);
  const before = get('SELECT id FROM worker_reviews WHERE worker_id = ? AND reviewer_id = ?', w.id, req.user.id);
  if (before) {
    run("UPDATE worker_reviews SET rating = ?, comment = ?, created_at = datetime('now') WHERE id = ?", rating, comment, before.id);
  } else {
    run('INSERT INTO worker_reviews (worker_id, reviewer_id, rating, comment) VALUES (?, ?, ?, ?)', w.id, req.user.id, rating, comment);
  }
  const review = get('SELECT id FROM worker_reviews WHERE worker_id = ? AND reviewer_id = ?', w.id, req.user.id);
  notify.workerReviewed(review.id);
  flash(req, 'success', before ? 'Your review was updated.' : 'Thank you for rating this maintenance worker.');
  res.redirect('/workers/' + w.id + '#reviews');
});

router.post('/:id/review/delete', (req, res) => {
  if (req.user) run('DELETE FROM worker_reviews WHERE worker_id = ? AND reviewer_id = ?', req.params.id, req.user.id);
  flash(req, 'info', 'Your review was removed.');
  res.redirect('/workers/' + req.params.id + '#reviews');
});

module.exports = router;
