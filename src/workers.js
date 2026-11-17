// Shared queries for the workers directory.
const { get, all } = require('./db');
const fees = require('./fees');

// One row per worker with their rating, review count and whether they are listed, promoted or top rated.
const WORKER_SQL = `
  SELECT w.*, u.name, u.email, u.phone, u.whatsapp,
         COALESCE(r.avg_rating, 0) AS avg_rating, COALESCE(r.reviews, 0) AS reviews,
         (w.subscription_until >= date('now')) AS listed,
         (w.featured_until >= date('now') AND w.subscription_until >= date('now')) AS featured,
         (COALESCE(r.reviews, 0) >= ${fees.TOP_RATED_MIN_REVIEWS} AND COALESCE(r.avg_rating, 0) >= ${fees.TOP_RATED_MIN_AVERAGE}) AS top_rated
    FROM workers w
    JOIN users u ON u.id = w.user_id
    LEFT JOIN (SELECT worker_id, AVG(rating) AS avg_rating, COUNT(*) AS reviews FROM worker_reviews GROUP BY worker_id) r ON r.worker_id = w.id`;

/** Listed workers matching the filters, promoted first, then best rated. */
function search({ q = '', trade = '', city = '', sort = '' } = {}) {
  const where = ["w.subscription_until >= date('now')"];
  const params = [];
  if (trade) where.push('w.trade = ?'), params.push(trade);
  if (city) where.push('(w.city LIKE ? OR w.areas LIKE ?)'), params.push(`%${city}%`, `%${city}%`);
  if (q) {
    where.push('(u.name LIKE ? OR w.headline LIKE ? OR w.skills LIKE ? OR w.bio LIKE ?)');
    params.push(...Array(4).fill(`%${q}%`));
  }
  const order = sort === 'reviews' ? 'reviews DESC, avg_rating DESC' : sort === 'new' ? 'w.created_at DESC' : 'featured DESC, top_rated DESC, avg_rating DESC, reviews DESC';
  return all(`${WORKER_SQL} WHERE ${where.join(' AND ')} ORDER BY ${order}, u.name`, ...params);
}

/** The top list: promoted workers first, then those top rated by landlords and tenants. */
const topList = (limit = 6) =>
  all(`${WORKER_SQL} WHERE w.subscription_until >= date('now') AND (featured OR top_rated)
       ORDER BY featured DESC, avg_rating DESC, reviews DESC LIMIT ?`, limit);

const byId = (id) => get(`${WORKER_SQL} WHERE w.id = ?`, id);
const byUser = (userId) => get(`${WORKER_SQL} WHERE w.user_id = ?`, userId);

const reviewsFor = (workerId) =>
  all(`SELECT r.*, u.name, u.role FROM worker_reviews r JOIN users u ON u.id = r.reviewer_id
        WHERE r.worker_id = ? ORDER BY r.created_at DESC, r.id DESC`, workerId);

module.exports = { search, topList, byId, byUser, reviewsFor };
