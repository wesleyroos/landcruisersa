/**
 * Copies every R2 object to itself with Cache-Control: public, max-age=31536000, immutable
 * so Cloudflare CDN caches images permanently on first fetch.
 *
 * Run: node --env-file=.env scripts/fix-r2-cache-headers.mjs
 */

import { S3Client, ListObjectsV2Command, CopyObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET;
const TARGET_CACHE = 'public, max-age=31536000, immutable';

let listed = 0, fixed = 0, skipped = 0, failed = 0;
let continuationToken;

do {
  const res = await s3.send(new ListObjectsV2Command({
    Bucket: BUCKET,
    ContinuationToken: continuationToken,
  }));

  const objects = res.Contents ?? [];
  listed += objects.length;

  for (const obj of objects) {
    const key = obj.Key;

    // Check existing Cache-Control
    let head;
    try {
      head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    } catch {
      console.log(`  SKIP (head failed): ${key}`);
      skipped++;
      continue;
    }

    if (head.CacheControl === TARGET_CACHE) {
      skipped++;
      continue;
    }

    // Copy to self with new metadata
    try {
      await s3.send(new CopyObjectCommand({
        Bucket: BUCKET,
        CopySource: `${BUCKET}/${key}`,
        Key: key,
        ContentType: head.ContentType,
        CacheControl: TARGET_CACHE,
        MetadataDirective: 'REPLACE',
      }));
      fixed++;
      process.stdout.write(`✓ ${key}\n`);
    } catch (err) {
      failed++;
      console.log(`  FAILED: ${key} — ${err.message}`);
    }
  }

  continuationToken = res.NextContinuationToken;
} while (continuationToken);

console.log(`\nDone — ${listed} objects listed, ${fixed} fixed, ${skipped} already correct, ${failed} failed`);
