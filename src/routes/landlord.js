const crypto = require('node:crypto');
const express = require('express');
const { get, all, run, transaction } = require('../db');
const { flash, requireRole, currentPeriod } = require('../helpers');
const { cleanServices } = require('../services');
const uploads = require('../uploads');
const notify = require('../notify');
const rooms = require('../rooms');

const router = express.Router();
router.use(requireRole('landlord'));
router.use((req, res, next) => {
  const seg = req.path.split('/')[1];
  res.locals.section = { '': 'dashboard', apartments: 'dashboard', tenants: 'tenants', issues: 'issues', payments: 'payments' }[seg] || '';
  next();
});

/** Load an apartment only if it belongs to the logged-in landlord. */
function ownApartment(req, id) {
  return get('SELECT * FROM apartments WHERE id = ? AND landlord_id = ?', id, req.user.id);
}

function apartmentFields(body) {
  return {
    title: String(body.title || '').trim().slice(0, 120),
    neighbourhood: String(body.neighbourhood || '').trim().slice(0, 80),
    city: String(body.city || '').trim().slice(0, 60),
    bedrooms: Math.max(0, Math.min(20, parseInt(body.bedrooms, 10) || 1)),
    bathrooms: Math.max(0, Math.min(20, parseInt(body.bathrooms, 10) || 1)),
    rent_amount: Math.max(0, Number(body.rent_amount) || 0),
    description: String(body.description || '').slice(0, 4000),
    amenities: String(body.amenities || '').slice(0, 500),
    services: cleanServices(body.services),
    address: String(body.address || '').trim().slice(0, 200),
  };
}

const TENANT_ROWS = `
  SELECT a.id AS apartment_id, a.title, a.neighbourhood, a.city, a.rent_amount, a.address, a.bedrooms, a.bathrooms,
         (SELECT filename FROM apartment_photos p WHERE p.apartment_id = a.id ORDER BY sort_order, id LIMIT 1) AS cover,
         t.id AS tenancy_id, t.start_date, t.occupants, t.household_note,
         u.id AS tenant_id, u.name, u.email, u.phone, u.occupation, u.emergency_contact,
         (SELECT COUNT(*) FROM issues i WHERE i.tenancy_id = t.id AND i.status != 'resolved') AS open_issues,
         (SELECT COUNT(*) FROM payments p WHERE p.tenancy_id = t.id AND p.status = 'success' AND p.period = ?) AS paid_this_month,
         (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.tenancy_id = t.id AND p.status = 'success') AS total_paid,
         (SELECT MAX(paid_at) FROM payments p WHERE p.tenancy_id = t.id AND p.status = 'success') AS last_paid
    FROM tenancies t
    JOIN apartments a ON a.id = t.apartment_id
    JOIN users u ON u.id = t.tenant_id
   WHERE a.landlord_id = ? AND t.status = 'active'`;

