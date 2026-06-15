// Per-source kill switches — set env var to '1' to disable a source
export function isSourceEnabled(source: string): boolean {
  const key = `DISABLE_SOURCE_${source.toUpperCase()}`;
  const env = typeof process !== 'undefined' ? process.env : {};
  return env[key] !== '1';
}

// Adjacent Toyota 4x4s (Hilux, Fortuner) can be collected into the DB for the
// market-data moat but are NEVER shown on landcruisersa.co.za. Default OFF and
// toggled per-source from /admin/scrapers: each ingest script calls
// applyExtraSegments() (see extra-config.ts) to set this from the live config
// before discover() runs. The flag is read at discover() time, not module load.
let _collectExtraSegments = false;
export function setCollectExtraSegments(on: boolean): void {
  _collectExtraSegments = on;
}
export function collectExtraSegments(): boolean {
  return _collectExtraSegments;
}
