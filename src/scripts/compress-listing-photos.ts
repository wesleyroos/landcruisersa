import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';

// One-off (re-runnable) backfill: re-compress every private-seller upload under
// uploads/listings/ in R2. Originals were stored raw — 6–10MB phone photos that
// made listing pages crawl. This resizes to a 1920px max edge and re-encodes as
// quality JPEG (~150–300KB), OVERWRITING each object in place (same key, so no DB
// changes). Idempotent: already-small objects are skipped.
//
// Runs locally with direct R2 access (no prod, no AutoTrader IP issues):
//   R2_ENDPOINT=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
//     npx tsx src/scripts/compress-listing-photos.ts          # dry run (default)
//   ... APPLY=1 npx tsx src/scripts/compress-listing-photos.ts # actually overwrite

const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET ?? 'landcruisersa';

const PREFIX = 'uploads/listings/';
const MAX_EDGE = 1920;
const SKIP_BELOW = 500 * 1024; // already-small objects are left alone
const APPLY = process.env.APPLY === '1';

sharp.concurrency(1);

async function streamToBuffer(body: any): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function run() {
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('R2 not configured (R2_ENDPOINT / keys missing)');
  }
  const s3 = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });

  console.log(`[backfill] ${APPLY ? 'APPLY' : 'DRY RUN'} — scanning ${PREFIX} …`);
  let token: string | undefined;
  let scanned = 0, processed = 0, skipped = 0, failed = 0;
  let bytesBefore = 0, bytesAfter = 0;

  do {
    const list = await s3.send(new ListObjectsV2Command({
      Bucket: R2_BUCKET, Prefix: PREFIX, ContinuationToken: token,
    }));
    token = list.IsTruncated ? list.NextContinuationToken : undefined;

    for (const obj of list.Contents ?? []) {
      const key = obj.Key!;
      const size = obj.Size ?? 0;
      scanned++;
      if (size < SKIP_BELOW) { skipped++; continue; }

      try {
        const got = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
        const input = await streamToBuffer(got.Body);
        const output = await sharp(input, { limitInputPixels: 40_000_000, failOn: 'none' })
          .rotate()
          .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 78, mozjpeg: true })
          .toBuffer();

        // Don't bother rewriting if compression barely helps (already optimised).
        if (output.length >= input.length * 0.95) {
          skipped++;
          continue;
        }

        bytesBefore += input.length;
        bytesAfter += output.length;
        const pct = Math.round((1 - output.length / input.length) * 100);
        console.log(`  ${key}  ${(input.length / 1e6).toFixed(1)}MB → ${(output.length / 1e6).toFixed(2)}MB  (-${pct}%)`);

        if (APPLY) {
          await s3.send(new PutObjectCommand({
            Bucket: R2_BUCKET, Key: key, Body: output,
            ContentType: 'image/jpeg',
            CacheControl: 'public, max-age=31536000, immutable',
          }));
        }
        processed++;
      } catch (e) {
        failed++;
        console.warn(`  FAILED ${key}: ${(e as Error).message}`);
      }
    }
  } while (token);

  console.log(
    `[backfill] done. scanned=${scanned} ${APPLY ? 'rewrote' : 'would rewrite'}=${processed} ` +
    `skipped=${skipped} failed=${failed}  ` +
    `${(bytesBefore / 1e6).toFixed(0)}MB → ${(bytesAfter / 1e6).toFixed(0)}MB`,
  );
  if (!APPLY && processed > 0) console.log('[backfill] re-run with APPLY=1 to overwrite.');
}

run().catch((e) => { console.error(e); process.exit(1); });