router.get('/', (req, res) => {
  const lid = req.user.id;
  const month = currentPeriod();
  const apartments = all(
    `SELECT a.*,
            u.name AS tenant_name, t.occupants AS tenant_occupants, t.start_date AS tenant_since,
            (SELECT COUNT(*) FROM payments p WHERE p.tenancy_id = t.id AND p.status = 'success' AND p.period = ?) AS paid_this_month,
            (SELECT COUNT(*) FROM issues i WHERE i.apartment_id = a.id AND i.status != 'resolved') AS open_issues,
            (SELECT COUNT(*) FROM applications ap WHERE ap.apartment_id = a.id AND ap.status = 'pending') AS pending_apps,
            (SELECT COUNT(*) FROM apartment_photos p WHERE p.apartment_id = a.id) AS photo_count,
            (SELECT filename FROM apartment_photos p WHERE p.apartment_id = a.id ORDER BY sort_order, id LIMIT 1) AS cover
       FROM apartments a
       LEFT JOIN tenancies t ON t.apartment_id = a.id AND t.status = 'active'
       LEFT JOIN users u ON u.id = t.tenant_id
      WHERE a.landlord_id = ? ORDER BY a.status DESC, a.title`,
    month,
    lid
  );
  const tenants = all(TENANT_ROWS + ' ORDER BY u.name', month, lid);
  const applications = all(
    `SELECT ap.*, a.title, u.name, u.email, u.phone, u.occupation FROM applications ap
       JOIN apartments a ON a.id = ap.apartment_id JOIN users u ON u.id = ap.tenant_id
      WHERE a.landlord_id = ? AND ap.status = 'pending' ORDER BY ap.created_at`,
    lid
  );
  const issues = all(
    `SELECT i.*, a.title AS apartment_title, u.name AS tenant_name FROM issues i
       JOIN apartments a ON a.id = i.apartment_id JOIN users u ON u.id = i.tenant_id
      WHERE a.landlord_id = ? AND i.status != 'resolved'
      ORDER BY CASE i.urgency WHEN 'urgent' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, i.created_at DESC LIMIT 6`,
    lid
  );
  const recentPayments = all(
    `SELECT p.*, a.title AS apartment_title, u.name AS tenant_name FROM payments p
       JOIN apartments a ON a.id = p.apartment_id JOIN users u ON u.id = p.tenant_id
      WHERE a.landlord_id = ? ORDER BY p.created_at DESC, p.id DESC LIMIT 6`,
    lid
  );
  const collected = get(
    `SELECT COALESCE(SUM(p.amount),0) AS total FROM payments p JOIN apartments a ON a.id = p.apartment_id
      WHERE a.landlord_id = ? AND p.status = 'success' AND p.period = ?`,
    lid,
    month
  ).total;
  const expected = tenants.reduce((s, t) => s + t.rent_amount, 0);

  res.render('landlord/dashboard', {
    title: 'Landlord dashboard',
    apartments,
    tenants,
    applications,
    issues,
    recentPayments,
    month,
    stats: {
      units: apartments.length,
      occupied: apartments.filter((a) => a.status === 'occupied').length,
      openIssues: apartments.reduce((s, a) => s + a.open_issues, 0),
      collected,
      expected,
      unpaid: tenants.filter((t) => !t.paid_this_month).length,
    },
  });
});

router.get('/tenants', (req, res) => {
  const month = currentPeriod();
  const tenants = all(TENANT_ROWS + ' ORDER BY u.name', month, req.user.id);
  res.render('landlord/tenants', { title: 'Tenants', tenants, month });
});

router.get('/issues', (req, res) => {
  const status = ['open', 'in_progress', 'resolved'].includes(req.query.status) ? req.query.status : '';
  const kind = ['problem', 'improvement'].includes(req.query.kind) ? req.query.kind : '';
  const where = ['a.landlord_id = ?'];
  const params = [req.user.id];
  if (status) where.push('i.status = ?'), params.push(status);
  if (kind) where.push('i.kind = ?'), params.push(kind);
  const issues = all(
    `SELECT i.*, a.title AS apartment_title, u.name AS tenant_name, u.phone AS tenant_phone FROM issues i
       JOIN apartments a ON a.id = i.apartment_id JOIN users u ON u.id = i.tenant_id
      WHERE ${where.join(' AND ')}
      ORDER BY CASE i.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
               CASE i.urgency WHEN 'urgent' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, i.created_at DESC`,
    ...params
  );
  res.render('landlord/issues', { title: 'Problems & suggestions', issues, filters: { status, kind } });
});

router.get('/payments', (req, res) => {
  const payments = all(
    `SELECT p.*, a.title AS apartment_title, u.name AS tenant_name FROM payments p
       JOIN apartments a ON a.id = p.apartment_id JOIN users u ON u.id = p.tenant_id
      WHERE a.landlord_id = ? ORDER BY p.created_at DESC, p.id DESC`,
    req.user.id
  );
  const total = payments.filter((p) => p.status === 'success').reduce((s, p) => s + p.amount, 0);
  res.render('landlord/payments', { title: 'Payments', payments, total });
});

router.get('/apartments/new', (req, res) => {
  res.render('landlord/apartment-form', { title: 'Add apartment', apartment: { bedrooms: 1, bathrooms: 1 } });
});

