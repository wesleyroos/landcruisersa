import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://landcruisersa.co.za',
  // 'static' = static by default; individual pages/endpoints use `export const prerender = false` to opt into SSR
  output: 'static',
  // 301 redirects for renamed posts — preserve SEO equity from old URLs.
  // (Middleware can't do this in static output: it doesn't run for paths with no page.)
  redirects: {
    '/useful-info/hiring-a-land-cruiser-in-sa': '/useful-info/land-cruiser-rental-south-africa/',
    '/useful-info/hiring-a-fully-equipped-land-cruiser-for-ultimate-overlanding-adventures-in-south-africa': '/useful-info/land-cruiser-rental-south-africa/',
    // Old slug still indexed + getting ~261 organic visits/mo → recover it.
    '/useful-info/land-cruiser-300-series-the-stats': '/useful-info/land-cruiser-300-series-stats/',
    // Renamed articles + old training URL (were 404ing in GA/Plausible).
    '/useful-info/the-land-cruiser-history': '/useful-info/land-cruiser-history/',
    '/useful-info/5-easy-meals-to-make-while-overlanding': '/useful-info/5-easy-meals-while-overlanding/',
    '/4x4-training': '/training/',
    '/partners/ironman-4x4': '/partners/',
    // Dead WordPress/WooCommerce shop URLs from the old site — no store now.
    '/shop': '/',
    '/store': '/',
    '/product-category/clothing': '/',
    '/product-category/clothing/caps': '/',
    '/product/outdoor-fixed-blade-limited-edition': '/',
  },
  security: {
    checkOrigin: false,
  },
  adapter: node({ mode: 'standalone' }),
  integrations: [
    mdx(),
    sitemap({
      // SSR pages aren't auto-discovered — add them manually
      customPages: [
        'https://landcruisersa.co.za/',
        'https://landcruisersa.co.za/about/',
        'https://landcruisersa.co.za/listings/',
        // Province pages
        'https://landcruisersa.co.za/listings/province/gauteng/',
        'https://landcruisersa.co.za/listings/province/western-cape/',
        'https://landcruisersa.co.za/listings/province/kwazulu-natal/',
        'https://landcruisersa.co.za/listings/province/eastern-cape/',
        'https://landcruisersa.co.za/listings/province/limpopo/',
        'https://landcruisersa.co.za/listings/province/mpumalanga/',
        'https://landcruisersa.co.za/listings/province/north-west/',
        'https://landcruisersa.co.za/listings/province/free-state/',
        'https://landcruisersa.co.za/listings/province/northern-cape/',
        // Model pages
        'https://landcruisersa.co.za/listings/model/76-series/',
        'https://landcruisersa.co.za/listings/model/78-series/',
        'https://landcruisersa.co.za/listings/model/79-series/',
        'https://landcruisersa.co.za/listings/model/80-series/',
        'https://landcruisersa.co.za/listings/model/100-series/',
        'https://landcruisersa.co.za/listings/model/200-series/',
        'https://landcruisersa.co.za/listings/model/300-series/',
        'https://landcruisersa.co.za/listings/model/prado/',
        'https://landcruisersa.co.za/listings/model/fj-cruiser/',
        // Body-type vertical
        'https://landcruisersa.co.za/game-viewers/',
        // Valuation tool — hub + per-model citeable pages
        'https://landcruisersa.co.za/valuation/',
        'https://landcruisersa.co.za/valuation/76-series/',
        'https://landcruisersa.co.za/valuation/78-series/',
        'https://landcruisersa.co.za/valuation/79-series/',
        'https://landcruisersa.co.za/valuation/80-series/',
        'https://landcruisersa.co.za/valuation/100-series/',
        'https://landcruisersa.co.za/valuation/200-series/',
        'https://landcruisersa.co.za/valuation/300-series/',
        'https://landcruisersa.co.za/valuation/prado-150/',
        'https://landcruisersa.co.za/valuation/prado-250/',
        'https://landcruisersa.co.za/valuation/fj-cruiser/',
        'https://landcruisersa.co.za/valuation/land-cruiser-fj/',
        // Live market data pages (AI/search citation layer)
        'https://landcruisersa.co.za/market/',
        'https://landcruisersa.co.za/market/70-series/',
        'https://landcruisersa.co.za/market/76-series/',
        'https://landcruisersa.co.za/market/79-series/',
        'https://landcruisersa.co.za/market/100-series/',
        'https://landcruisersa.co.za/market/200-series/',
        'https://landcruisersa.co.za/market/300-series/',
        'https://landcruisersa.co.za/market/prado-150/',
        'https://landcruisersa.co.za/market/prado-250/',
        'https://landcruisersa.co.za/market/fj-cruiser/',
        'https://landcruisersa.co.za/market/78-series/',
        'https://landcruisersa.co.za/market/80-series/',
        'https://landcruisersa.co.za/market/land-cruiser-fj/',
        // Toyota Hilux & Fortuner market data (public data layer)
        'https://landcruisersa.co.za/market/hilux-gd6/',
        'https://landcruisersa.co.za/market/hilux-d4d/',
        'https://landcruisersa.co.za/market/fortuner-gd6/',
        'https://landcruisersa.co.za/market/fortuner-d4d/',
      ],
      // Keep admin pages — and unlisted previews (Faan collection, canopy-guide
      // draft) — out of the sitemap. Remove a slug here when its post publishes.
      filter: (page) => !page.includes('/admin/')
        && !page.includes('/inside-the-webuycars-land-cruiser-collection')
        && !page.includes('/land-cruiser-canopies-trays-south-africa'),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
