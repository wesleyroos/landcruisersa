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

// Unique index for aggregator dedup — safe to run repeatedly
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS listings_source_source_id
    ON listings (source, source_id)
    WHERE source_id IS NOT NULL
`);

console.log('[migrate] Schema ready.');
db.close();