router.post('/apartments', (req, res) => {
  const f = apartmentFields(req.body);
  if (!f.title || !f.neighbourhood || !f.city || !f.rent_amount) {
    return res.status(400).render('landlord/apartment-form', {
      title: 'Add apartment',
      apartment: f,
      error: 'Title, neighbourhood, city and monthly rent are required.',
    });
  }
  const r = run(
    `INSERT INTO apartments (landlord_id, title, neighbourhood, city, bedrooms, bathrooms, rent_amount, description, amenities, services, address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    req.user.id, f.title, f.neighbourhood, f.city, f.bedrooms, f.bathrooms, f.rent_amount, f.description, f.amenities, f.services, f.address
  );
  flash(req, 'success', 'Apartment saved. Add photos, then pay the listing fee to show it on the site.');
  res.redirect('/landlord/apartments/' + r.lastInsertRowid + '?tab=photos');
});

router.get('/apartments/:id', (req, res) => {
  const apartment = ownApartment(req, req.params.id);
  if (!apartment) return res.status(404).render('error', { title: 'Not found', message: 'Apartment not found.' });
  const tenant = get(
    `SELECT t.id AS tenancy_id, t.start_date, t.occupants, t.household_note, u.id, u.name, u.email, u.phone, u.occupation, u.emergency_contact
       FROM tenancies t JOIN users u ON u.id = t.tenant_id WHERE t.apartment_id = ? AND t.status = 'active'`,
    apartment.id
  );
  const issues = all('SELECT i.*, u.name AS tenant_name FROM issues i JOIN users u ON u.id = i.tenant_id WHERE i.apartment_id = ? ORDER BY i.created_at DESC, i.id DESC', apartment.id);
  const paymentRows = all('SELECT p.*, u.name AS tenant_name FROM payments p JOIN users u ON u.id = p.tenant_id WHERE p.apartment_id = ? ORDER BY p.created_at DESC, p.id DESC', apartment.id);
  const applications = all(
    `SELECT ap.*, u.name, u.email, u.phone, u.occupation FROM applications ap JOIN users u ON u.id = ap.tenant_id
      WHERE ap.apartment_id = ? AND ap.status = 'pending' ORDER BY ap.created_at`,
    apartment.id
  );
  const invites = all('SELECT i.*, u.name AS used_by_name FROM invites i LEFT JOIN users u ON u.id = i.used_by WHERE i.apartment_id = ? ORDER BY i.created_at DESC', apartment.id);
  const pastTenants = all(
    `SELECT t.*, u.name FROM tenancies t JOIN users u ON u.id = t.tenant_id WHERE t.apartment_id = ? AND t.status = 'ended' ORDER BY t.end_date DESC`,
    apartment.id
  );
  const photos = all('SELECT * FROM apartment_photos WHERE apartment_id = ? ORDER BY sort_order, id', apartment.id);
  const tab = ['tenant', 'issues', 'payments', 'photos', 'edit', 'listing'].includes(req.query.tab) ? req.query.tab : 'tenant';
  const listingFees = all("SELECT * FROM fee_payments WHERE kind = 'listing' AND target_id = ? ORDER BY id DESC LIMIT 20", apartment.id);
  res.render('landlord/apartment', {
    title: apartment.title,
    apartment,
    tenant,
    issues,
    payments: paymentRows,
    applications,
    invites,
    pastTenants,
    photos,
    uploadLimits: uploads,
    listingFees,
    tab,
    paidThisMonth: tenant && paymentRows.some((p) => p.tenant_id === tenant.id && p.period === currentPeriod() && p.status === 'success'),
  });
});

router.post('/apartments/:id', (req, res) => {
  const apartment = ownApartment(req, req.params.id);
  if (!apartment) return res.redirect('/landlord');
  const f = apartmentFields(req.body);
  if (!f.title || !f.neighbourhood || !f.city || !f.rent_amount) {
    flash(req, 'error', 'Title, neighbourhood, city and monthly rent are required.');
    return res.redirect(`/landlord/apartments/${apartment.id}?tab=edit`);
  }
  run(
    `UPDATE apartments SET title=?, neighbourhood=?, city=?, bedrooms=?, bathrooms=?, rent_amount=?, description=?, amenities=?, services=?, address=? WHERE id=?`,
    f.title, f.neighbourhood, f.city, f.bedrooms, f.bathrooms, f.rent_amount, f.description, f.amenities, f.services, f.address, apartment.id
  );
  flash(req, 'success', 'Apartment updated.');
  res.redirect(`/landlord/apartments/${apartment.id}?tab=edit`);
});

router.post('/apartments/:id/invites', (req, res) => {
  const apartment = ownApartment(req, req.params.id);
  if (!apartment) return res.redirect('/landlord');
  if (apartment.status !== 'available') {
    flash(req, 'error', 'This apartment already has a tenant. End the current tenancy first.');
    return res.redirect(`/landlord/apartments/${apartment.id}`);
  }
  const code = crypto.randomBytes(4).toString('hex').toUpperCase().replace(/(.{4})/, '$1-');
  run(
    'INSERT INTO invites (code, apartment_id, landlord_id, tenant_name, tenant_email) VALUES (?, ?, ?, ?, ?)',
    code,
    apartment.id,
    req.user.id,
    String(req.body.tenant_name || '').trim().slice(0, 100),
    String(req.body.tenant_email || '').trim().slice(0, 120)
  );
  flash(req, 'success', `Invite code ${code} created. Give it to your tenant so they can connect.`);
  res.redirect(`/landlord/apartments/${apartment.id}`);
});

router.post('/invites/:id/delete', (req, res) => {
  const invite = get('SELECT * FROM invites WHERE id = ? AND landlord_id = ? AND used_by IS NULL', req.params.id, req.user.id);
  if (invite) run('DELETE FROM invites WHERE id = ?', invite.id);
  flash(req, 'info', 'Invite cancelled.');
  res.redirect(invite ? `/landlord/apartments/${invite.apartment_id}` : '/landlord');
});

router.post('/applications/:id/:decision', (req, res) => {
  const app = get(
    `SELECT ap.*, a.status AS apartment_status, a.title FROM applications ap JOIN apartments a ON a.id = ap.apartment_id
      WHERE ap.id = ? AND a.landlord_id = ? AND ap.status = 'pending'`,
    req.params.id,
    req.user.id
  );
  const back = req.body.back === 'apartment' && app ? `/landlord/apartments/${app.apartment_id}` : '/landlord';
  if (!app) return res.redirect(back);

  if (req.params.decision === 'approve') {
    if (app.apartment_status !== 'available') {
      flash(req, 'error', 'This apartment already has a tenant.');
      return res.redirect(back);
    }
    if (get("SELECT id FROM tenancies WHERE tenant_id = ? AND status = 'active'", app.tenant_id)) {
      run("UPDATE applications SET status = 'rejected' WHERE id = ?", app.id);
      flash(req, 'error', 'That applicant has already moved into another apartment.');
      return res.redirect(back);
    }
    // Other people who applied for this apartment are told it has been taken.
    const othersApplied = all(
      "SELECT id FROM applications WHERE apartment_id = ? AND status = 'pending' AND id != ?",
      app.apartment_id,
      app.id
    ).map((r) => r.id);
    transaction(() => {
      run("UPDATE applications SET status = 'approved' WHERE id = ?", app.id);
      run("UPDATE applications SET status = 'rejected' WHERE apartment_id = ? AND status = 'pending'", app.apartment_id);
      run("UPDATE applications SET status = 'rejected' WHERE tenant_id = ? AND status = 'pending'", app.tenant_id);
      run('INSERT INTO tenancies (apartment_id, tenant_id, occupants, household_note) VALUES (?, ?, ?, ?)', app.apartment_id, app.tenant_id, app.occupants, app.household_note);
      run("UPDATE apartments SET status = 'occupied' WHERE id = ?", app.apartment_id);
    });
    notify.applicationDecided(app.id);
    othersApplied.forEach((id) => notify.applicationDecided(id, 'taken'));
    flash(req, 'success', `Application approved. The tenant is now connected to ${app.title} and has been emailed.`);
  } else {
    run("UPDATE applications SET status = 'rejected' WHERE id = ?", app.id);
    notify.applicationDecided(app.id);
    flash(req, 'info', 'Application declined. The applicant has been emailed.');
  }
  res.redirect(back);
});

router.post('/issues/:id', (req, res) => {
  const issue = get(
    'SELECT i.* FROM issues i JOIN apartments a ON a.id = i.apartment_id WHERE i.id = ? AND a.landlord_id = ?',
    req.params.id,
    req.user.id
  );
  if (!issue) return res.redirect('/landlord/issues');
  const status = ['open', 'in_progress', 'resolved'].includes(req.body.status) ? req.body.status : issue.status;
  const response = String(req.body.landlord_response || '').slice(0, 2000);
  run(
    "UPDATE issues SET status = ?, landlord_response = ?, updated_at = datetime('now') WHERE id = ?",
    status,
    response,
    issue.id
  );
  // Only email the tenant when something they'd notice changed.
  const changed = status !== issue.status || response.trim() !== String(issue.landlord_response || '').trim();
  if (changed) notify.issueUpdated(issue.id);
  flash(req, 'success', changed ? 'Update saved. The tenant can see it and has been emailed.' : 'Nothing changed.');
  const back = String(req.body.back || '');
  res.redirect(back.startsWith('/landlord') ? back : '/landlord/issues');
});

router.post('/tenancies/:id/end', (req, res) => {
  const t = get(
    `SELECT t.* FROM tenancies t JOIN apartments a ON a.id = t.apartment_id WHERE t.id = ? AND a.landlord_id = ? AND t.status = 'active'`,
    req.params.id,
    req.user.id
  );
  if (!t) return res.redirect('/landlord');
  transaction(() => {
    run("UPDATE tenancies SET status = 'ended', end_date = date('now') WHERE id = ?", t.id);
    run("UPDATE apartments SET status = 'available' WHERE id = ?", t.apartment_id);
  });
  flash(req, 'info', 'Tenancy ended. The apartment is listed as available again.');
  res.redirect(`/landlord/apartments/${t.apartment_id}`);
});

// ---- Photos -------------------------------------------------------------

/** Load a photo only if its apartment belongs to the logged-in landlord. */
function ownPhoto(req, id) {
  return get(
    `SELECT p.* FROM apartment_photos p JOIN apartments a ON a.id = p.apartment_id WHERE p.id = ? AND a.landlord_id = ?`,
    id,
    req.user.id
  );
}

const photosTab = (aptId, room) => `/landlord/apartments/${aptId}?tab=photos` + (room ? '#room-' + room : '');

// Check ownership before multer writes anything to disk.
function requireOwnApartment(req, res, next) {
  req.apartment = ownApartment(req, req.params.id);
  if (!req.apartment) return res.status(404).render('error', { title: 'Not found', message: 'Apartment not found.' });
  next();
}

router.post('/apartments/:id/photos', requireOwnApartment, uploads.upload.array('photos', uploads.MAX_FILES_PER_UPLOAD), (req, res) => {
  const apt = req.apartment;
  const files = req.files || [];
  const room = String(req.body.room || '');
  if (!rooms.isRoom(room)) {
    files.forEach((file) => uploads.removeFile(file.filename));
    flash(req, 'error', 'Choose which room these photos show.');
    return res.redirect(photosTab(apt.id));
  }
  const roomLabel = rooms.roomOf(room).label;
  const good = files.filter((file) => uploads.isRealImage(file.path));
  files.filter((file) => !good.includes(file)).forEach((file) => uploads.removeFile(file.filename));

  const existing = get('SELECT COUNT(*) AS n, COALESCE(MAX(sort_order), -1) AS last FROM apartment_photos WHERE apartment_id = ?', apt.id);
  const space = Math.max(0, uploads.MAX_PHOTOS_PER_APARTMENT - existing.n);
  const kept = good.slice(0, space);
  good.slice(space).forEach((file) => uploads.removeFile(file.filename));

  const caption = String(req.body.caption || '').trim().slice(0, 120);
  transaction(() => {
    kept.forEach((file, i) => {
      run('INSERT INTO apartment_photos (apartment_id, filename, caption, sort_order, room) VALUES (?, ?, ?, ?, ?)', apt.id, file.filename, caption, existing.last + 1 + i, room);
    });
  });

  if (!files.length) flash(req, 'error', 'Choose at least one photo (JPG, PNG or WebP).');
  else if (!kept.length) flash(req, 'error', good.length ? `This apartment already has the maximum of ${uploads.MAX_PHOTOS_PER_APARTMENT} photos.` : 'Those files are not valid JPG, PNG or WebP images.');
  else {
    const skipped = files.length - kept.length;
    flash(req, 'success', `${kept.length} photo${kept.length === 1 ? '' : 's'} added to ${roomLabel}.` + (skipped ? ` ${skipped} skipped (not a valid image, or over the limit).` : ''));
  }
  res.redirect(photosTab(apt.id, room));
});

router.post('/photos/:id/room', (req, res) => {
  const photo = ownPhoto(req, req.params.id);
  if (!photo) return res.redirect('/landlord');
  const room = String(req.body.room || '');
  if (!rooms.isRoom(room)) {
    flash(req, 'error', 'Choose a room for this photo.');
    return res.redirect(photosTab(photo.apartment_id));
  }
  run('UPDATE apartment_photos SET room = ? WHERE id = ?', room, photo.id);
  flash(req, 'success', `Photo moved to ${rooms.roomOf(room).label}.`);
  res.redirect(photosTab(photo.apartment_id, room));
});

router.post('/photos/:id/caption', (req, res) => {
  const photo = ownPhoto(req, req.params.id);
  if (!photo) return res.redirect('/landlord');
  run('UPDATE apartment_photos SET caption = ? WHERE id = ?', String(req.body.caption || '').trim().slice(0, 120), photo.id);
  flash(req, 'success', 'Caption saved.');
  res.redirect(photosTab(photo.apartment_id, rooms.roomOf(photo.room).key));
});

router.post('/photos/:id/cover', (req, res) => {
  const photo = ownPhoto(req, req.params.id);
  if (!photo) return res.redirect('/landlord');
  const min = get('SELECT MIN(sort_order) AS m FROM apartment_photos WHERE apartment_id = ?', photo.apartment_id).m;
  run('UPDATE apartment_photos SET sort_order = ? WHERE id = ?', min - 1, photo.id);
  flash(req, 'success', 'Cover photo updated. It now shows first on the listings.');
  res.redirect(photosTab(photo.apartment_id, rooms.roomOf(photo.room).key));
});

router.post('/photos/:id/move', (req, res) => {
  const photo = ownPhoto(req, req.params.id);
  if (!photo) return res.redirect('/landlord');
  // Arrows move a photo past its neighbour in the same room section.
  const all_ = all('SELECT id, room FROM apartment_photos WHERE apartment_id = ? ORDER BY sort_order, id', photo.apartment_id);
  const sameKey = rooms.roomOf(photo.room).key;
  const same = all_.filter((p) => rooms.roomOf(p.room).key === sameKey).map((p) => p.id);
  const k = same.indexOf(photo.id);
  const other = same[req.body.direction === 'up' ? k - 1 : k + 1];
  if (other) {
    const list = all_.map((p) => p.id);
    const i = list.indexOf(photo.id);
    const j = list.indexOf(other);
    [list[i], list[j]] = [list[j], list[i]];
    transaction(() => list.forEach((id, order) => run('UPDATE apartment_photos SET sort_order = ? WHERE id = ?', order, id)));
  }
  res.redirect(photosTab(photo.apartment_id, sameKey));
});

router.post('/photos/:id/delete', (req, res) => {
  const photo = ownPhoto(req, req.params.id);
  if (!photo) return res.redirect('/landlord');
  run('DELETE FROM apartment_photos WHERE id = ?', photo.id);
  uploads.removeFile(photo.filename);
  flash(req, 'info', 'Photo removed.');
  res.redirect(photosTab(photo.apartment_id, rooms.roomOf(photo.room).key));
});

module.exports = router;
