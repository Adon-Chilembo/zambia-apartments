// Mobile Money payments in Zambian Kwacha (ZMW).
// With FLW_SECRET_KEY set, rent is collected through Flutterwave's hosted
// checkout restricted to Zambian Mobile Money. Without a key the app uses a
// built-in simulator so the whole flow can be tried locally.
const crypto = require('node:crypto');
const { NETWORKS } = require('./helpers');

const CURRENCY = 'ZMW';
const API = 'https://api.flutterwave.com/v3';

const rawKey = (process.env.FLW_SECRET_KEY || '').trim();
let SECRET_KEY = '';
let keyMode = null; // 'test' | 'live'
if (rawKey) {
  const m = rawKey.match(/^FLWSECK(_TEST)?-[A-Za-z0-9]+-X$/);
  if (m) {
    SECRET_KEY = rawKey;
    keyMode = m[1] ? 'test' : 'live';
  } else if (rawKey.startsWith('FLWPUBK')) {
    console.warn('FLW_SECRET_KEY looks like a PUBLIC key (FLWPUBK...). Use the SECRET key (FLWSECK_TEST-...). Falling back to the simulator.');
  } else {
    console.warn('FLW_SECRET_KEY is not a valid Flutterwave secret key (expected FLWSECK_TEST-...-X or FLWSECK-...-X). Falling back to the simulator.');
  }
}
const WEBHOOK_HASH = (process.env.FLW_SECRET_HASH || '').trim();
const provider = SECRET_KEY ? 'flutterwave' : 'simulator';

function newReference() {
  return 'ZM-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

async function flutterwave(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: 'Bearer ' + SECRET_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status !== 'success') {
    throw new Error(json.message || `Flutterwave request failed (${res.status})`);
  }
  return json.data;
}

/** Start a payment. Returns the URL the tenant should be sent to. */
async function startPayment({ reference, amount, email, name, phone, callbackUrl, simulatorUrl, title, metadata }) {
  if (provider === 'simulator') return simulatorUrl;
  const data = await flutterwave('POST', '/payments', {
    tx_ref: reference,
    amount: Number(amount.toFixed(2)),
    currency: CURRENCY,
    redirect_url: callbackUrl,
    payment_options: 'mobilemoneyzambia',
    customer: { email, name, phonenumber: phone },
    customizations: { title: 'Zambia Apartments', description: title },
    meta: metadata,
  });
  return data.link;
}

/** Ask Flutterwave for the final status: { status: 'success'|'failed'|'pending', amount, currency }. */
async function verifyPayment(reference) {
  const data = await flutterwave('GET', '/transactions/verify_by_reference?tx_ref=' + encodeURIComponent(reference));
  const result = { amount: Number(data.amount), currency: data.currency };
  if (data.status === 'successful') return { ...result, status: 'success' };
  if (['failed', 'cancelled'].includes(data.status)) return { ...result, status: 'failed' };
  return { ...result, status: 'pending' };
}

/** Flutterwave sends the secret hash you set in its dashboard in the verif-hash header. */
function validWebhook(signature) {
  if (!SECRET_KEY || !WEBHOOK_HASH || !signature) return false;
  const a = Buffer.from(String(signature));
  const b = Buffer.from(WEBHOOK_HASH);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Confirm the key is accepted by Flutterwave. Logs the result; never throws. */
async function checkKey() {
  if (provider !== 'flutterwave') return;
  try {
    await flutterwave('GET', '/transactions?page=1');
    console.log(`Flutterwave key accepted (${keyMode} mode).`);
    if (keyMode === 'live') console.warn('WARNING: live key in use. Real money will be charged.');
    if (!WEBHOOK_HASH) console.log('Tip: set FLW_SECRET_HASH in .env once the site is online so webhooks can confirm payments.');
  } catch (err) {
    console.error('Flutterwave rejected the key:', err.message, '- check FLW_SECRET_KEY in .env');
  }
}

module.exports = { provider, keyMode, CURRENCY, checkKey, NETWORKS, newReference, startPayment, verifyPayment, validWebhook };
