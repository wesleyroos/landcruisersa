import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

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
  status:       text('status').notNull().default('pending'), // 'pending' | 'active' | 'sold'
  fuel_type:    text('fuel_type'),                           // 'Diesel' | 'Petrol' | 'Hybrid' | 'Electric'
  fuel_consumption: real('fuel_consumption'),                // L/100km
  power_kw:     integer('power_kw'),                        // kW
  seats:        integer('seats'),
  co2:          integer('co2'),                             // g/km
  source_url:   text('source_url'),                          // original listing URL for polling
  created_at:   integer('created_at', { mode: 'timestamp' }).notNull(),
});

export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
