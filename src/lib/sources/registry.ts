// Per-source kill switches — set env var to '1' to disable a source
export function isSourceEnabled(source: string): boolean {
  const key = `DISABLE_SOURCE_${source.toUpperCase()}`;
  const env = typeof process !== 'undefined' ? process.env : {};
  return env[key] !== '1';
}
