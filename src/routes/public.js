const express = require('express');
const { get, all, run } = require('../db');
const { flash, activeTenancy, parseOccupants } = require('../helpers');
const { SERVICES, parseServices } = require('../services');
const notify = require('../notify');
const fees = require('../fees');

// Only apartments whose listing fee is paid show on the site.
const LISTED = "a.listing_paid_until >= date('now')";

const router = express.Router();

// The cover photo is the apartment's first photo by sort order.
const COVER_SQL = '(SELECT filename FROM apartment_photos p WHERE p.apartment_id = a.id ORDER BY sort_order, id LIMIT 1) AS cover';
const PHOTO_COUNT_SQL = '(SELECT COUNT(*) FROM apartment_photos p WHERE p.apartment_id = a.id) AS photo_count';
// All of an apartment's photos in order, for the slideshow on the listing cards.
const PHOTO_LIST_SQL = `(SELECT group_concat(filename, char(10)) FROM
    (SELECT filename FROM apartment_photos p WHERE p.apartment_id = a.id ORDER BY sort_order, id)) AS photo_list`;

router.get('/', (req, res) => {
  const { q = '', city = '', bedrooms = '', max_rent = '' } = req.query;
  // Show every apartment, vacant and occupied; vacant ones come first.
  const where = [LISTED];
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
    `SELECT a.*, u.name AS landlord_name, ${COVER_SQL}, ${PHOTO_COUNT_SQL}, ${PHOTO_LIST_SQL}
       FROM apartments a JOIN users u ON u.id = a.landlord_id
      WHERE ${where.join(' AND ')} ORDER BY (a.status = 'available') DESC, a.created_at DESC, a.id DESC`,
    ...params
  ).map((a) => ({ ...a, serviceList: parseServices(a.services), photos: a.photo_list ? a.photo_list.split('\n') : [] }));
  const cities = all(`SELECT DISTINCT city FROM apartments a WHERE ${LISTED} ORDER BY city`).map((r) => r.city);
  const counts = get(
    `SELECT COUNT(*) AS total, COUNT(DISTINCT city) AS cities, COUNT(DISTINCT landlord_id) AS landlords,
            MIN(rent_amount) AS from_rent
       FROM apartments a WHERE status = 'available' AND ${LISTED}`
  );

  // The services offered most often across available apartments, for the "what you'll find" section.
  const tally = {};
  all(`SELECT services FROM apartments a WHERE status = 'available' AND ${LISTED}`).forEach((r) =>
    parseServices(r.services).forEach((s) => (tally[s.key] = (tally[s.key] || 0) + 1))
  );
  const popularServices = SERVICES.filter((s) => tally[s.key]).sort((a, b) => tally[b.key] - tally[a.key]).slice(0, 8);

  const filtered = Boolean(q || city || bedrooms || max_rent);
  const vacantCount = apartments.filter((a) => a.status === 'available').length;
  const occupiedCount = apartments.length - vacantCount;
  res.render('listings', {
    title: 'Find your next home in Zambia',
    bare: true,
    apartments,
    cities,
    counts,
    popularServices,
    vacantCount,
    occupiedCount,
    filtered,
    filters: { q, city, bedrooms, max_rent },
  });
});

router.get('/apartments/:id', (req, res) => {
  const apartment = get(
    `SELECT a.*, u.name AS landlord_name, u.phone AS landlord_phone, u.email AS landlord_email,
            u.whatsapp AS landlord_whatsapp, u.show_contact AS landlord_show_contact
       FROM apartments a JOIN users u ON u.id = a.landlord_id WHERE a.id = ?`,
    req.params.id
  );
  if (!apartment) return res.status(404).render('error', { title: 'Not found', message: 'That apartment does not exist.' });
  // An apartment whose listing fee isn't paid is only visible to its landlord and current tenant.
  if (!fees.active(apartment.listing_paid_until)) {
    const owner = req.user && req.user.id === apartment.landlord_id;
    const tenant = req.user && get("SELECT id FROM tenancies WHERE apartment_id = ? AND tenant_id = ? AND status = 'active'", apartment.id, req.user.id);
    if (!owner && !tenant) return res.status(404).render('error', { title: 'Not listed', message: 'This apartment is not listed on the site right now.' });
  }

  let applyState = 'guest';
  if (req.user?.role === 'landlord') applyState = apartment.landlord_id === req.user.id ? 'owner' : 'landlord';
  else if (req.user?.role === 'tenant') {
    if (activeTenancy(req.user.id)) applyState = 'has_home';
    else if (get("SELECT id FROM applications WHERE apartment_id = ? AND tenant_id = ? AND status = 'pending'", apartment.id, req.user.id))
      applyState = 'applied';
    else applyState = 'can_apply';
  }
  if (apartment.status !== 'available' && applyState !== 'owner') applyState = 'taken';

  const photos = all('SELECT * FROM apartment_photos WHERE apartment_id = ? ORDER BY sort_order, id', apartment.id);
  res.render('apartment', {
    title: apartment.title,
    bare: true,
    apartment,
    applyState,
    photos,
    serviceList: parseServices(apartment.services),
  });
});

router.post('/apartments/:id/apply', (req, res) => {
  if (!req.user || req.user.role !== 'tenant') {
    flash(req, 'info', 'Log in or create a tenant account to apply.');
    return res.redirect('/login?next=' + encodeURIComponent('/apartments/' + req.params.id));
  }
  const apartment = get('SELECT * FROM apartments WHERE id = ?', req.params.id);
  if (!apartment || apartment.status !== 'available' || !fees.active(apartment.listing_paid_until)) {
    flash(req, 'error', 'This apartment is no longer available.');
    return res.redirect('/');
  }
  if (activeTenancy(req.user.id)) {
    flash(req, 'error', 'You are already connected to an apartment.');
    return res.redirect('/tenant');
  }
  const occupants = parseOccupants(req.body.occupants);
  if (!occupants) {
    flash(req, 'error', 'Enter how many people will live in the apartment (including you).');
    return res.redirect('/apartments/' + apartment.id);
  }
  const existing = get(
    "SELECT id FROM applications WHERE apartment_id = ? AND tenant_id = ? AND status = 'pending'",
    apartment.id,
    req.user.id
  );
  if (!existing) {
    const r = run(
      'INSERT INTO applications (apartment_id, tenant_id, message, occupants, household_note) VALUES (?, ?, ?, ?, ?)',
      apartment.id,
      req.user.id,
      String(req.body.message || '').slice(0, 1000),
      occupants,
      String(req.body.household_note || '').trim().slice(0, 500)
    );
    notify.applicationReceived(Number(r.lastInsertRowid));
  }
  flash(req, 'success', `Application sent for ${apartment.title}. The landlord will review it.`);
  res.redirect('/tenant');
});

module.exports = router;
