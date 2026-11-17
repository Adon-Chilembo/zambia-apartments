// What the site charges, in Kwacha. Each amount can be changed in .env without touching the code.
const num = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// Workers (plumbers, electricians...) pay a monthly fee to be listed.
const WORKER_MONTHLY = num('WORKER_MONTHLY_FEE', 150);
// Optional extra to be promoted to the top of the workers list.
const FEATURED_MONTHLY = num('WORKER_FEATURED_FEE', 250);

// Landlords pay a monthly listing fee per apartment: a share of the rent, with a floor and a ceiling.
const LISTING_RATE = num('LISTING_FEE_RATE', 0.03); // 3% of the monthly rent
const LISTING_MIN = num('LISTING_FEE_MIN', 50);
const LISTING_MAX = num('LISTING_FEE_MAX', 750);

// Workers reach the "Top rated" list with enough good reviews (no payment needed).
const TOP_RATED_MIN_REVIEWS = 3;
const TOP_RATED_MIN_AVERAGE = 4.5;

// How many months can be paid at once.
const MONTH_CHOICES = [1, 3, 6, 12];

/** Monthly listing fee for an apartment with this rent, rounded to the nearest K5. */
function listingFee(rent) {
  const raw = Math.min(LISTING_MAX, Math.max(LISTING_MIN, Number(rent || 0) * LISTING_RATE));
  return Math.round(raw / 5) * 5;
}

const KINDS = {
  worker: { label: 'Maintenance worker listing', monthly: () => WORKER_MONTHLY },
  featured: { label: 'Top list promotion', monthly: () => FEATURED_MONTHLY },
  listing: { label: 'Apartment listing fee', monthly: (apt) => listingFee(apt.rent_amount) },
};

const today = () => new Date().toISOString().slice(0, 10);

/** True while a paid-until date (YYYY-MM-DD) is today or later. */
const active = (until) => Boolean(until) && until >= today();

/** New paid-until date after paying `months` more, counted from today or from the current end date. */
function extend(until, months) {
  const start = active(until) ? new Date(until + 'T00:00:00Z') : new Date(today() + 'T00:00:00Z');
  const d = new Date(start);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** Whole days until a paid-until date (negative once expired). */
const daysLeft = (until) => (until ? Math.round((new Date(until + 'T00:00:00Z') - new Date(today() + 'T00:00:00Z')) / 864e5) : -1);

module.exports = {
  WORKER_MONTHLY, FEATURED_MONTHLY, LISTING_RATE, LISTING_MIN, LISTING_MAX,
  TOP_RATED_MIN_REVIEWS, TOP_RATED_MIN_AVERAGE, MONTH_CHOICES, KINDS,
  listingFee, active, extend, daysLeft, today,
};
