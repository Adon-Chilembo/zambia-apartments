const express = require('express');
const { get, all, run, transaction } = require('../db');
const { flash, requireRole, activeTenancy, currentPeriod, periodOptions, parseOccupants, ISSUE_CATEGORIES } = require('../helpers');
const payments = require('../payments');
const notify = require('../notify');

const router = express.Router();
router.use(requireRole('tenant'));

router.get('/', (req, res) => {
  const home = activeTenancy(req.user.id);
  if (!home) {
    const applications = all(
      `SELECT ap.*, a.title, a.neighbourhood, a.city, a.rent_amount FROM applications ap
         JOIN apartments a ON a.id = ap.apartment_id
        WHERE ap.tenant_id = ? ORDER BY ap.created_at DESC`,
      req.user.id
    );
    const code = req.session.pendingInvite || '';
    return res.render('tenant/unlinked', { title: 'My home', applications, code });
  }

  const issues = all('SELECT * FROM issues WHERE tenancy_id = ? ORDER BY created_at DESC, id DESC', home.tenancy_id);
  const paymentRows = all('SELECT * FROM payments WHERE tenancy_id = ? ORDER BY created_at DESC, id DESC', home.tenancy_id);
  const paidPeriods = new Set(paymentRows.filter((p) => p.status === 'success').map((p) => p.period));
  const thisMonth = currentPeriod();
  const totalPaid = paymentRows.filter((p) => p.status === 'success').reduce((s, p) => s + p.amount, 0);
  const nextUnpaid = periodOptions().find((p) => p >= thisMonth && !paidPeriods.has(p)) || thisMonth;

  res.render('tenant/dashboard', {
    title: 'My home',
    home,
    issues,
    payments: paymentRows,
    paidThisMonth: paidPeriods.has(thisMonth),
    thisMonth,
    totalPaid,
    nextUnpaid,
    periods: periodOptions(),
    paidPeriods: [...paidPeriods],
    categories: ISSUE_CATEGORIES,
    networks: payments.NETWORKS,
    tab: ['issues', 'payments', 'household', 'profile'].includes(req.query.tab) ? req.query.tab : 'overview',
  });
});

router.post('/join', (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  if (activeTenancy(req.user.id)) {
    flash(req, 'error', 'You are already connected to an apartment.');
    return res.redirect('/tenant');
  }
  const invite = get(
    `SELECT i.*, a.title, a.status AS apartment_status FROM invites i JOIN apartments a ON a.id = i.apartment_id WHERE i.code = ?`,
    code
  );
  if (!invite || invite.used_by) {
    flash(req, 'error', 'That invite code is not valid or has already been used.');
    return res.redirect('/tenant');
  }
  if (invite.apartment_status !== 'available') {
    flash(req, 'error', 'That apartment already has a tenant. Ask your landlord for a new code.');
    return res.redirect('/tenant');
  }
  const occupants = parseOccupants(req.body.occupants);
  if (!occupants) {
    flash(req, 'error', 'Enter how many people will live in the apartment (including you).');
    return res.redirect('/tenant');
  }
  const householdNote = String(req.body.household_note || '').trim().slice(0, 500);
  // Others who applied for this apartment are told it has been taken.
  const othersApplied = all(
    "SELECT id FROM applications WHERE apartment_id = ? AND status = 'pending' AND tenant_id != ?",
    invite.apartment_id,
    req.user.id
  ).map((r) => r.id);
  let tenancyId;
  transaction(() => {
    tenancyId = Number(run(
      'INSERT INTO tenancies (apartment_id, tenant_id, occupants, household_note) VALUES (?, ?, ?, ?)',
      invite.apartment_id,
      req.user.id,
      occupants,
      householdNote
    ).lastInsertRowid);
    run("UPDATE apartments SET status = 'occupied' WHERE id = ?", invite.apartment_id);
    run("UPDATE invites SET used_by = ?, used_at = datetime('now') WHERE id = ?", req.user.id, invite.id);
    run("UPDATE applications SET status = 'rejected' WHERE apartment_id = ? AND status = 'pending'", invite.apartment_id);
    run("UPDATE applications SET status = 'rejected' WHERE tenant_id = ? AND status = 'pending'", req.user.id);
  });
  delete req.session.pendingInvite;
  notify.tenantJoined(tenancyId);
  othersApplied.forEach((id) => notify.applicationDecided(id, 'taken'));
  flash(req, 'success', `You're now connected to ${invite.title}.`);
  res.redirect('/tenant');
});

