const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Fetch an AutoTrader listing page and extract the seller's description + colour.
// AT must be fetched from a residential IP (datacenter IPs are blocked), so this
// only works locally — used by the desc-backfill endpoint and the local cron.
export async function fetchAtDetails(sourceUrl: string): Promise<{ description: string; colour: string }> {
  const res = await fetch(sourceUrl, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(15_000),
  });
  // A removed listing (404) is a genuine "nothing here" — return empty so the
  // backfill counts it as a skip. But any other non-OK, and the tiny shell AT
  // serves when it rate-limits/blocks an IP, must THROW: the backfill counts a
  // throw as a failure (so its block-abort can engage), whereas an empty return
  // is miscounted as "this listing has no description" and the run grinds on
  // through thousands of blocked fetches, marking them all permanently empty.
  if (res.status === 404) return { description: '', colour: '' };
  if (!res.ok) throw new Error(`AutoTrader returned ${res.status} for ${sourceUrl}`);
  const html = await res.text();
  if (html.length < 5000 || /Just a moment|cf-challenge|cf-browser-verification|Attention Required/i.test(html)) {
    throw new Error(`AutoTrader served a block/challenge page for ${sourceUrl}`);
  }

  const decode = (s: string) =>
    s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
     .replace(/&#x([0-9A-Fa-f]+);/g, (_: string, h: string) => String.fromCodePoint(parseInt(h, 16))).trim();

  // Legacy server-rendered markup: description across e-read-more-line spans
  const spans = [...html.matchAll(/<span[^>]*e-read-more-line[^>]*>([\s\S]*?)<\/span>/g)];
  let description = spans.map(m => decode(m[1])).filter(Boolean).join('\n');

  // 2026 AT pages are JS shells — seller comments live in embedded JSON.
  // Take the longest "description" value (dealer comments beat the short
  // auto-generated JSON-LD blurb when both exist); ignore tiny marketing strings.
  if (!description) {
    const candidates = [...html.matchAll(/"description":\s*"((?:[^"\\]|\\.)*)"/g)]
      .map(m => { try { return JSON.parse(`"${m[1]}"`) as string; } catch { return ''; } })
      .filter(s => s.length >= 200);
    if (candidates.length) {
      description = candidates.sort((a, b) => b.length - a.length)[0].trim();
    }
  }

  const colourMatch =
    html.match(/Colou?r<\/span>\s*<span[^>]*>([^<]+)<\/span>/) ??
    html.match(/"colou?r"\s*:\s*"([^"]{2,30})"/i);
  const colour = colourMatch ? colourMatch[1].trim() : '';

  return { description, colour };
}
