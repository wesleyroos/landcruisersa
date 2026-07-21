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
addCol('sold_price',     "sold_price     INTEGER");
addCol('ig_media_id',    "ig_media_id    TEXT");
addCol('body_type',      "body_type      TEXT");
addCol('ig_skipped_at',  "ig_skipped_at  INTEGER");
addCol('model_locked',   "model_locked   INTEGER NOT NULL DEFAULT 0");

// Backfill body_type = 'game-viewer' from title/description keywords. Mirrors
// detectBodyType() in src/lib/sources/normalize.ts (SQLite LIKE approximation —
// keep the two lexicons in step). Only touches NULL rows, so an admin's manual
// 'standard' (not a game viewer) or 'game-viewer' verdict is never overwritten.
db.exec(`
  UPDATE listings SET body_type = 'game-viewer'
  WHERE body_type IS NULL AND (
    LOWER(title) LIKE '%game view%'  OR LOWER(title) LIKE '%game-view%'  OR LOWER(title) LIKE '%gameview%'
    OR LOWER(title) LIKE '%game drive%' OR LOWER(title) LIKE '%game-drive%'
    OR LOWER(title) LIKE '%safari conversion%' OR LOWER(title) LIKE '%safari vehicle%'
    OR ((LOWER(description) LIKE '%game viewer%' OR LOWER(description) LIKE '%game-viewer%' OR LOWER(description) LIKE '%gameviewer%')
        AND LOWER(description) NOT LIKE '%game viewer seat%' AND LOWER(description) NOT LIKE '%game-viewer seat%' AND LOWER(description) NOT LIKE '%gameviewer seat%')
    OR LOWER(description) LIKE '%game drive vehicle%' OR LOWER(description) LIKE '%game-drive vehicle%'
    OR LOWER(description) LIKE '%safari conversion%'  OR LOWER(description) LIKE '%safari vehicle%'
    OR LOWER(description) LIKE '%safari-ready%'       OR LOWER(description) LIKE '%safari ready%'
    OR LOWER(description) LIKE '%open safari%'        OR LOWER(description) LIKE '%open game%'
  )
`);

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

// "Looking for a game viewer?" wanted-requests — structured buyer demand with a
// per-lead reference ID for papered dealer/builder handoffs.
db.exec(`
  CREATE TABLE IF NOT EXISTS wanted_requests (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    reference   TEXT    NOT NULL,
    category    TEXT    NOT NULL DEFAULT 'game-viewer',
    name        TEXT    NOT NULL,
    email       TEXT    NOT NULL,
    phone       TEXT    NOT NULL,
    seats       TEXT,
    budget      TEXT,
    use_type    TEXT,
    timeline    TEXT,
    message     TEXT,
    source_path TEXT,
    consent_at  INTEGER,
    created_at  INTEGER NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS wanted_requests_created ON wanted_requests (created_at)`);

// Imported/legacy contacts (old WP/WooCommerce list) — separate from users.
db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT    NOT NULL UNIQUE,
    name       TEXT,
    source     TEXT    NOT NULL,
    origin     TEXT    NOT NULL DEFAULT 'wp-import',
    note       TEXT,
    created_at INTEGER NOT NULL
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
addValCol('client_id', 'client_id TEXT'); // anonymous per-browser id — groups repeat valuations

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

// Indicative valuation certificates — issued PDF snapshots. New table → CREATE
// TABLE IF NOT EXISTS (NOT REQUIRED_COLS). email/consent_at present only when the
// user opted into "email me a copy". See docs/valuation-certificate-spec.md.
db.exec(`
  CREATE TABLE IF NOT EXISTS valuation_certificates (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    cert_id        TEXT    NOT NULL UNIQUE,
    draft_id       INTEGER,
    model          TEXT    NOT NULL,
    year           INTEGER NOT NULL,
    mileage        INTEGER NOT NULL,
    condition      TEXT,
    province       TEXT,
    spec_label     TEXT,
    cohort_label   TEXT,
    sell_low       INTEGER NOT NULL,
    sell_mid       INTEGER NOT NULL,
    sell_high      INTEGER NOT NULL,
    asking_ceiling INTEGER NOT NULL,
    confidence     TEXT    NOT NULL,
    cohort_size    INTEGER,
    cohort_p25     INTEGER,
    cohort_p75     INTEGER,
    cohort_p90     INTEGER,
    pdf_url        TEXT,
    issued_at      INTEGER NOT NULL,
    expires_at     INTEGER NOT NULL,
    name           TEXT,
    phone          TEXT,
    email          TEXT,
    consent_at     INTEGER,
    emailed_at     INTEGER,
    dealer_offer_optin INTEGER NOT NULL DEFAULT 0,
    source_path    TEXT,
    utm_source     TEXT
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS valuation_certificates_cert ON valuation_certificates (cert_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS valuation_certificates_draft ON valuation_certificates (draft_id)`);
// Idempotent column adds — CREATE TABLE IF NOT EXISTS never alters an existing
// table, so DBs created before the lead-capture columns get them here.
const certCols = new Set(
  db.prepare("SELECT name FROM pragma_table_info('valuation_certificates')").all().map(r => r.name)
);
const addCertCol = (col, def) => {
  if (!certCols.has(col)) {
    db.exec(`ALTER TABLE valuation_certificates ADD COLUMN ${def}`);
    console.log(`[migrate] Added valuation_certificates column: ${col}`);
  }
};
addCertCol('name',  'name  TEXT');
addCertCol('phone', 'phone TEXT');
addCertCol('dealer_offer_optin', 'dealer_offer_optin INTEGER NOT NULL DEFAULT 0');

