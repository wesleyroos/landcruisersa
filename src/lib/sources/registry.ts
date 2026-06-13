// Per-source kill switches — set env var to '1' to disable a source
export function isSourceEnabled(source: string): boolean {
  const key = `DISABLE_SOURCE_${source.toUpperCase()}`;
  const env = typeof process !== 'undefined' ? process.env : {};
  return env[key] !== '1';
}

// Adjacent Toyota 4x4s (Hilux, Fortuner) are collected into the DB for the
// market-data moat but NOT shown on landcruisersa.co.za. On by default;
// set DISABLE_EXTRA_SEGMENTS=1 to make every scraper revert to LC-only.
export function collectExtraSegments(): boolean {
  const env = typeof process !== 'undefined' ? process.env : {};
  return env.DISABLE_EXTRA_SEGMENTS !== '1';
}
