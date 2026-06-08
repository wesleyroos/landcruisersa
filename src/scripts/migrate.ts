/**
 * Run schema migrations then seed if the DB is empty.
 * Called as the release_command on Fly.io before the server starts.
 */
import Database from 'better-sqlite3';
import { resolve } from 'path';

const dbPath = process.env.DATABASE_PATH ?? resolve(process.cwd(), 'db.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS listings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    slug            TEXT    NOT NULL UNIQUE,
    listing_type    TEXT    NOT NULL DEFAULT 'for_sale',
    title           TEXT    NOT NULL,
    model           TEXT    NOT NULL,
    year            INTEGER NOT NULL,
    price           INTEGER NOT NULL,
    mileage         INTEGER NOT NULL,
    province        TEXT    NOT NULL,
    new_or_used     TEXT    NOT NULL DEFAULT 'Used',
    transmission    TEXT    NOT NULL,
    colour          TEXT    NOT NULL,
    description     TEXT    NOT NULL,
    mods            TEXT,
    photos          TEXT    NOT NULL,
    seller_name     TEXT    NOT NULL,
    seller_email    TEXT    NOT NULL,
    seller_phone    TEXT    NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'pending',
    fuel_type       TEXT,
    fuel_consumption REAL,
    power_kw        INTEGER,
    seats           INTEGER,
    co2             INTEGER,
    source_url      TEXT,
    created_at      INTEGER NOT NULL
  )
`);

// Additive migrations — safe to run repeatedly (ADD COLUMN is no-op if already present via try/catch)
const addColumns: [string, string][] = [
  ['source',         `ALTER TABLE listings ADD COLUMN source TEXT NOT NULL DEFAULT 'own'`],
  ['source_id',      `ALTER TABLE listings ADD COLUMN source_id TEXT`],
  ['last_polled_at', `ALTER TABLE listings ADD COLUMN last_polled_at INTEGER`],
  ['review_flag',    `ALTER TABLE listings ADD COLUMN review_flag INTEGER NOT NULL DEFAULT 0`],
];

const existingCols = new Set(
  (db.prepare('PRAGMA table_info(listings)').all() as { name: string }[]).map(r => r.name)
);

for (const [col, sql] of addColumns) {
  if (!existingCols.has(col)) db.exec(sql);
}

db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS listings_source_source_id ON listings (source, source_id)`);

// Data fix: Prado 250-series launched in 2024 — backfill any rows missed before normalize was updated
db.exec(`UPDATE listings SET model = 'prado-250' WHERE model = 'prado-150' AND year >= 2024`);

console.log('Migration complete.');
db.close();
