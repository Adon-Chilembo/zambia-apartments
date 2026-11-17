const { get } = require('./db');

/** Zambian Kwacha, e.g. "K 4,500.00" (non-breaking space so it never wraps) */
const money = (n) =>
  'K ' +Number(n || 0).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const NETWORKS = {
  mtn: 'MTN MoMo',
  airtel: 'Airtel Money',
  zamtel: 'Zamtel Kwacha',
};

// Banks tenants and landlords can pay from.
const BANKS = {
  zanaco: 'Zanaco',
  absa: 'Absa Bank Zambia',
  stanbic: 'Stanbic Bank',
  fnb: 'FNB Zambia',
  indo: 'Indo-Zambia Bank',
  access: 'Access Bank Zambia',
  ecobank: 'Ecobank Zambia',
  uba: 'UBA Zambia',
  zicb: 'ZICB',
  fcb: 'First Capital Bank',
  citi: 'Citibank Zambia',
  natsave: 'NATSAVE',
};

/** How a payment was made, e.g. "MTN MoMo" or "Zanaco". */
function payMethod(p) {
  if (p && p.method === 'bank') return BANKS[p.bank] || 'Bank';
  return NETWORKS[p && p.network] || 'Mobile Money';
}
/** The account it came from: phone number, or the account holder for bank payments. */
const payFrom = (p) => (p && p.method === 'bank' ? p.account_name || '' : (p && p.phone) || '');

/**
 * Read the payment-method part of a pay form (see views/partials/pay-method.ejs).
 * Returns { method, network, phone, bank, account_name } or { error }.
 */
function payMethodFields(body) {
  if (body.method === 'bank') {
    const bank = Object.keys(BANKS).includes(body.bank) ? body.bank : null;
    const account_name = String(body.account_name || '').trim().slice(0, 100);
    if (!bank || !account_name) return { error: 'Choose your bank and enter the account holder name.' };
    return { method: 'bank', network: null, phone: null, bank, account_name };
  }
  const network = Object.keys(NETWORKS).includes(body.network) ? body.network : null;
  const phone = String(body.phone || '').replace(/[^\d+]/g, '');
  if (!network || phone.replace(/\D/g, '').length < 9) return { error: 'Choose your Mobile Money network and enter a valid phone number.' };
  return { method: 'mobile_money', network, phone, bank: null, account_name: null };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function date(value) {
  if (!value) return '';
  const d = new Date(value.length <= 10 ? value + 'T00:00:00' : value.replace(' ', 'T') + 'Z');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "2026-11" -> "Nov 2026" */
function period(p) {
  if (!p) return '';
  const [y, m] = p.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

function currentPeriod(offset = 0) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Periods from three months ago to three months ahead, for the pay form. */
function periodOptions() {
  const out = [];
  for (let i = -3; i <= 3; i++) out.push(currentPeriod(i));
  return out;
}

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('');
}

/** A stable colour pair for an apartment's placeholder image. */
function swatch(id) {
  const palettes = [
    ['#0f766e', '#f59e0b'],
    ['#b45309', '#fde68a'],
    ['#1d4ed8', '#93c5fd'],
    ['#9f1239', '#fda4af'],
    ['#166534', '#bbf7d0'],
    ['#6d28d9', '#ddd6fe'],
  ];
  return palettes[Number(id) % palettes.length];
}

function flash(req, type, text) {
  req.session.flash = { type, text };
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      flash(req, 'info', 'Please log in to continue.');
      return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
    }
    if (req.user.role !== role) {
      return res.status(403).render('error', { title: 'Not allowed', message: `This area is for ${role}s only.` });
    }
    next();
  };
}

/** The tenant's active tenancy joined with apartment and landlord, or undefined. */
function activeTenancy(tenantId) {
  return get(
    `SELECT t.id AS tenancy_id, t.start_date, t.occupants, t.household_note,
            a.*, l.name AS landlord_name, l.email AS landlord_email, l.phone AS landlord_phone,
            (SELECT filename FROM apartment_photos p WHERE p.apartment_id = a.id ORDER BY sort_order, id LIMIT 1) AS cover
       FROM tenancies t
       JOIN apartments a ON a.id = t.apartment_id
       JOIN users l ON l.id = a.landlord_id
      WHERE t.tenant_id = ? AND t.status = 'active'
      ORDER BY t.id DESC LIMIT 1`,
    tenantId
  );
}

