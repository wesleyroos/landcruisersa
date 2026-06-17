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
addCol('segment',        "segment        TEXT    NOT NULL DEFAULT 'land-cruiser'");
addCol('off_market_at',  "off_market_at  INTEGER");
addCol('seller_notified_at', "seller_notified_at INTEGER");
addCol('dealer_offer_optin', "dealer_offer_optin INTEGER NOT NULL DEFAULT 0");

db.exec(`
  CREATE TABLE IF NOT EXISTS site_config (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS training_leads (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    email        TEXT    NOT NULL,
    phone        TEXT    NOT NULL,
    location     TEXT,
    land_cruiser TEXT,
    message      TEXT,
    created_at   INTEGER NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS click_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_slug  TEXT    NOT NULL,
    listing_title TEXT,
    source        TEXT    NOT NULL,
    created_at    INTEGER NOT NULL
  )
`);

// Finance pre-approval leads captured from the listing-page calculator
db.exec(`
  CREATE TABLE IF NOT EXISTS finance_leads (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    phone         TEXT    NOT NULL,
    email         TEXT    NOT NULL,
    listing_slug  TEXT    NOT NULL,
    listing_title TEXT,
    model         TEXT,
    price         INTEGER,
    deposit       INTEGER,
    term_months   INTEGER,
    interest_rate REAL,
    balloon_pct   INTEGER,
    est_monthly   INTEGER,
    consent       INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS finance_leads_created ON finance_leads (created_at)`);

// Valuation tool requests — anonymous estimate snapshot, optionally upgraded to a
// lead. A NEW table uses CREATE TABLE IF NOT EXISTS (the finance_leads pattern);
// do NOT add these columns to REQUIRED_COLS — that guard is for the listings
// table only and would falsely fail the boot.
db.exec(`
  CREATE TABLE IF NOT EXISTS valuation_requests (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    model          TEXT    NOT NULL,
    year           INTEGER NOT NULL,
    mileage        INTEGER NOT NULL,
    province       TEXT,
    condition      TEXT,
    sell_low       INTEGER,
    sell_mid       INTEGER,
    sell_high      INTEGER,
    asking_ceiling INTEGER,
    confidence     TEXT,
    cohort_size    INTEGER,
    cohort_label   TEXT,
    anchor_basis   TEXT,
    vin            TEXT,
    vin_valid      INTEGER NOT NULL DEFAULT 0,
    name           TEXT,
    email          TEXT,
    phone          TEXT,
    consent             INTEGER NOT NULL DEFAULT 0,
    dealer_offer_optin  INTEGER NOT NULL DEFAULT 0,
    referred_at         INTEGER,
    source         TEXT    NOT NULL DEFAULT 'valuation_tool',
    source_path    TEXT,
    utm_source     TEXT,
    created_at     INTEGER NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS valuation_requests_created ON valuation_requests (created_at)`);
db.exec(`CREATE INDEX IF NOT EXISTS valuation_requests_model ON valuation_requests (model, year)`);
db.exec(`CREATE INDEX IF NOT EXISTS valuation_requests_vin ON valuation_requests (vin)`);
db.exec(`CREATE INDEX IF NOT EXISTS valuation_requests_dealer ON valuation_requests (dealer_offer_optin, referred_at)`);
// Idempotent future-column home (CREATE TABLE IF NOT EXISTS never alters an
// existing table). Add addValCol('col','col TYPE') here for any column added
// after first ship, so existing prod DBs upgrade without a manual migration.
const valCols = new Set(
  db.prepare("SELECT name FROM pragma_table_info('valuation_requests')").all().map(r => r.name)
);
const addValCol = (col, def) => {
  if (!valCols.has(col)) {
    db.exec(`ALTER TABLE valuation_requests ADD COLUMN ${def}`);
    console.log(`[migrate] Added valuation_requests column: ${col}`);
  }
};
void addValCol; // referenced once a post-ship column is needed

// Owner feedback on valuations — calibration signal. New table → CREATE TABLE
// IF NOT EXISTS (NOT REQUIRED_COLS, which guards the listings table only).
db.exec(`
  CREATE TABLE IF NOT EXISTS valuation_feedback (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    draft_id      INTEGER,
    model         TEXT,
    year          INTEGER,
    mileage       INTEGER,
    spec          TEXT,
    estimate_mid  INTEGER,
    verdict       TEXT,
    user_estimate INTEGER,
    note          TEXT,
    source_path   TEXT,
    created_at    INTEGER NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS valuation_feedback_created ON valuation_feedback (created_at)`);
db.exec(`CREATE INDEX IF NOT EXISTS valuation_feedback_model ON valuation_feedback (model, verdict)`);

// General enquiries from the floating chat widget.
db.exec(`
  CREATE TABLE IF NOT EXISTS enquiries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT,
    phone       TEXT,
    email       TEXT,
    message     TEXT NOT NULL,
    source_path TEXT,
    created_at  INTEGER NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS enquiries_created ON enquiries (created_at)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS view_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_slug  TEXT    NOT NULL,
    listing_title TEXT,
    model         TEXT,
    price         INTEGER,
    utm_source    TEXT,
    created_at    INTEGER NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS view_events_slug ON view_events (listing_slug)`);
