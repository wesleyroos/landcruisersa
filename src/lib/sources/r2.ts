// Rehost AutoTrader images to our own R2 bucket. AutoTrader's image CDN
// (img.autotrader.co.za) rate-limits hotlinks hard — ~half of requests 503 even
// with a valid referer — so listings that point straight at it show broken
// images. Run from the LOCAL ingest (residential IP); prod can't fetch AT.
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET ?? 'landcruisersa';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL ?? 'https://pub-6c900fb2e73a4b89bc049099101e4591.r2.dev';

const AT_IMG = /^https:\/\/img\.autotrader\.co\.za\/(\d+)/;

let _s3: S3Client | null = null;
function s3(): S3Client | null {
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) return null;
  if (!_s3) {
    _s3 = new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    });
  }
  return _s3;
}

export function r2Configured(): boolean {
  return Boolean(R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);
}

async function objectExists(client: S3Client, key: string): Promise<boolean> {
  try { await client.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key })); return true; }
  catch { return false; }
}

// Download an image, retrying AT's rate-limit 503s with backoff.
async function fetchImage(url: string, tries = 4): Promise<{ body: Buffer; type: string } | null> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Referer': 'https://www.autotrader.co.za/',
          'Accept': 'image/avif,image/webp,image/*,*/*',
        },
        signal: AbortSignal.timeout(20_000),
      });
      const type = res.headers.get('content-type') ?? '';
      if (res.ok && type.startsWith('image/')) {
        return { body: Buffer.from(await res.arrayBuffer()), type };
      }
      if (res.status === 503 || res.status === 429 || res.status >= 500) {
        await new Promise(r => setTimeout(r, 1500 * (i + 1))); // back off the rate limiter
        continue;
      }
      return null; // genuine 4xx → give up
    } catch {
      await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
  }
  return null;
}

// Rehost any AutoTrader image URLs to R2; pass other hosts (WBC, etc.) through
// unchanged. Same-length output: an AT image that can't be fetched keeps its
// original URL as a fallback. Idempotent — keyed by the AT image id, skipped if
// already in the bucket.
export async function rehostAutotraderImages(urls: string[]): Promise<string[]> {
  const client = s3();
  if (!client) return urls; // R2 not configured → no-op
  const out: string[] = [];
  for (const url of urls) {
    const m = url.match(AT_IMG);
    if (!m) { out.push(url); continue; }
    const key = `listings/at/${m[1]}.jpg`;
    const publicUrl = `${R2_PUBLIC_URL}/${key}`;
    if (await objectExists(client, key)) { out.push(publicUrl); continue; }
    const img = await fetchImage(url);
    if (!img) { out.push(url); continue; }
    try {
      await client.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: img.body,
        ContentType: img.type,
        CacheControl: 'public, max-age=31536000, immutable',
      }));
      out.push(publicUrl);
    } catch {
      out.push(url); // upload failed → keep original
    }
  }
  return out;
}
