/**
 * Pull Curve Gear's Shopify catalogue via the client-credentials grant and
 * print it, so we can pick which products go in the "Land Cruiser SA" collection.
 *
 * Run: node --env-file=.env scripts/shopify-pull-products.mjs
 *      node --env-file=.env scripts/shopify-pull-products.mjs --json   # raw JSON
 *
 * Requires the "Affiliate - LCSA" app to be INSTALLED on curve-gear.myshopify.com.
 * Until then Shopify returns `app_not_installed` and this prints the exact fix.
 *
 * This is a plain-Node mirror of src/lib/shopify.ts (no TS/Astro import needed).
 */

const SHOP = process.env.SHOPIFY_CG_SHOP;
const CLIENT_ID = process.env.SHOPIFY_CG_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CG_CLIENT_SECRET;
const API_VERSION = '2026-07';
const asJson = process.argv.includes('--json');

if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
  console.error('✗ Missing env. Set SHOPIFY_CG_SHOP / _CLIENT_ID / _CLIENT_SECRET in .env');
  process.exit(1);
}

async function getToken() {
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
    const body = await res.text();
    if (/app_not_installed/.test(body)) {
      console.error(`\n✗ app_not_installed — the credentials are valid, but the "Affiliate - LCSA" app`);
      console.error(`  is not installed on ${SHOP} yet.`);
      console.error(`  → Ask Neil to install the app on the store, then re-run this. Nothing else needed.\n`);
    } else {
      console.error(`\n✗ Token mint failed (HTTP ${res.status}). First 300 chars:\n`, body.slice(0, 300));
    }
    process.exit(1);
  }
  const { access_token } = await res.json();
  return access_token;
}

const PRODUCTS_QUERY = `
  query Products($cursor: String) {
    products(first: 50, after: $cursor, sortKey: TITLE) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id handle title status totalInventory
        featuredImage { url }
        priceRangeV2 { minVariantPrice { amount currencyCode } maxVariantPrice { amount } }
        variants(first: 1) { nodes { id } }
      }
    }
  }
`;

async function gql(token, query, variables) {
  const res = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join('; '));
  return json.data;
}

const token = await getToken();
console.error(`✓ Token minted against ${SHOP}\n`);

const products = [];
let cursor = null;
do {
  const data = await gql(token, PRODUCTS_QUERY, { cursor });
  for (const n of data.products.nodes) {
    products.push({
      id: n.id,
      title: n.title,
      handle: n.handle,
      status: n.status,
      inventory: n.totalInventory ?? 0,
      price: Number(n.priceRangeV2?.minVariantPrice?.amount ?? 0),
      currency: n.priceRangeV2?.minVariantPrice?.currencyCode ?? 'ZAR',
      image: n.featuredImage?.url ?? null,
      variantId: n.variants?.nodes?.[0]?.id ?? null,
    });
  }
  cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
} while (cursor);

if (asJson) {
  console.log(JSON.stringify(products, null, 2));
} else {
  const fmt = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: products[0]?.currency ?? 'ZAR' });
  console.log(`${products.length} products in ${SHOP}:\n`);
  for (const p of products) {
    const price = p.price ? fmt.format(p.price) : '—';
    const stock = p.status === 'ACTIVE' ? `${p.inventory} in stock` : p.status.toLowerCase();
    console.log(`• ${p.title.padEnd(45)} ${price.padStart(12)}  (${stock})`);
  }
  console.log(`\nTip: --json for full data (variant ids, images) to build the collection page.`);
}
