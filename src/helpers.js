const { get } = require('./db');

/** Zambian Kwacha, e.g. "K 4,500.00" (non-breaking space so it never wraps) */
const money = (n) =>
  'K ' +Number(n || 0).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const NETWORKS = {
  mtn: 'MTN MoMo',
  airtel: 'Airtel Money',
  zamtel: 'Zamtel Kwacha',
};

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
            a.*, l.name AS landlord_name, l.email AS landlord_email, l.phone AS landlord_phone
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
  available: 'Available',
  occupied: 'Occupied',
};

module.exports = {
  money,
  NETWORKS,
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
  ISSUE_CATEGORIES,
  STATUS_LABEL,
};
