import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const listings = sqliteTable('listings', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  slug:         text('slug').notNull().unique(),
  listing_type: text('listing_type').notNull().default('for_sale'), // 'for_sale' | 'show_off'
  title:        text('title').notNull(),
  model:        text('model').notNull(),        // '70-series' | '76-series' | '79-series' | '100-series' | '200-series' | '300-series' | 'other'
  year:         integer('year').notNull(),
  price:        integer('price').notNull(),     // 0 for show_off listings
  mileage:      integer('mileage').notNull(),   // 0 for show_off listings
  province:     text('province').notNull(),
  new_or_used:  text('new_or_used').notNull().default('Used'), // 'New' | 'Used'
  transmission: text('transmission').notNull(), // 'manual' | 'automatic'
  colour:       text('colour').notNull(),
  description:  text('description').notNull(),
  mods:         text('mods'),                  // build mods list for show_off listings
  photos:       text('photos').notNull(),       // JSON array of /uploads/listings/<filename>
  seller_name:  text('seller_name').notNull(),
  seller_email: text('seller_email').notNull(),
  seller_phone: text('seller_phone').notNull(),
  status:       text('status').notNull().default('pending'), // 'pending' | 'active' | 'sold' | 'removed'
  fuel_type:    text('fuel_type'),                           // 'Diesel' | 'Petrol' | 'Hybrid' | 'Electric'
  fuel_consumption: real('fuel_consumption'),                // L/100km
  power_kw:     integer('power_kw'),                        // kW
  seats:        integer('seats'),
  co2:          integer('co2'),                             // g/km
  source_url:   text('source_url'),                          // original listing URL for polling
  source:       text('source').notNull().default('own'),     // 'own' | 'autotrader' | 'wbc' | 'adios'
  source_id:    text('source_id'),                           // platform-native listing ID
  last_polled_at: integer('last_polled_at', { mode: 'timestamp' }), // last liveness check
  off_market_at: integer('off_market_at', { mode: 'timestamp' }),   // when it left the market (sold/removed/inactive); null while live
  featured:     integer('featured', { mode: 'boolean' }).notNull().default(false),
  review_flag:  integer('review_flag', { mode: 'boolean' }).notNull().default(false),
  dealer_offer_optin: integer('dealer_offer_optin', { mode: 'boolean' }).notNull().default(false), // seller opted in to be shopped to dealer partners

  ig_posted_at: integer('ig_posted_at', { mode: 'timestamp' }),    // last posted to Instagram
  seller_notified_at: integer('seller_notified_at', { mode: 'timestamp' }), // when a private seller was emailed that their listing went live (one-shot)
  segment:      text('segment').notNull().default('land-cruiser'), // 'land-cruiser' | 'toyota-4x4' — only LC is shown publicly
  created_at:   integer('created_at', { mode: 'timestamp' }).notNull(),
}, t => ({
  sourceIdIdx: uniqueIndex('listings_source_source_id').on(t.source, t.source_id),
}));

export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;

