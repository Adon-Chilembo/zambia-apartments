// In-app notifications shown behind the bell icon in the header.
const { get, all, run } = require('./db');

/** Add a notification. `link` must be a path on this site (e.g. /tenant?tab=payments). */
function add(userId, kind, text, link = null) {
  const safeLink = typeof link === 'string' && link.startsWith('/') && !link.startsWith('//') ? link : null;
  run('INSERT INTO notifications (user_id, kind, text, link) VALUES (?, ?, ?, ?)', userId, kind, String(text).slice(0, 300), safeLink);
}

const unreadCount = (userId) => get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', userId).n;

const latest = (userId, limit = 8) =>
  all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?', userId, limit);

const markAllRead = (userId) => run("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL", userId);

/** Mark one as read and return it (only if it belongs to this user). */
function open(userId, id) {
  const n = get('SELECT * FROM notifications WHERE id = ? AND user_id = ?', id, userId);
  if (n && !n.read_at) run("UPDATE notifications SET read_at = datetime('now') WHERE id = ?", n.id);
  return n;
}

module.exports = { add, unreadCount, latest, markAllRead, open };
