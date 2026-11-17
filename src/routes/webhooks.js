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
  // The reference is either rent (payments) or a fee to the site (fee_payments).
  const payment = ref && get('SELECT * FROM payments WHERE reference = ?', ref);
  const fee = ref && !payment && get('SELECT * FROM fee_payments WHERE reference = ?', ref);
  const row = payment || fee;
  if (!row || row.status !== 'pending') return;
  try {
    const { settleVerified } = payment ? require('./pay') : require('./fees');
    settleVerified(row, await payments.verifyPayment(ref));
  } catch (err) {
    console.error('Webhook verification failed:', err.message);
  }
});

module.exports = router;