export const siteConfig = sqliteTable('site_config', {
  key:        text('key').primaryKey(),
  value:      text('value').notNull(),
  updated_at: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const trainingLeads = sqliteTable('training_leads', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  name:         text('name').notNull(),
  email:        text('email').notNull(),
  phone:        text('phone').notNull(),
  location:     text('location'),
  land_cruiser: text('land_cruiser'),
  message:      text('message'),
  created_at:   integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const viewEvents = sqliteTable('view_events', {
  id:            integer('id').primaryKey({ autoIncrement: true }),
  listing_slug:  text('listing_slug').notNull(),
  listing_title: text('listing_title'),
  model:         text('model'),                 // denormalised for demand-by-model aggregation
  price:         integer('price'),              // denormalised for price-band aggregation
  utm_source:    text('utm_source'),            // 'ig' | null (direct/other)
  created_at:    integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const visitEvents = sqliteTable('visit_events', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  utm_source:   text('utm_source').notNull(),  // 'ig' etc — one row per campaign session
  landing_path: text('landing_path'),
  created_at:   integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const partnerClicks = sqliteTable('partner_clicks', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  partner_slug: text('partner_slug').notNull(),
  kind:         text('kind').notNull(), // 'website' | 'email' | 'instagram'
  created_at:   integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const clickEvents = sqliteTable('click_events', {
  id:            integer('id').primaryKey({ autoIncrement: true }),
  listing_slug:  text('listing_slug').notNull(),
  listing_title: text('listing_title'),
  source:        text('source').notNull(), // 'autotrader' | 'wbc' | 'adios' | 'wbb'
  created_at:    integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Scraper health — one row per ingest run, reported by the ingest scripts
export const ingestRuns = sqliteTable('ingest_runs', {
  id:      integer('id').primaryKey({ autoIncrement: true }),
  source:  text('source').notNull(),
  found:   integer('found').notNull().default(0),   // refs discovered on the source site
  created: integer('created').notNull().default(0),
  updated: integer('updated').notNull().default(0),
  skipped: integer('skipped').notNull().default(0), // fetch failures + cross-source duplicates
  removed: integer('removed').notNull().default(0),
  ok:      integer('ok', { mode: 'boolean' }).notNull().default(true),
  note:    text('note'),
  run_at:  integer('run_at', { mode: 'timestamp' }).notNull(),
  // Penetration telemetry: how many listings the source's own counter reported
  // for our queries (null if the source exposes no total), and whether we hit a
  // pagination ceiling this run (possible silent truncation).
  source_total: integer('source_total'),
  cap_hit:      integer('cap_hit', { mode: 'boolean' }).notNull().default(false),
});

// Finance pre-approval leads — captured from the finance calculator on a
// listing page. Carries the full deal context (which car, price, and the
// buyer's chosen deposit/term/rate) so a finance partner gets a warm,
// bottom-of-funnel lead rather than a cold name.
export const financeLeads = sqliteTable('finance_leads', {
  id:            integer('id').primaryKey({ autoIncrement: true }),
  name:          text('name').notNull(),
  phone:         text('phone').notNull(),
  email:         text('email').notNull(),
  listing_slug:  text('listing_slug').notNull(),
  listing_title: text('listing_title'),
  model:         text('model'),                  // denormalised for aggregation
  price:         integer('price'),               // vehicle asking price at capture
  deposit:       integer('deposit'),             // buyer's chosen deposit
  term_months:   integer('term_months'),         // buyer's chosen term
  interest_rate: real('interest_rate'),          // buyer's chosen rate (p.a.)
  balloon_pct:   integer('balloon_pct'),         // buyer's chosen balloon %
  est_monthly:   integer('est_monthly'),         // calculator's estimated monthly payment
  consent:       integer('consent', { mode: 'boolean' }).notNull().default(false), // POPIA: agreed to be contacted by a finance partner
  created_at:    integer('created_at', { mode: 'timestamp' }).notNull(),
});

export type FinanceLead = typeof financeLeads.$inferSelect;

// Valuation tool requests — one row per estimate. Written anonymously at compute
// time (vehicle + province + computed output, NO contact), then UPDATED in place
// if the user later submits contact for a dealer offer. Denormalises the output
// snapshot because the live cohort drifts. VIN is capture-only (the future
// book-of-life spine key — no decode in v1).
export const valuationRequests = sqliteTable('valuation_requests', {
  id:            integer('id').primaryKey({ autoIncrement: true }),
  // inputs
  model:         text('model').notNull(),
  year:          integer('year').notNull(),
  mileage:       integer('mileage').notNull(),
  province:      text('province'),
  condition:     text('condition'),
  // output snapshot (frozen at compute time)
  sell_low:       integer('sell_low'),
  sell_mid:       integer('sell_mid'),
  sell_high:      integer('sell_high'),
  asking_ceiling: integer('asking_ceiling'),
  confidence:     text('confidence'),            // high | medium | low | none
  cohort_size:    integer('cohort_size'),
  cohort_label:   text('cohort_label'),
  anchor_basis:   text('anchor_basis'),          // delisted | active
  // VIN — capture-only, nullable, indexed (phase-2 spine; NO decode in v1)
  vin:           text('vin'),
  vin_valid:     integer('vin_valid', { mode: 'boolean' }).notNull().default(false),
  // contact (nullable until the dealer-offer step)
  name:          text('name'),
  email:         text('email'),
  phone:         text('phone'),
  // consent & routing
  consent:            integer('consent', { mode: 'boolean' }).notNull().default(false),            // Consent A: contact + store
  dealer_offer_optin: integer('dealer_offer_optin', { mode: 'boolean' }).notNull().default(false), // Consent B: share with dealer
  referred_at:        integer('referred_at', { mode: 'timestamp' }),
  // attribution
  source:        text('source').notNull().default('valuation_tool'),
  source_path:   text('source_path'),
  utm_source:    text('utm_source'),
  created_at:    integer('created_at', { mode: 'timestamp' }).notNull(),
});

export type ValuationRequest = typeof valuationRequests.$inferSelect;

// Owner feedback on a valuation ("spot on / too high / too low" + optional note
// and their own figure). A calibration signal — surfaces where the model is off
// by model/spec, and the free-text note captures extras we can't see. Anonymous
// (no contact). Linked to the valuation_requests snapshot via draft_id.
export const valuationFeedback = sqliteTable('valuation_feedback', {
  id:            integer('id').primaryKey({ autoIncrement: true }),
  draft_id:      integer('draft_id'),        // the valuation_requests row being rated
  model:         text('model'),
  year:          integer('year'),
  mileage:       integer('mileage'),
  spec:          text('spec'),               // cohort/spec label, e.g. "2022–2024 GR-Sport 300 Series"
  estimate_mid:  integer('estimate_mid'),     // the realistic-sell figure they're rating
  verdict:       text('verdict'),            // 'spot_on' | 'too_high' | 'too_low'
  user_estimate: integer('user_estimate'),    // what they think it's worth (optional)
  note:          text('note'),               // free text (optional) — extras/context
  source_path:   text('source_path'),
  created_at:    integer('created_at', { mode: 'timestamp' }).notNull(),
});
export type ValuationFeedback = typeof valuationFeedback.$inferSelect;

// Price changes observed by the aggregator — fuels price-trend content and
// "price drop" surfacing. One row per observed change, captured at ingest.
export const priceEvents = sqliteTable('price_events', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  listing_id:  integer('listing_id').notNull(),
  slug:        text('slug').notNull(),
  model:       text('model').notNull(),
  old_price:   integer('old_price').notNull(),
  new_price:   integer('new_price').notNull(),
  recorded_at: integer('recorded_at', { mode: 'timestamp' }).notNull(),
});
