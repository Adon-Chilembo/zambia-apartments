// Fees paid to the site: worker listing plans, top-list promotion and apartment listing fees.
// Uses the same payment provider as rent (Flutterwave, or the built-in simulator).
const express = require('express');
const { get, run, transaction } = require('../db');
const { flash, money, payMethodFields } = require('../helpers');
const fees = require('../fees');
const payments = require('../payments');
const notify = require('../notify');

const router = express.Router();
router.use((req, res, next) => {
  if (!req.user) {
    flash(req, 'info', 'Please log in to continue.');
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  }
  next();
});

/** What a fee is for and where to send the payer afterwards, checking they own it. */
function feeTarget(user, kind, targetId) {
  if (kind === 'listing' && user.role === 'landlord') {
    const apt = get('SELECT * FROM apartments WHERE id = ? AND landlord_id = ?', targetId, user.id);
    if (!apt) return null;
    return { until: apt.listing_paid_until, monthly: fees.listingFee(apt.rent_amount), line: `Listing fee · ${apt.title}`, back: `/landlord/apartments/${apt.id}?tab=listing` };
  }
  if ((kind === 'worker' || kind === 'featured') && user.role === 'worker') {
    const w = get('SELECT * FROM workers WHERE id = ? AND user_id = ?', targetId, user.id);
    if (!w) return null;
    return {
      until: kind === 'worker' ? w.subscription_until : w.featured_until,
      monthly: fees.KINDS[kind].monthly(),
      line: fees.KINDS[kind].label,
      back: '/worker?tab=plan',
    };
  }
  return null;
}

/** Mark a fee paid or failed. On success, extend what it pays for. Safe to call more than once. */
function settle(reference, status) {
  const f = get("SELECT * FROM fee_payments WHERE reference = ? AND status = 'pending'", reference);
  if (!f) return;
  if (status !== 'success') {
    run("UPDATE fee_payments SET status = 'failed' WHERE id = ? AND status = 'pending'", f.id);
    return;
  }
  let changed = 0;
  transaction(() => {
    const col = { listing: ['apartments', 'listing_paid_until'], worker: ['workers', 'subscription_until'], featured: ['workers', 'featured_until'] }[f.kind];
    const current = get(`SELECT ${col[1]} AS until FROM ${col[0]} WHERE id = ?`, f.target_id);
    const until = fees.extend(current && current.until, f.months);
    changed = run("UPDATE fee_payments SET status = 'success', paid_at = datetime('now'), paid_until = ? WHERE id = ? AND status = 'pending'", until, f.id).changes;
    if (changed) run(`UPDATE ${col[0]} SET ${col[1]} = ? WHERE id = ?`, until, f.target_id);
  });
  if (changed) notify.feePaid(reference);
}

/** Apply a verified provider result, checking amount and currency. */
function settleVerified(fee, result) {
  if (result.status === 'pending') return 'pending';
  if (result.status === 'success' && (result.currency !== payments.CURRENCY || result.amount + 0.009 < fee.amount)) {
    settle(fee.reference, 'failed');
    return 'mismatch';
  }
  settle(fee.reference, result.status);
  return result.status;
}

