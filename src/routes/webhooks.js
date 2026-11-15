const express = require('express');
const { get } = require('../db');
const payments = require('../payments');

const router = express.Router();

// Flutterwave calls this when a payment completes, even if the tenant closed the browser.
// The event body is not trusted on its own: the transaction is re-verified with Flutterwave.
router.post('/flutterwave', express.json(), async (req, res) => {
  if (!payments.validWebhook(req.get('verif-hash'))) return res.sendStatus(401);
  res.sendStatus(200); // acknowledge quickly; work continues below

  const ref = req.body?.data?.tx_ref;
  const payment = ref && get('SELECT * FROM payments WHERE reference = ?', ref);
  if (!payment || payment.status !== 'pending') return;
  try {
    const { settleVerified } = require('./pay');
    settleVerified(payment, await payments.verifyPayment(ref));
  } catch (err) {
    console.error('Webhook verification failed:', err.message);
  }
});

module.exports = router;