router.post('/household', (req, res) => {
  const home = activeTenancy(req.user.id);
  if (!home) return res.redirect('/tenant');
  const occupants = parseOccupants(req.body.occupants);
  if (!occupants) {
    flash(req, 'error', 'Enter a number of people between 1 and 20 (including you).');
    return res.redirect('/tenant?tab=household');
  }
  run(
    'UPDATE tenancies SET occupants = ?, household_note = ? WHERE id = ?',
    occupants,
    String(req.body.household_note || '').trim().slice(0, 500),
    home.tenancy_id
  );
  flash(req, 'success', 'Household updated. Your landlord can see it now.');
  res.redirect('/tenant?tab=household');
});

router.post('/applications/:id/withdraw', (req, res) => {
  run("DELETE FROM applications WHERE id = ? AND tenant_id = ? AND status = 'pending'", req.params.id, req.user.id);
  flash(req, 'info', 'Application withdrawn.');
  res.redirect('/tenant');
});

router.post('/issues', (req, res) => {
  const home = activeTenancy(req.user.id);
  if (!home) return res.redirect('/tenant');
  const kind = req.body.kind === 'improvement' ? 'improvement' : 'problem';
  const category = ISSUE_CATEGORIES.includes(req.body.category) ? req.body.category : 'Other';
  const urgency = ['low', 'normal', 'urgent'].includes(req.body.urgency) ? req.body.urgency : 'normal';
  const title = String(req.body.title || '').trim().slice(0, 140);
  if (!title) {
    flash(req, 'error', 'Give the issue a short title.');
    return res.redirect('/tenant?tab=issues');
  }
  const created = run(
    'INSERT INTO issues (tenancy_id, apartment_id, tenant_id, kind, category, title, description, urgency) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    home.tenancy_id,
    home.id,
    req.user.id,
    kind,
    category,
    title,
    String(req.body.description || '').slice(0, 3000),
    urgency
  );
  notify.issueReported(Number(created.lastInsertRowid));
  flash(req, 'success', kind === 'problem' ? 'Problem reported to your landlord.' : 'Suggestion sent to your landlord.');
  res.redirect('/tenant?tab=issues');
});

router.post('/profile', (req, res) => {
  run(
    'UPDATE users SET phone = ?, occupation = ?, emergency_contact = ? WHERE id = ?',
    String(req.body.phone || '').trim().slice(0, 40),
    String(req.body.occupation || '').trim().slice(0, 100),
    String(req.body.emergency_contact || '').trim().slice(0, 200),
    req.user.id
  );
  flash(req, 'success', 'Your details were updated. Your landlord can now see them.');
  res.redirect('/tenant?tab=profile');
});

router.post('/pay', async (req, res) => {
  let reference = null;
  try {
    const home = activeTenancy(req.user.id);
    if (!home) return res.redirect('/tenant');
    const period = periodOptions().includes(req.body.period) ? req.body.period : currentPeriod();
    const network = Object.keys(payments.NETWORKS).includes(req.body.network) ? req.body.network : null;
    const phone = String(req.body.phone || '').replace(/[^\d+]/g, '');
    if (!network || phone.replace(/\D/g, '').length < 9) {
      flash(req, 'error', 'Choose your Mobile Money network and enter a valid phone number.');
      return res.redirect('/tenant?tab=payments');
    }
    if (get("SELECT id FROM payments WHERE tenancy_id = ? AND period = ? AND status = 'success'", home.tenancy_id, period)) {
      flash(req, 'info', 'Rent for that month is already paid.');
      return res.redirect('/tenant?tab=payments');
    }

    reference = payments.newReference();
    run(
      `INSERT INTO payments (tenancy_id, apartment_id, tenant_id, amount, period, network, phone, provider, reference)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      home.tenancy_id,
      home.id,
      req.user.id,
      home.rent_amount,
      period,
      network,
      phone,
      payments.provider,
      reference
    );

    const base = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const url = await payments.startPayment({
      reference,
      amount: home.rent_amount,
      email: req.user.email,
      name: req.user.name,
      phone,
      title: `Rent for ${period} · ${home.title}`,
      callbackUrl: `${base}/pay/callback`,
      simulatorUrl: `/pay/simulate/${reference}`,
      metadata: { tenancy_id: home.tenancy_id, period },
    });
    res.redirect(url);
  } catch (err) {
    console.error('Payment start failed:', err.message);
    if (reference) run("UPDATE payments SET status = 'failed' WHERE reference = ? AND status = 'pending'", reference);
    flash(req, 'error', 'Could not start the payment: ' + err.message);
    res.redirect('/tenant?tab=payments');
  }
});

module.exports = router;