db.exec(`CREATE INDEX IF NOT EXISTS view_events_created ON view_events (created_at)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS visit_events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    utm_source   TEXT    NOT NULL,
    landing_path TEXT,
    created_at   INTEGER NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS visit_events_created ON visit_events (created_at)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS partner_clicks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_slug TEXT    NOT NULL,
    kind         TEXT    NOT NULL,
    created_at   INTEGER NOT NULL
  )
`);

// Scraper health — one row per ingest run, reported by the ingest scripts
db.exec(`
  CREATE TABLE IF NOT EXISTS ingest_runs (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    source  TEXT    NOT NULL,
    found   INTEGER NOT NULL DEFAULT 0,
    created INTEGER NOT NULL DEFAULT 0,
    updated INTEGER NOT NULL DEFAULT 0,
    skipped INTEGER NOT NULL DEFAULT 0,
    removed INTEGER NOT NULL DEFAULT 0,
    ok      INTEGER NOT NULL DEFAULT 1,
    note    TEXT,
    run_at  INTEGER NOT NULL,
    source_total INTEGER,
    cap_hit      INTEGER NOT NULL DEFAULT 0
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS ingest_runs_source ON ingest_runs (source, run_at)`);

// Idempotent column additions for ingest_runs on existing DBs — CREATE TABLE
// IF NOT EXISTS above never alters a table that already exists, so the admin
// Scrapers page (which SELECTs every column) would 500 without these.
const runCols = new Set(
  db.prepare("SELECT name FROM pragma_table_info('ingest_runs')").all().map(r => r.name)
);
const addRunCol = (col, def) => {
  if (!runCols.has(col)) {
    db.exec(`ALTER TABLE ingest_runs ADD COLUMN ${def}`);
    console.log(`[migrate] Added ingest_runs column: ${col}`);
  }
};
addRunCol('source_total', "source_total INTEGER");
addRunCol('cap_hit',      "cap_hit      INTEGER NOT NULL DEFAULT 0");

// Price changes observed at ingest — fuels price-trend pages and price-drop surfacing
db.exec(`
  CREATE TABLE IF NOT EXISTS price_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id  INTEGER NOT NULL,
    slug        TEXT    NOT NULL,
    model       TEXT    NOT NULL,
    old_price   INTEGER NOT NULL,
    new_price   INTEGER NOT NULL,
    recorded_at INTEGER NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS price_events_model ON price_events (model, recorded_at)`);
db.exec(`CREATE INDEX IF NOT EXISTS price_events_slug ON price_events (slug)`);

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

// Data fix: split flat hilux/fortuner (collected before the era split existed)
// into engine-era slugs. Title 'D-4D' forces d4d even on a 2016+ row; otherwise
// year >= 2016 → GD-6 generation. Idempotent — no-op once all rows are split.
for (const base of ['hilux', 'fortuner']) {
  db.exec(`UPDATE listings SET model = '${base}-d4d'
    WHERE model = '${base}' AND (LOWER(title) LIKE '%d-4d%' OR LOWER(title) LIKE '%d4d%' OR year < 2016)`);
  db.exec(`UPDATE listings SET model = '${base}-gd6' WHERE model = '${base}'`);
}
// Keep price_events model slugs in sync with their listing
db.exec(`
  UPDATE price_events
  SET model = (SELECT model FROM listings WHERE listings.slug = price_events.slug)
  WHERE model IN ('hilux', 'fortuner')
    AND EXISTS (SELECT 1 FROM listings WHERE listings.slug = price_events.slug)
`);

// Backfill off_market_at for listings that left the market before this column
// existed. last_polled_at ≈ when the poller marked a listing removed (it stops
// polling once removed), so it's a sound proxy. Only fills NULLs, so it's a
// one-time no-op after the first boot — new departures get stamped by the app.
db.exec(`
  UPDATE listings SET off_market_at = last_polled_at
  WHERE off_market_at IS NULL
    AND last_polled_at IS NOT NULL
    AND status IN ('sold', 'removed', 'inactive')
`);

// Safety check — every column the app expects must exist.
// If any are missing, crash here so Fly never serves broken traffic.
const REQUIRED_COLS = [
  'id', 'slug', 'listing_type', 'title', 'model', 'year', 'price', 'mileage',
  'province', 'new_or_used', 'transmission', 'colour', 'description', 'mods',
  'photos', 'seller_name', 'seller_email', 'seller_phone', 'status',
  'fuel_type', 'fuel_consumption', 'power_kw', 'seats', 'co2',
  'source_url', 'source', 'source_id', 'last_polled_at', 'review_flag',
  'created_at', 'ig_posted_at', 'featured', 'segment', 'off_market_at',
  'seller_notified_at', 'dealer_offer_optin',
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
