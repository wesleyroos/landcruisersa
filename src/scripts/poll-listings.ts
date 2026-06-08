import { db } from '../db/index';
import { listings } from '../db/schema';
import { eq, and, isNotNull } from 'drizzle-orm';

// AutoTrader listing IDs look like /12345678 at the end of the URL
function extractListingId(url: string): string | null {
  const m = url.match(/\/(\d{6,})(?:\?|$|\/)/);
  return m ? m[1] : null;
}

async function checkUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });

    if (res.status === 404 || res.status === 410) return true;

    const html = await res.text();

    // Extract <title> — a removed listing will have a generic error title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch?.[1]?.toLowerCase() ?? '';

    // If the title has error/not-found indicators → sold
    if (/not found|page not found|listing not found|error|404|removed/i.test(title)) return true;

    // If the listing ID is no longer in the title → likely redirected to error page
    const listingId = extractListingId(url);
    if (listingId && !html.includes(listingId)) return true;

    return false;
  } catch {
    return false; // network error — don't mark as sold
  }
}

async function main() {
  const active = await db
    .select()
    .from(listings)
    .where(and(eq(listings.status, 'active'), isNotNull(listings.source_url)));

  console.log(`Polling ${active.length} active listings…`);

  let markedSold = 0;

  for (const listing of active) {
    if (!listing.source_url) continue;

    const isSold = await checkUrl(listing.source_url);

    if (isSold) {
      await db
        .update(listings)
        .set({ status: 'sold' })
        .where(eq(listings.id, listing.id));

      console.log(`  [SOLD] ${listing.slug} — ${listing.source_url}`);
      markedSold++;
    } else {
      console.log(`  [OK]   ${listing.slug}`);
    }

    // polite delay between requests
    await new Promise(r => setTimeout(r, 800));
  }

  console.log(`\nDone. ${markedSold} listing(s) marked as sold.`);
}

main().catch(err => {
  console.error('Poll failed:', err);
  process.exit(1);
});
