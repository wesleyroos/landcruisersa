import Database from 'better-sqlite3';
import { resolve } from 'path';

const dbPath = process.env.DATABASE_PATH ?? resolve(process.cwd(), 'db.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS listings (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    slug             TEXT    NOT NULL UNIQUE,
    listing_type     TEXT    NOT NULL DEFAULT 'for_sale',
    title            TEXT    NOT NULL,
    model            TEXT    NOT NULL,
    year             INTEGER NOT NULL,
    price            INTEGER NOT NULL,
    mileage          INTEGER NOT NULL,
    province         TEXT    NOT NULL,
    new_or_used      TEXT    NOT NULL DEFAULT 'Used',
    transmission     TEXT    NOT NULL,
    colour           TEXT    NOT NULL,
    description      TEXT    NOT NULL,
    mods             TEXT,
    photos           TEXT    NOT NULL,
    seller_name      TEXT    NOT NULL,
    seller_email     TEXT    NOT NULL,
    seller_phone     TEXT    NOT NULL,
    status           TEXT    NOT NULL DEFAULT 'pending',
    fuel_type        TEXT,
    fuel_consumption REAL,
    power_kw         INTEGER,
    seats            INTEGER,
    co2              INTEGER,
    source_url       TEXT,
    source           TEXT    NOT NULL DEFAULT 'own',
    source_id        TEXT,
    last_polled_at   INTEGER,
    review_flag      INTEGER NOT NULL DEFAULT 0,
    created_at       INTEGER NOT NULL
  )
`);

// Idempotent column additions for upgrades on existing DBs
const existingCols = new Set(
  db.prepare("SELECT name FROM pragma_table_info('listings')").all().map(r => r.name)
);
const addCol = (col, def) => {
  if (!existingCols.has(col)) {
    db.exec(`ALTER TABLE listings ADD COLUMN ${def}`);
    console.log(`[migrate] Added column: ${col}`);
  }
};
addCol('source',         "source         TEXT    NOT NULL DEFAULT 'own'");
addCol('source_id',      "source_id      TEXT");
addCol('last_polled_at', "last_polled_at INTEGER");
addCol('review_flag',    "review_flag    INTEGER NOT NULL DEFAULT 0");
addCol('ig_posted_at',   "ig_posted_at   INTEGER");
addCol('featured',       "featured       INTEGER NOT NULL DEFAULT 0");

db.exec(`
  CREATE TABLE IF NOT EXISTS site_config (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )
`);

// Unique index for aggregator dedup — safe to run repeatedly
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS listings_source_source_id
    ON listings (source, source_id)
    WHERE source_id IS NOT NULL
`);

// Data fix: prado with wrong model slug (e.g. from old normalize or bad ingest)
db.exec(`
  UPDATE listings
  SET model = CASE WHEN year >= 2024 THEN 'prado-250' ELSE 'prado-150' END
  WHERE LOWER(title) LIKE '%prado%'
    AND model NOT IN ('prado-150', 'prado-250')
`);
// Data fix: prado-250 launched 2024 — upgrade any stale prado-150 rows
db.exec(`UPDATE listings SET model = 'prado-250' WHERE model = 'prado-150' AND year >= 2024`);

// Safety check — every column the app expects must exist.
// If any are missing, crash here so Fly never serves broken traffic.
const REQUIRED_COLS = [
  'id', 'slug', 'listing_type', 'title', 'model', 'year', 'price', 'mileage',
  'province', 'new_or_used', 'transmission', 'colour', 'description', 'mods',
  'photos', 'seller_name', 'seller_email', 'seller_phone', 'status',
  'fuel_type', 'fuel_consumption', 'power_kw', 'seats', 'co2',
  'source_url', 'source', 'source_id', 'last_polled_at', 'review_flag',
  'created_at', 'ig_posted_at', 'featured',
];
const finalCols = new Set(
  db.prepare("SELECT name FROM pragma_table_info('listings')").all().map(r => r.name)
);
const missing = REQUIRED_COLS.filter(c => !finalCols.has(c));
if (missing.length) {
  console.error(`[migrate] FATAL: missing columns in listings table: ${missing.join(', ')}`);
  console.error('[migrate] Add the missing addCol() call(s) to this script and redeploy.');
  db.close();
  process.exit(1);
}

console.log('[migrate] Schema ready.');
db.close();