router.post('/start', async (req, res) => {
  const kind = String(req.body.kind || '');
  const target = feeTarget(req.user, kind, req.body.target_id);
  if (!target) return res.status(403).render('error', { title: 'Not allowed', message: 'You cannot pay for that.' });
  const months = fees.MONTH_CHOICES.includes(Number(req.body.months)) ? Number(req.body.months) : 1;
  if (kind === 'featured') {
    const w = get('SELECT subscription_until FROM workers WHERE id = ?', req.body.target_id);
    if (!fees.active(w.subscription_until)) {
      flash(req, 'error', 'Pay for your listing first. The top-list promotion is an extra on top of it.');
      return res.redirect(target.back);
    }
  }
  const how = payMethodFields(req.body);
  if (how.error) {
    flash(req, 'error', how.error);
    return res.redirect(target.back);
  }
  const amount = target.monthly * months;
  const reference = payments.newReference();
  try {
    run(
      `INSERT INTO fee_payments (user_id, kind, target_id, months, amount, method, network, phone, bank, account_name, provider, reference)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      req.user.id, kind, Number(req.body.target_id), months, amount, how.method, how.network, how.phone, how.bank, how.account_name, payments.provider, reference
    );
    const base = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const url = await payments.startPayment({
      reference,
      amount,
      email: req.user.email,
      name: req.user.name,
      phone: how.phone || req.user.phone,
      method: how.method,
      title: `${target.line} · ${months} month${months === 1 ? '' : 's'}`,
      callbackUrl: `${base}/fees/callback`,
      simulatorUrl: `/fees/simulate/${reference}`,
      metadata: { kind, target_id: Number(req.body.target_id), months },
    });
    res.redirect(url);
  } catch (err) {
    console.error('Fee payment start failed:', err.message);
    run("UPDATE fee_payments SET status = 'failed' WHERE reference = ? AND status = 'pending'", reference);
    flash(req, 'error', 'Could not start the payment: ' + err.message);
    res.redirect(target.back);
  }
});

const backFor = (f) => (f.kind === 'listing' ? `/landlord/apartments/${f.target_id}?tab=listing` : '/worker?tab=plan');

router.get('/simulate/:ref', (req, res) => {
  if (payments.provider !== 'simulator') return res.redirect('/');
  const f = get('SELECT * FROM fee_payments WHERE reference = ? AND user_id = ?', req.params.ref, req.user.id);
  if (!f) return res.status(404).render('error', { title: 'Not found', message: 'Payment not found.' });
  if (f.status !== 'pending') return res.redirect(backFor(f));
  const target = feeTarget(req.user, f.kind, f.target_id);
  res.render('pay-simulate', { title: 'Approve payment', payment: f, line: `${target ? target.line : 'Fee'} · ${f.months} month${f.months === 1 ? '' : 's'}` });
});

router.post('/simulate/:ref', (req, res) => {
  if (payments.provider !== 'simulator') return res.redirect('/');
  const f = get('SELECT * FROM fee_payments WHERE reference = ? AND user_id = ?', req.params.ref, req.user.id);
  if (!f) return res.redirect('/');
  const ok = req.body.decision === 'approve';
  settle(f.reference, ok ? 'success' : 'failed');
  flash(req, ok ? 'success' : 'error', ok ? `Payment of ${money(f.amount)} received. Thank you!` : 'Payment was declined.');
  res.redirect(backFor(f));
});

// Flutterwave redirects here after checkout with ?status=...&tx_ref=...
router.get('/callback', async (req, res) => {
  const f = get('SELECT * FROM fee_payments WHERE reference = ? AND user_id = ?', String(req.query.tx_ref || ''), req.user.id);
  if (!f) return res.redirect('/');
  if (f.status !== 'pending') return res.redirect(backFor(f));
  if (req.query.status === 'cancelled') {
    settle(f.reference, 'failed');
    flash(req, 'info', 'Payment cancelled. Nothing was charged.');
    return res.redirect(backFor(f));
  }
  try {
    const outcome = settleVerified(f, await payments.verifyPayment(f.reference));
    const messages = {
      success: ['success', `Payment of ${money(f.amount)} received. Thank you!`],
      failed: ['error', 'Payment failed. Nothing was charged.'],
      mismatch: ['error', 'The amount paid did not match. Contact us for help.'],
      pending: ['info', 'Payment is still processing. It will update shortly.'],
    };
    flash(req, ...messages[outcome]);
  } catch (err) {
    flash(req, 'info', 'Could not confirm the payment yet (' + err.message + '). Refresh in a minute.');
  }
  res.redirect(backFor(f));
});

module.exports = router;
module.exports.settleVerified = settleVerified;