// First-party LLM-citation ledger (visit_events only logs ?utm_source= links;
// LLM citations carry a Referer but no utm param). New table → CREATE TABLE IF NOT EXISTS.
db.exec(`
  CREATE TABLE IF NOT EXISTS ai_referrals (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    referrer_host TEXT NOT NULL,
    source        TEXT NOT NULL,
    landing_path  TEXT,
    created_at    INTEGER NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS ai_referrals_created ON ai_referrals (created_at)`);
db.exec(`CREATE INDEX IF NOT EXISTS ai_referrals_source ON ai_referrals (source, created_at)`);

// Anonymous visitor id (lcsa_vcid) added after first ship → ALTER existing tables
// so we can join an AI citation to a later conversion (valuation/finance/contact).
const addColTo = (table, col, def) => {
  const cols = new Set(db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all().map(r => r.name));
  if (!cols.has(col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${def}`);
    console.log(`[migrate] Added ${table} column: ${col}`);
  }
};
addColTo('ai_referrals', 'client_id', 'client_id TEXT');
addColTo('click_events', 'client_id', 'client_id TEXT');
addColTo('finance_leads', 'client_id', 'client_id TEXT');

// Natural-language vehicle searches → intent + demand-gap data. New table.
db.exec(`
  CREATE TABLE IF NOT EXISTS search_queries (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    q            TEXT    NOT NULL,
    mode         TEXT,
    models       TEXT,
    provinces    TEXT,
    min_price    INTEGER,
    max_price    INTEGER,
    min_mileage  INTEGER,
    max_mileage  INTEGER,
    min_year     INTEGER,
    max_year     INTEGER,
    matched      INTEGER,
    result_count INTEGER,
    client_id    TEXT,
    created_at   INTEGER NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS search_queries_created ON search_queries (created_at)`);

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

// Rental operator outbound clicks — first-party demand data (which operators
// users want), feeds Phase-3 booking-partner prioritisation. New table → IF NOT
// EXISTS pattern, NOT REQUIRED_COLS (that guard is for the listings table only).
db.exec(`
  CREATE TABLE IF NOT EXISTS rental_clicks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    operator_slug TEXT    NOT NULL,
    created_at    INTEGER NOT NULL
  )
`);

// Generic outbound-link clicks from guide pages — which external destinations
// readers click and from which article. New table → IF NOT EXISTS pattern.
db.exec(`
  CREATE TABLE IF NOT EXISTS outbound_clicks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    article_path TEXT    NOT NULL,
    dest_host    TEXT    NOT NULL,
    dest_url     TEXT    NOT NULL,
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

// ── IG Hero Engine ────────────────────────────────────────────────────────────
// Post log, per-post metric snapshots, and the daily suggestion log. New tables
// → CREATE TABLE IF NOT EXISTS (NOT REQUIRED_COLS — that guards listings only).
db.exec(`
  CREATE TABLE IF NOT EXISTS ig_posts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER,
    slug       TEXT,
    slot       TEXT    NOT NULL DEFAULT 'hero',
    media_id   TEXT,
    caption    TEXT,
    posted_at  INTEGER NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS ig_posts_posted ON ig_posts (posted_at)`);
db.exec(`CREATE INDEX IF NOT EXISTS ig_posts_media ON ig_posts (media_id)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS ig_post_metrics (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    media_id           TEXT    NOT NULL,
    fetched_at         INTEGER NOT NULL,
    views              INTEGER,
    reach              INTEGER,
    likes              INTEGER,
    comments           INTEGER,
    saves              INTEGER,
    shares             INTEGER,
    profile_visits     INTEGER,
    follows            INTEGER,
    total_interactions INTEGER
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS ig_post_metrics_media ON ig_post_metrics (media_id, fetched_at)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS ig_account_snapshots (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    fetched_at      INTEGER NOT NULL,
    followers_count INTEGER,
    media_count     INTEGER
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS ig_account_snapshots_fetched ON ig_account_snapshots (fetched_at)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS ig_suggestion_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    date       TEXT    NOT NULL,
    slot       TEXT    NOT NULL,
    listing_id INTEGER,
    score      INTEGER,
    created_at INTEGER NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS ig_suggestion_log_date ON ig_suggestion_log (date)`);

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

// ── Public user accounts (passwordless) ──────────────────────────────────────
// New tables → CREATE TABLE IF NOT EXISTS (the finance_leads pattern). Do NOT add
// these columns to REQUIRED_COLS — that guard is for the listings table only.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE,
    name          TEXT,
    verified_at   INTEGER,
    consent_at    INTEGER,
    last_login_at INTEGER,
    disabled      INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS users_created ON users (created_at)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS login_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    token_hash TEXT    NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    used_at    INTEGER,
    created_at INTEGER NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS login_tokens_user ON login_tokens (user_id)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS favorites (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL,
    listing_slug        TEXT    NOT NULL,
    listing_id          INTEGER,
    baseline_price      INTEGER,
    last_notified_price INTEGER,
    last_notified_at    INTEGER,
    created_at          INTEGER NOT NULL
  )
`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS favorites_user_listing ON favorites (user_id, listing_slug)`);
db.exec(`CREATE INDEX IF NOT EXISTS favorites_slug ON favorites (listing_slug)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS saved_searches (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL,
    label            TEXT,
    model            TEXT,
    price_min        INTEGER,
    price_max        INTEGER,
    year_min         INTEGER,
    year_max         INTEGER,
    province         TEXT,
    transmission     TEXT,
    fuel_type        TEXT,
    segment          TEXT    NOT NULL DEFAULT 'land-cruiser',
    last_notified_at INTEGER,
    active           INTEGER NOT NULL DEFAULT 1,
    created_at       INTEGER NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS saved_searches_user ON saved_searches (user_id)`);

// ── Dealer offers + listing docs (private-seller deal data) ──────────────────
// New tables → CREATE TABLE IF NOT EXISTS (the finance_leads pattern). Do NOT
// add these columns to REQUIRED_COLS — that guard is for the listings table only.
db.exec(`
  CREATE TABLE IF NOT EXISTS dealer_offers (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id   INTEGER NOT NULL,
    slug         TEXT    NOT NULL,
    dealer_name  TEXT    NOT NULL,
    offer_amount INTEGER NOT NULL,
    verification TEXT    NOT NULL DEFAULT 'sight_unseen',
    conditional  INTEGER NOT NULL DEFAULT 1,
    notes        TEXT,
    offer_date   INTEGER NOT NULL,
    year         INTEGER,
    model        TEXT,
    mileage      INTEGER,
    asking_price INTEGER,
    created_at   INTEGER NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS dealer_offers_listing ON dealer_offers (listing_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS dealer_offers_model ON dealer_offers (model, offer_date)`);

// Vehicle identity off the licence disc — SENSITIVE, admin-only. disc_image is a
// private BLOB (served only via the admin-authed route), never on public R2.
db.exec(`
  CREATE TABLE IF NOT EXISTS listing_docs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id      INTEGER NOT NULL UNIQUE,
    slug            TEXT    NOT NULL,
    vin             TEXT,
    engine_no       TEXT,
    licence_no      TEXT,
    register_no     TEXT,
    disc_expiry     TEXT,
    disc_image      BLOB,
    disc_image_type TEXT,
    notes           TEXT,
    updated_at      INTEGER NOT NULL,
    created_at      INTEGER NOT NULL
  )
`);

// Unique index for aggregator dedup — safe to run repeatedly
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS listings_source_source_id
    ON listings (source, source_id)
    WHERE source_id IS NOT NULL
`);

// Data fix: prado with wrong model slug (e.g. from old normalize or bad ingest).
// Assign by model year across all SA generations (mirrors normalizeModel):
//   J90 ≤2002 · J120 2003–2008 · J150 2009–2023 · J250 2024+
db.exec(`
  UPDATE listings
  SET model = CASE
    WHEN year >= 2024 THEN 'prado-250'
    WHEN year <= 2002 THEN 'prado-90'
    WHEN year <= 2008 THEN 'prado-120'
    ELSE 'prado-150'
  END
  WHERE LOWER(title) LIKE '%prado%'
    AND model NOT IN ('prado-90', 'prado-120', 'prado-150', 'prado-250')
`);
// Split the generic prado-150 bucket onto the correct generation by year.
// Idempotent — a no-op once every row is on its right slug.
db.exec(`UPDATE listings SET model = 'prado-250' WHERE model = 'prado-150' AND year >= 2024`);
db.exec(`UPDATE listings SET model = 'prado-120' WHERE model = 'prado-150' AND year BETWEEN 2003 AND 2008`);
db.exec(`UPDATE listings SET model = 'prado-90'  WHERE model = 'prado-150' AND year IS NOT NULL AND year <= 2002`);

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
  WHERE model IN ('hilux', 'fortuner', 'prado-150')
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
  'seller_notified_at', 'dealer_offer_optin', 'sold_price', 'ig_media_id',
  'body_type', 'ig_skipped_at', 'model_locked',
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
