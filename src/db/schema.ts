import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const listings = sqliteTable('listings', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  slug:         text('slug').notNull().unique(),
  listing_type: text('listing_type').notNull().default('for_sale'), // 'for_sale' | 'show_off'
  title:        text('title').notNull(),
  model:        text('model').notNull(),        // '70-series' | '76-series' | '79-series' | '100-series' | '200-series' | '300-series' | 'other'
  year:         integer('year').notNull(),
  price:        integer('price').notNull(),     // 0 for show_off listings
  sold_price:   integer('sold_price'),          // actual transacted price, recorded when marked sold (own listings)
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
  ig_media_id:  text('ig_media_id'),                                // IG media id of that post — insights join key
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

// First-party LLM-citation ledger. visit_events only catches ?utm_source= links;
// LLM citations arrive as plain links carrying a Referer (no utm param), so a
// client beacon reads document.referrer and logs the AI host + landing page here.
// This captures the hero metric (AI-referred traffic) losslessly — not sampled by
// Plausible — and answers "which guide got cited?", which Plausible can't at this volume.
export const aiReferrals = sqliteTable('ai_referrals', {
  id:            integer('id').primaryKey({ autoIncrement: true }),
  referrer_host: text('referrer_host').notNull(),  // e.g. 'chatgpt.com', 'gemini.google.com'
  source:        text('source').notNull(),          // normalised: 'chatgpt' | 'gemini' | 'perplexity' | 'copilot' | 'claude' | ...
  landing_path:  text('landing_path'),
  client_id:     text('client_id'),                 // anonymous per-browser id (lcsa_vcid) → join citation to a later conversion
  created_at:    integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const rentalClicks = sqliteTable('rental_clicks', {
  id:            integer('id').primaryKey({ autoIncrement: true }),
  operator_slug: text('operator_slug').notNull(),
  created_at:    integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Generic first-party outbound-link tracking from guide pages — which external
// destinations (operators, partners, resources) readers click, and from which
// article. Instrumentation for content signal + any future trackable referral.
export const outboundClicks = sqliteTable('outbound_clicks', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  article_path: text('article_path').notNull(),
  dest_host:    text('dest_host').notNull(),
  dest_url:     text('dest_url').notNull(),
  created_at:   integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Natural-language vehicle searches — the raw query + parsed filters + result
// count. First-party intent + demand-gap data: what buyers ask for in their own
// words, and (result_count=0) what they wanted that we don't have in stock.
export const searchQueries = sqliteTable('search_queries', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  q:            text('q').notNull(),
  mode:         text('mode'),                 // 'navigate' (home) | 'filter' (listings)
  models:       text('models'),               // csv of parsed model values
  provinces:    text('provinces'),            // csv of parsed provinces
  min_price:    integer('min_price'),
  max_price:    integer('max_price'),
  min_mileage:  integer('min_mileage'),
  max_mileage:  integer('max_mileage'),
  min_year:     integer('min_year'),
  max_year:     integer('max_year'),
  matched:      integer('matched', { mode: 'boolean' }),  // did the parser understand anything?
  result_count: integer('result_count'),      // matches shown (filter mode); null on navigate
  client_id:    text('client_id'),
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
  source:        text('source').notNull(), // 'whatsapp' | 'call' | 'email' | 'external' | 'finance_calc' | ...
  client_id:     text('client_id'),        // anonymous per-browser id (lcsa_vcid) → attribute a contact click to a prior AI referral
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
  client_id:     text('client_id'),              // anonymous per-browser id (lcsa_vcid) → join to a prior AI referral
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
  client_id:     text('client_id'),              // anonymous per-browser id — groups repeat valuations
  created_at:    integer('created_at', { mode: 'timestamp' }).notNull(),
});

export type ValuationRequest = typeof valuationRequests.$inferSelect;

// Indicative valuation certificate — a downloadable PDF issued off a valuation
// result. The vehicle + valuation are denormalised here so the cert is an
// immutable point-in-time snapshot (the live cohort moves; the certificate must
// not). Anonymous by default; email/consent are present ONLY when the user opted
// into "email me a copy" (the only PII this table holds). See
// docs/valuation-certificate-spec.md.
export const valuationCertificates = sqliteTable('valuation_certificates', {
  id:             integer('id').primaryKey({ autoIncrement: true }),
  cert_id:        text('cert_id').notNull().unique(),       // public slug, e.g. 'LCSA-2026-7F3K9Q'
  draft_id:       integer('draft_id'),                       // → valuation_requests.id (linkage)
  // vehicle (declared)
  model:          text('model').notNull(),
  year:           integer('year').notNull(),
  mileage:        integer('mileage').notNull(),
  condition:      text('condition'),
  province:       text('province'),
  spec_label:     text('spec_label'),                        // e.g. '2.5 D-4D Raised Body'
  cohort_label:   text('cohort_label'),
  // valuation as issued (immutable)
  sell_low:       integer('sell_low').notNull(),
  sell_mid:       integer('sell_mid').notNull(),
  sell_high:      integer('sell_high').notNull(),
  asking_ceiling: integer('asking_ceiling').notNull(),
  confidence:     text('confidence').notNull(),
  cohort_size:    integer('cohort_size'),
  cohort_p25:     integer('cohort_p25'),
  cohort_p75:     integer('cohort_p75'),
  cohort_p90:     integer('cohort_p90'),
  // artifact
  pdf_url:        text('pdf_url'),
  issued_at:      integer('issued_at', { mode: 'timestamp' }).notNull(),
  expires_at:     integer('expires_at', { mode: 'timestamp' }).notNull(),
  // captured lead — contact is REQUIRED to download a certificate (PII)
  name:           text('name'),
  phone:          text('phone'),
  email:          text('email'),
  consent_at:     integer('consent_at', { mode: 'timestamp' }),
  emailed_at:     integer('emailed_at', { mode: 'timestamp' }),
  dealer_offer_optin: integer('dealer_offer_optin', { mode: 'boolean' }).notNull().default(false),
  // attribution
  source_path:    text('source_path'),
  utm_source:     text('utm_source'),
});

export type ValuationCertificate = typeof valuationCertificates.$inferSelect;

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

// General enquiries from the floating chat widget (site-wide). DB-first then
// emailed to both addresses.
export const enquiries = sqliteTable('enquiries', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  name:        text('name'),
  phone:       text('phone'),
  email:       text('email'),
  message:     text('message').notNull(),
  source_path: text('source_path'),
  created_at:  integer('created_at', { mode: 'timestamp' }).notNull(),
});
export type Enquiry = typeof enquiries.$inferSelect;

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

// ── Public user accounts ─────────────────────────────────────────────────────
// Passwordless (magic-link) accounts. A row is created the first time someone
// requests a sign-in link; verified_at is stamped when they click a link (which
// proves email ownership — no separate double-opt-in needed). No password is
// ever stored. consent_at records POPIA consent to receive alert emails.
export const users = sqliteTable('users', {
  id:            integer('id').primaryKey({ autoIncrement: true }),
  email:         text('email').notNull().unique(),    // stored lower-cased + trimmed
  name:          text('name'),                          // optional display name, editable on /account
  verified_at:   integer('verified_at', { mode: 'timestamp' }),   // first successful magic-link click
  consent_at:    integer('consent_at', { mode: 'timestamp' }),    // POPIA: agreed to alert emails
  last_login_at: integer('last_login_at', { mode: 'timestamp' }),
  disabled:      integer('disabled', { mode: 'boolean' }).notNull().default(false), // admin kill-switch
  created_at:    integer('created_at', { mode: 'timestamp' }).notNull(),
});
export type User = typeof users.$inferSelect;

// One-time magic-link tokens. The raw token is emailed; only its SHA-256 hash is
// stored here, so a DB leak can't be used to log in. Single-use (used_at) and
// short-lived (expires_at).
export const loginTokens = sqliteTable('login_tokens', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  user_id:    integer('user_id').notNull(),
  token_hash: text('token_hash').notNull().unique(),   // sha256(raw token)
  expires_at: integer('expires_at', { mode: 'timestamp' }).notNull(),
  used_at:    integer('used_at', { mode: 'timestamp' }),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull(),
});
export type LoginToken = typeof loginTokens.$inferSelect;

// A user's saved/favourited listings. baseline_price is the asking price at the
// moment they saved it — the reference point for future "price dropped" alerts.
export const favorites = sqliteTable('favorites', {
  id:                integer('id').primaryKey({ autoIncrement: true }),
  user_id:           integer('user_id').notNull(),
  listing_slug:      text('listing_slug').notNull(),
  listing_id:        integer('listing_id'),
  baseline_price:    integer('baseline_price'),
  last_notified_price: integer('last_notified_price'),   // dedup: last price we alerted on
  last_notified_at:  integer('last_notified_at', { mode: 'timestamp' }),
  created_at:        integer('created_at', { mode: 'timestamp' }).notNull(),
}, t => ({
  userListingIdx: uniqueIndex('favorites_user_listing').on(t.user_id, t.listing_slug),
}));
export type Favorite = typeof favorites.$inferSelect;

// ── IG Hero Engine ───────────────────────────────────────────────────────────
// Post log — one row per IG publish (listing carousels and article images).
// slot records the job the post was doing (hero/deal/drop/article) so the slot
// planner can pace the weekly mix and outcomes roll up per slot; 'legacy' marks
// rows backfilled from before this table existed (slot unknown).
export const igPosts = sqliteTable('ig_posts', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  listing_id: integer('listing_id'),                    // null for article posts
  slug:       text('slug'),                              // listing slug or article slug
  slot:       text('slot').notNull().default('hero'),   // 'hero' | 'deal' | 'drop' | 'article' | 'legacy'
  media_id:   text('media_id'),                          // IG media id — insights join key
  caption:    text('caption'),
  posted_at:  integer('posted_at', { mode: 'timestamp' }).notNull(),
});
export type IgPost = typeof igPosts.$inferSelect;

// Per-post IG metric snapshots, appended by the daily insights sync while a
// post is < 30 days old. Per-metric nullable — availability varies by Graph API
// version and account type. Replaces the manual monthly Meta CSV export.
export const igPostMetrics = sqliteTable('ig_post_metrics', {
  id:                 integer('id').primaryKey({ autoIncrement: true }),
  media_id:           text('media_id').notNull(),
  fetched_at:         integer('fetched_at', { mode: 'timestamp' }).notNull(),
  views:              integer('views'),
  reach:              integer('reach'),
  likes:              integer('likes'),
  comments:           integer('comments'),
  saves:              integer('saves'),
  shares:             integer('shares'),
  profile_visits:     integer('profile_visits'),
  follows:            integer('follows'),
  total_interactions: integer('total_interactions'),
});

// One row per morning suggestion — powers the engine's real KPI: acceptance
// ("did Wesley post the #1 suggestion?"), not score deltas.
export const igSuggestionLog = sqliteTable('ig_suggestion_log', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  date:       text('date').notNull(),                   // SAST YYYY-MM-DD
  slot:       text('slot').notNull(),
  listing_id: integer('listing_id'),                    // null on cta days
  score:      integer('score'),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// A user's saved search — criteria for "alert me when a matching Cruiser is
// listed". Pre-created here; the matching cron + UI land in the alerts phase.
export const savedSearches = sqliteTable('saved_searches', {
  id:               integer('id').primaryKey({ autoIncrement: true }),
  user_id:          integer('user_id').notNull(),
  label:            text('label'),               // human label, e.g. "200-series diesel < R800k"
  model:            text('model'),
  price_min:        integer('price_min'),
  price_max:        integer('price_max'),
  year_min:         integer('year_min'),
  year_max:         integer('year_max'),
  province:         text('province'),
  transmission:     text('transmission'),
  fuel_type:        text('fuel_type'),
  segment:          text('segment').notNull().default('land-cruiser'),
  last_notified_at: integer('last_notified_at', { mode: 'timestamp' }),
  active:           integer('active', { mode: 'boolean' }).notNull().default(true),
  created_at:       integer('created_at', { mode: 'timestamp' }).notNull(),
});
export type SavedSearch = typeof savedSearches.$inferSelect;
