const express = require('express');
const { get, all, run } = require('../db');
const { flash, activeTenancy } = require('../helpers');

const router = express.Router();

router.get('/', (req, res) => {
  const { q = '', city = '', bedrooms = '', max_rent = '' } = req.query;
  const where = ["a.status = 'available'"];
  const params = [];
  if (q) {
    where.push('(a.title LIKE ? OR a.neighbourhood LIKE ? OR a.description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (city) {
    where.push('a.city = ?');
    params.push(city);
  }
  if (bedrooms) {
    where.push('a.bedrooms >= ?');
    params.push(Number(bedrooms));
  }
  if (max_rent) {
    where.push('a.rent_amount <= ?');
    params.push(Number(max_rent));
  }
  const apartments = all(
    `SELECT a.*, u.name AS landlord_name FROM apartments a JOIN users u ON u.id = a.landlord_id
      WHERE ${where.join(' AND ')} ORDER BY a.created_at DESC, a.id DESC`,
    ...params
  );
  const cities = all("SELECT DISTINCT city FROM apartments WHERE status = 'available' ORDER BY city").map((r) => r.city);
  const counts = get(
    "SELECT COUNT(*) AS total, COUNT(DISTINCT city) AS cities FROM apartments WHERE status = 'available'"
  );
  res.render('listings', { title: 'Available apartments', apartments, cities, counts, filters: { q, city, bedrooms, max_rent } });
});

router.get('/apartments/:id', (req, res) => {
  const apartment = get(
    `SELECT a.*, u.name AS landlord_name FROM apartments a JOIN users u ON u.id = a.landlord_id WHERE a.id = ?`,
    req.params.id
  );
  if (!apartment) return res.status(404).render('error', { title: 'Not found', message: 'That apartment does not exist.' });

  let applyState = 'guest';
  if (req.user?.role === 'landlord') applyState = apartment.landlord_id === req.user.id ? 'owner' : 'landlord';
  else if (req.user?.role === 'tenant') {
    if (activeTenancy(req.user.id)) applyState = 'has_home';
    else if (get("SELECT id FROM applications WHERE apartment_id = ? AND tenant_id = ? AND status = 'pending'", apartment.id, req.user.id))
      applyState = 'applied';
    else applyState = 'can_apply';
  }
  if (apartment.status !== 'available' && applyState !== 'owner') applyState = 'taken';

  res.render('apartment', { title: apartment.title, apartment, applyState });
});

router.post('/apartments/:id/apply', (req, res) => {
  if (!req.user || req.user.role !== 'tenant') {
    flash(req, 'info', 'Log in or create a tenant account to apply.');
    return res.redirect('/login?next=' + encodeURIComponent('/apartments/' + req.params.id));
  }
  const apartment = get('SELECT * FROM apartments WHERE id = ?', req.params.id);
  if (!apartment || apartment.status !== 'available') {
    flash(req, 'error', 'This apartment is no longer available.');
    return res.redirect('/');
  }
  if (activeTenancy(req.user.id)) {
    flash(req, 'error', 'You are already connected to an apartment.');
    return res.redirect('/tenant');
  }
  const existing = get(
    "SELECT id FROM applications WHERE apartment_id = ? AND tenant_id = ? AND status = 'pending'",
    apartment.id,
    req.user.id
  );
  if (!existing) {
    run(
      'INSERT INTO applications (apartment_id, tenant_id, message) VALUES (?, ?, ?)',
      apartment.id,
      req.user.id,
      String(req.body.message || '').slice(0, 1000)
    );
  }
  flash(req, 'success', `Application sent for ${apartment.title}. The landlord will review it.`);
  res.redirect('/tenant');
});

module.exports = router;
