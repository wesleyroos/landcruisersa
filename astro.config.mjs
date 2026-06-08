import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://landcruisersa.co.za',
  // 'static' = static by default; individual pages/endpoints use `export const prerender = false` to opt into SSR
  output: 'static',
  adapter: node({ mode: 'standalone' }),
  integrations: [
    mdx(),
    sitemap(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
