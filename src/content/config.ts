import { defineCollection, z } from 'astro:content';

const posts = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    excerpt: z.string(),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    category: z.enum(['useful-info', 'partners', 'gear', 'routes', 'builds']),
    featuredImage: z.string(),
    featuredImageAlt: z.string(),
    metaTitle: z.string().optional(),
    metaDescription: z.string().max(160).optional(),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
    // Unlisted: built + reachable by direct URL, but hidden from every listing,
    // the sitemap, related/recent sidebars, IG auto-posting and search indexing
    // (noindex). For private preview shares (e.g. sending a link for sign-off).
    unlisted: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    // Optional Q&A pairs — rendered as FAQPage JSON-LD for AI/search citation
    faqs: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  }),
});

const products = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    price: z.number(),
    comparePrice: z.number().optional(),
    images: z.array(z.string()),
    category: z.enum(['accessories', 'apparel', 'gear']),
    inStock: z.boolean().default(true),
    sku: z.string().optional(),
    metaDescription: z.string().max(160).optional(),
    featured: z.boolean().default(false),
    soldOut: z.boolean().default(false),
  }),
});

export const collections = { posts, products };
