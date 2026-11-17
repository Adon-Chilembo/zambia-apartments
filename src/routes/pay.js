const express = require('express');
const { get, run } = require('../db');
const { flash, requireRole, period } = require('../helpers');
const payments = require('../payments');
const notify = require('../notify');

const router = express.Router();

function settle(reference, status) {
  const r = run(
    `UPDATE payments SET status = ?, paid_at = CASE WHEN ? = 'success' THEN datetime('now') ELSE paid_at END
      WHERE reference = ? AND status = 'pending'`,
    status,
    status,
    reference
  );
  // Only the call that actually marks it paid sends the emails, so a payment is never announced twice.
  if (status === 'success' && r.changes > 0) notify.paymentReceived(reference);
}

/**
 * Apply a verified provider result to a payment. A "success" only counts if the
 * currency and amount match the rent that was asked for.
 * Returns the final status: 'success' | 'failed' | 'mismatch' | 'pending'.
 */
function settleVerified(payment, result) {
  if (result.status === 'pending') return 'pending';
  if (result.status === 'success') {
    if (result.currency !== payments.CURRENCY || result.amount + 0.009 < payment.amount) {
      settle(payment.reference, 'failed');
      return 'mismatch';
    }
    settle(payment.reference, 'success');
    return 'success';
  }
  settle(payment.reference, 'failed');
  return 'failed';
}

// Simulated Mobile Money prompt (only when no Flutterwave key is configured).
router.get('/simulate/:ref', requireRole('tenant'), (req, res) => {
  if (payments.provider !== 'simulator') return res.redirect('/tenant');
  const payment = get(
    `SELECT p.*, a.title FROM payments p JOIN apartments a ON a.id = p.apartment_id WHERE p.reference = ? AND p.tenant_id = ?`,
    req.params.ref,
    req.user.id
  );
  if (!payment) return res.status(404).render('error', { title: 'Not found', message: 'Payment not found.' });
  if (payment.status !== 'pending') return res.redirect('/tenant?tab=payments');
  res.render('pay-simulate', { title: 'Approve payment', payment, line: `Rent for ${period(payment.period)} · ${payment.title}` });
});

router.post('/simulate/:ref', requireRole('tenant'), (req, res) => {
  if (payments.provider !== 'simulator') return res.redirect('/tenant');
  const payment = get('SELECT * FROM payments WHERE reference = ? AND tenant_id = ?', req.params.ref, req.user.id);
  if (!payment) return res.redirect('/tenant');
  const ok = req.body.decision === 'approve';
  settle(payment.reference, ok ? 'success' : 'failed');
  flash(req, ok ? 'success' : 'error', ok ? 'Payment received. Your landlord can see it now.' : 'Payment was declined.');
  res.redirect('/tenant?tab=payments');
});

// Flutterwave redirects here after checkout with ?status=...&tx_ref=...
router.get('/callback', requireRole('tenant'), async (req, res) => {
  const reference = String(req.query.tx_ref || '');
  const payment = get('SELECT * FROM payments WHERE reference = ? AND tenant_id = ?', reference, req.user.id);
  if (!payment) return res.redirect('/tenant?tab=payments');
  if (payment.status !== 'pending') return res.redirect('/tenant?tab=payments');

  if (req.query.status === 'cancelled') {
    settle(reference, 'failed');
    flash(req, 'info', 'Payment cancelled. Nothing was charged.');
    return res.redirect('/tenant?tab=payments');
  }
  try {
    const outcome = settleVerified(payment, await payments.verifyPayment(reference));
    const messages = {
      success: ['success', 'Payment received. Your landlord can see it now.'],
      failed: ['error', 'Payment failed. Nothing was charged.'],
      mismatch: ['error', 'The amount paid did not match your rent. Contact your landlord.'],
      pending: ['info', 'Payment is still processing. Approve the prompt on your phone; it will update shortly.'],
    };
    flash(req, ...messages[outcome]);
  } catch (err) {
    flash(req, 'info', 'Could not confirm the payment yet (' + err.message + '). Refresh in a minute.');
  }
  res.redirect('/tenant?tab=payments');
});

// Let a tenant re-check a payment that is still pending.
router.post('/recheck/:ref', requireRole('tenant'), async (req, res) => {
  const payment = get("SELECT * FROM payments WHERE reference = ? AND tenant_id = ? AND status = 'pending'", req.params.ref, req.user.id);
  if (payment && payments.provider === 'flutterwave') {
    try {
      const outcome = settleVerified(payment, await payments.verifyPayment(payment.reference));
      flash(req, outcome === 'success' ? 'success' : 'info', outcome === 'success' ? 'Payment confirmed.' : `Payment status: ${outcome}.`);
    } catch (err) {
      flash(req, 'error', 'Could not check the payment: ' + err.message);
    }
  }
  res.redirect('/tenant?tab=payments');
});

module.exports = router;
module.exports.settle = settle;
module.exports.settleVerified = settleVerified;
