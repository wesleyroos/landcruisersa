import Database from 'better-sqlite3';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

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
    created_at       INTEGER NOT NULL
  )
`);

console.log('[migrate] Schema ready.');
db.close();
