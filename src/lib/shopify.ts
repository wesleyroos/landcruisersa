// Curve Gear (Shopify) integration for the affiliate storefront.
//
// Auth uses Shopify's client-credentials grant: we POST the app's client id +
// secret to the shop's token endpoint and get back a 24h Admin API access token
// (no OAuth redirect — the "Affiliate - LCSA" app is installed on Curve Gear's
// own store, which is the one case Shopify allows this grant). We never persist
// the token; we mint on demand and cache it in-memory until just before expiry.
//
// Requires the app to be INSTALLED on curve-gear.myshopify.com — until then the
// token endpoint returns `app_not_installed`.
//
// Env (server-only — the secret must never reach the browser):
//   SHOPIFY_CG_SHOP           e.g. curve-gear.myshopify.com
//   SHOPIFY_CG_CLIENT_ID
//   SHOPIFY_CG_CLIENT_SECRET

const SHOP = process.env.SHOPIFY_CG_SHOP ?? import.meta.env.SHOPIFY_CG_SHOP ?? '';
const CLIENT_ID = process.env.SHOPIFY_CG_CLIENT_ID ?? import.meta.env.SHOPIFY_CG_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.SHOPIFY_CG_CLIENT_SECRET ?? import.meta.env.SHOPIFY_CG_CLIENT_SECRET ?? '';

// Pin an API version so a shop-side default bump can't change our query shape.
const API_VERSION = '2026-07';

export const shopifyConfigured = () => Boolean(SHOP && CLIENT_ID && CLIENT_SECRET);

type CachedToken = { token: string; expiresAt: number };
let cached: CachedToken | null = null;

export class ShopifyError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = 'ShopifyError';
  }
}

// Mint (or reuse) an Admin API access token via the client-credentials grant.
// Cached until 60s before the 24h expiry so we never call the API with a token
// that's about to lapse mid-request.
export async function getAdminToken(): Promise<string> {
  if (!shopifyConfigured()) {
    throw new ShopifyError('Shopify not configured — set SHOPIFY_CG_SHOP / _CLIENT_ID / _CLIENT_SECRET', 'not_configured');
  }
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    // The token endpoint returns HTML on error (e.g. app_not_installed), not JSON.
    const body = await res.text();
    const code = /app_not_installed/.test(body) ? 'app_not_installed' : `http_${res.status}`;
    const hint = code === 'app_not_installed'
      ? ' — the "Affiliate - LCSA" app is not installed on the store yet'
      : '';
    throw new ShopifyError(`Token mint failed (${res.status})${hint}`, code);
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new ShopifyError('Token endpoint returned no access_token', 'no_token');

  cached = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 86_399) * 1000,
  };
  return cached.token;
}

// Call the Admin GraphQL API with a freshly-ensured token. Throws on transport
// or GraphQL errors so callers can decide how to degrade.
export async function adminGraphql<T = any>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const token = await getAdminToken();
  const res = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new ShopifyError(`Admin GraphQL HTTP ${res.status}`, `http_${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new ShopifyError(json.errors.map(e => e.message).join('; '), 'graphql');
  return json.data as T;
}

export type ShopifyProduct = {
  id: string;
  handle: string;
  title: string;
  status: string;
  featuredImage: string | null;
  priceMin: number;
  priceMax: number;
  currency: string;
  totalInventory: number;
  variantId: string | null; // first variant — used for cart permalinks
  onlineStoreUrl: string | null;
};

const PRODUCTS_QUERY = /* GraphQL */ `
  query Products($cursor: String) {
    products(first: 50, after: $cursor, sortKey: TITLE) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        title
        status
        totalInventory
        onlineStoreUrl
        featuredImage { url }
        priceRangeV2 {
          minVariantPrice { amount currencyCode }
          maxVariantPrice { amount currencyCode }
        }
        variants(first: 1) { nodes { id } }
      }
    }
  }
`;

// Pull the full product catalogue (paginated). We'll narrow to a curated
// collection once Curve Gear tags the LCSA set; for now this lets us see
// everything available to pick from.
export async function fetchAllProducts(): Promise<ShopifyProduct[]> {
  const out: ShopifyProduct[] = [];
  let cursor: string | null = null;

  do {
    const data = await adminGraphql<{
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: any[];
      };
    }>(PRODUCTS_QUERY, { cursor });

    for (const n of data.products.nodes) {
      out.push({
        id: n.id,
        handle: n.handle,
        title: n.title,
        status: n.status,
        featuredImage: n.featuredImage?.url ?? null,
        priceMin: Number(n.priceRangeV2?.minVariantPrice?.amount ?? 0),
        priceMax: Number(n.priceRangeV2?.maxVariantPrice?.amount ?? 0),
        currency: n.priceRangeV2?.minVariantPrice?.currencyCode ?? 'ZAR',
        totalInventory: n.totalInventory ?? 0,
        variantId: n.variants?.nodes?.[0]?.id ?? null,
        onlineStoreUrl: n.onlineStoreUrl ?? null,
      });
    }

    cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (cursor);

  return out;
}
