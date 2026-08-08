import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';

// Guide pages are now SSR (their live state is admin-controlled), so they're no
// longer auto-discovered by @astrojs/sitemap. List them here at build time,
// skipping any file that ships as draft/unlisted in its frontmatter. (Runtime
// unlisting is handled by the page's own noindex/404 — this is the build-time
// baseline; re-deploy refreshes it.)
const POSTS_DIR = 'src/content/posts';
const guidePages = fs.readdirSync(POSTS_DIR)
  .filter((f) => f.endsWith('.mdx'))
  .filter((f) => {
    const fm = (fs.readFileSync(path.join(POSTS_DIR, f), 'utf8').split('---')[1] || '');
    return !/^\s*draft:\s*true/m.test(fm) && !/^\s*unlisted:\s*true/m.test(fm);
  })
  .map((f) => `https://landcruisersa.co.za/useful-info/${f.replace(/\.mdx$/, '')}/`);

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
    '/product-category/4x4-accessories': '/',
    '/product-category/4x4-accessories/': '/',
    '/refund_returns': '/',
    // Legacy WP article URLs still taking live 404 traffic (Ahrefs Web Analytics
    // 31-Jul) — two are just old slugs for articles that still exist → recover them.
    '/useful-info/off-road-recovery-techniques-sand-mud-and-winching-guide': '/useful-info/off-road-recovery-techniques/',
    '/useful-info/off-road-recovery-techniques-sand-mud-and-winching-guide/': '/useful-info/off-road-recovery-techniques/',
    '/useful-info/landcruisersa-co-za-plug-a-4x4-tyre': '/useful-info/how-to-plug-a-4x4-tyre/',
    '/useful-info/landcruisersa-co-za-plug-a-4x4-tyre/': '/useful-info/how-to-plug-a-4x4-tyre/',
    '/uncategorised/5-easy-meals-to-make-while-overlanding': '/useful-info/5-easy-meals-while-overlanding/',
    '/uncategorised/5-easy-meals-to-make-while-overlanding/': '/useful-info/5-easy-meals-while-overlanding/',
    '/terms-and-conditions': '/terms/',
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
        // SSR guide pages (draft/unlisted files excluded above)
        ...guidePages,
      ],
      // Keep admin pages out of the sitemap. (Guide draft/unlisted exclusions are
      // now handled where guidePages is built, above.)
      filter: (page) => !page.includes('/admin/'),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