const MAX_OCCUPANTS = 20;

/** Parse a household size from a form: a whole number 1–20, or null if invalid. */
function parseOccupants(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_OCCUPANTS ? n : null;
}

/** 1 -> "1 person", 3 -> "3 people", null -> "Not given" */
function people(n) {
  if (!n) return 'Not given';
  return n === 1 ? '1 person' : `${n} people`;
}

/**
 * Address of a stored photo: uploaded photos are served from /uploads, demo photos from
 * public/demo-photos ("demo/<file>.jpg"). Unsplash links are also accepted (only that host).
 */
function photoSrc(name, size = 'full') {
  const s = String(name || '');
  const demo = s.match(/^demo\/(photo-[\w-]+\.jpg)$/);
  if (demo) return '/static/demo-photos/' + demo[1];
  if (/^https:\/\/images\.unsplash\.com\/photo-[\w-]+\?/.test(s)) {
    return s.replace(/([?&])w=\d+/, `$1w=${size === 'thumb' ? 700 : 1600}`);
  }
  return '/uploads/' + encodeURIComponent(s);
}

/**
 * A Zambian phone number in international form without "+", e.g. "097 555 0101" -> "260975550101".
 * Returns '' if it doesn't look like a phone number.
 */
function intlPhone(phone) {
  let d = String(phone || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = '260' + d.slice(1);
  else if (d.length === 9) d = '260' + d; // e.g. 975550101
  return /^\d{10,15}$/.test(d) ? d : '';
}
const telHref = (phone) => (intlPhone(phone) ? 'tel:+' + intlPhone(phone) : '');
/** WhatsApp chat link with a ready-written first message. */
const whatsappHref = (phone, text) => (intlPhone(phone) ? `https://wa.me/${intlPhone(phone)}?text=${encodeURIComponent(text)}` : '');

/** srcset for big header photos so phones download the smaller version. Empty for uploads. */
function photoSrcset(name) {
  const s = String(name || '');
  if (!/^https:\/\/images\.unsplash\.com\//.test(s)) return '';
  return `${photoSrc(s, 'thumb')} 700w, ${photoSrc(s)} 1600w`;
}

/** What to search the map for: the private address if given, otherwise the area. */
function mapQuery(apt, { includeAddress = true } = {}) {
  const parts = [];
  for (const p of [includeAddress && apt.address, apt.neighbourhood, apt.city, 'Zambia']) {
    // Skip a part the earlier text already mentions (e.g. an address that already names the neighbourhood).
    if (p && !parts.join(', ').toLowerCase().includes(String(p).toLowerCase())) parts.push(p);
  }
  return parts.join(', ');
}
const mapEmbedUrl = (apt, opts) => 'https://maps.google.com/maps?q=' + encodeURIComponent(mapQuery(apt, opts)) + '&z=15&output=embed';
const mapLink = (apt, opts) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(mapQuery(apt, opts));

const ISSUE_CATEGORIES = ['Plumbing', 'Electrical', 'Power / load-shedding', 'Water supply', 'Security', 'Pests', 'Appliances', 'Cleaning', 'Structure / roof', 'Noise / neighbours', 'Other'];

const STATUS_LABEL = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  pending: 'Pending',
  success: 'Paid',
  failed: 'Failed',
  approved: 'Approved',
  rejected: 'Rejected',
  failed_fee: 'Failed',
  available: 'Available',
  occupied: 'Occupied',
};

module.exports = {
  rooms: require('./rooms'),
  trades: require('./trades'),
  fees: require('./fees'),
  money,
  NETWORKS,
  BANKS,
  payMethod,
  payFrom,
  payMethodFields,
  date,
  period,
  currentPeriod,
  periodOptions,
  initials,
  swatch,
  flash,
  requireRole,
  activeTenancy,
  MAX_OCCUPANTS,
  parseOccupants,
  people,
  photoSrc,
  photoSrcset,
  intlPhone,
  telHref,
  whatsappHref,
  mapQuery,
  mapEmbedUrl,
  mapLink,
  ISSUE_CATEGORIES,
  STATUS_LABEL,
};
