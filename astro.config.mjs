import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://landcruisersa.co.za',
  // 'static' = static by default; individual pages/endpoints use `export const prerender = false` to opt into SSR
  output: 'static',
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
      ],
      // Keep admin pages out of the sitemap
      filter: (page) => !page.includes('/admin/'),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
