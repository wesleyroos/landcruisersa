// Per-source kill switches — set env var to '1' to disable a source
export function isSourceEnabled(source: string): boolean {
  const key = `DISABLE_SOURCE_${source.toUpperCase()}`;
  return import.meta.env[key] !== '1' && process.env[key] !== '1';
}
