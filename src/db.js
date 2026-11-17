const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(process.env.DB_PATH || path.join(dataDir, 'zambia_apartments.db'));
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('landlord','tenant')),
  occupation TEXT,
  emergency_contact TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS apartments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  landlord_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  neighbourhood TEXT NOT NULL,
  city TEXT NOT NULL,
  bedrooms INTEGER NOT NULL DEFAULT 1,
  bathrooms INTEGER NOT NULL DEFAULT 1,
  rent_amount REAL NOT NULL,
  description TEXT,
  amenities TEXT,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','occupied')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tenancies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  apartment_id INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL DEFAULT (date('now')),
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended'))
);

CREATE TABLE IF NOT EXISTS invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  apartment_id INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  landlord_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_name TEXT,
  tenant_email TEXT,
  used_by INTEGER REFERENCES users(id),
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  apartment_id INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenancy_id INTEGER NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
  apartment_id INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('problem','improvement')),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low','normal','urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
  landlord_response TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenancy_id INTEGER NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
  apartment_id INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  period TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'mobile_money',
  network TEXT,
  phone TEXT,
  provider TEXT NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT
);
`);

// Add columns introduced after the first release, so existing databases keep their data.
function addColumn(table, column, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
// Household: how many people live in the apartment, and an optional note on who they are.
addColumn('tenancies', 'occupants', 'INTEGER');
addColumn('tenancies', 'household_note', 'TEXT');
addColumn('applications', 'occupants', 'INTEGER');
addColumn('applications', 'household_note', 'TEXT');
// Services an apartment offers: comma-separated keys from src/services.js.
addColumn('apartments', 'services', "TEXT NOT NULL DEFAULT ''");
// Email notifications: each user can switch them off; every email is logged.
addColumn('users', 'email_notifications', 'INTEGER NOT NULL DEFAULT 1');
// Landlord contact on listings: show phone / WhatsApp buttons (on by default), optional separate WhatsApp number.
addColumn('users', 'show_contact', 'INTEGER NOT NULL DEFAULT 1');
addColumn('users', 'whatsapp', 'TEXT');
db.exec(`
CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  to_email TEXT NOT NULL,
  kind TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent','saved','skipped','opted_out','failed')),
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Optional street address / directions. Private: shown to the landlord (and map), never on the public listing.
addColumn('apartments', 'address', 'TEXT');

// Photos landlords upload for each apartment. The lowest sort_order is the cover photo.
db.exec(`
CREATE TABLE IF NOT EXISTS apartment_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  apartment_id INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_photos_apartment ON apartment_photos(apartment_id, sort_order);
`);

// Which room a photo shows (see src/rooms.js). Photos from before rooms existed are sorted
// by their caption where it is clear, and the rest wait in "Other photos" for the landlord.
addColumn('apartment_photos', 'room', 'TEXT');
{
  const { guessRoom } = require('./rooms');
  const unsorted = db.prepare('SELECT id, caption FROM apartment_photos WHERE room IS NULL').all();
  const setRoom = db.prepare('UPDATE apartment_photos SET room = ? WHERE id = ?');
  unsorted.forEach((p) => setRoom.run(guessRoom(p.caption) || 'other', p.id));
}

// Workers (plumbers, electricians...) get their own account type. SQLite can't change a CHECK
// constraint in place, so the users table is rebuilt once with the new role allowed.
{
  const usersSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get().sql;
  if (!usersSql.includes("'worker'")) {
    const newSql = usersSql
      .replace(/CREATE TABLE\s+(IF NOT EXISTS\s+)?"?users"?/i, 'CREATE TABLE users_new')
      .replace(/CHECK\s*\(\s*role\s+IN\s*\(\s*'landlord'\s*,\s*'tenant'\s*\)\s*\)/i, "CHECK (role IN ('landlord','tenant','worker'))");
    const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name).join(', ');
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(newSql);
      db.exec(`INSERT INTO users_new (${cols}) SELECT ${cols} FROM users`);
      db.exec('DROP TABLE users');
      db.exec('ALTER TABLE users_new RENAME TO users');
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
  }
}

db.exec(`
-- A worker's public profile: what they do, where, and their CV.
CREATE TABLE IF NOT EXISTS workers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  trade TEXT NOT NULL DEFAULT 'other',
  headline TEXT,
  bio TEXT,
  skills TEXT,
  experience_years INTEGER,
  city TEXT,
  areas TEXT,
  rates TEXT,
  cv_filename TEXT,
  photo_filename TEXT,
  subscription_until TEXT,   -- listed publicly while this date is today or later
  featured_until TEXT,       -- promoted to the top list while this date is today or later
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Landlords and tenants rate workers they have used: one review per person per worker.
CREATE TABLE IF NOT EXISTS worker_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_id INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  reviewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (worker_id, reviewer_id)
);

-- In-app notifications behind the bell icon.
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);

-- Fees paid to the site: worker listings, top-list promotion and apartment listing fees.
CREATE TABLE IF NOT EXISTS fee_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('worker','featured','listing')),
  target_id INTEGER NOT NULL,  -- workers.id, or apartments.id for a listing fee
  months INTEGER NOT NULL,
  amount REAL NOT NULL,
  method TEXT NOT NULL DEFAULT 'mobile_money',
  network TEXT,
  phone TEXT,
  bank TEXT,
  account_name TEXT,
  provider TEXT NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed')),
  paid_until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT
);
`);

// Rent paid by bank: which bank and whose account.
addColumn('payments', 'bank', 'TEXT');
addColumn('payments', 'account_name', 'TEXT');

// Apartments show on the site while their listing fee is paid. Apartments that were already
// listed before fees existed get 30 days free, so nothing disappears overnight.
if (!db.prepare('PRAGMA table_info(apartments)').all().some((c) => c.name === 'listing_paid_until')) {
  db.exec('ALTER TABLE apartments ADD COLUMN listing_paid_until TEXT');
  db.exec("UPDATE apartments SET listing_paid_until = date('now', '+30 days')");
}

/** Run several statements atomically. */
function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

const get = (sql, ...params) => db.prepare(sql).get(...params);
const all = (sql, ...params) => db.prepare(sql).all(...params);
const run = (sql, ...params) => db.prepare(sql).run(...params);

module.exports = { db, get, all, run, transaction };
