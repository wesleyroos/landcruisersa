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
  featured:     integer('featured', { mode: 'boolean' }).notNull().default(false),
  review_flag:  integer('review_flag', { mode: 'boolean' }).notNull().default(false),
  ig_posted_at: integer('ig_posted_at', { mode: 'timestamp' }),    // last posted to Instagram
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
