// Process-local per-key rate limiter. Good enough on our single Fly machine —
// the window resets on deploy, which is fine for abuse-throttling (not billing).
// Callers namespace the key per endpoint (e.g. `upload:1.2.3.4`) so buckets
// from different routes never collide.
const buckets = new Map<string, number[]>();

// Returns true when this hit puts the key OVER `max` within `windowMs`.
export function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter(t => now - t < windowMs);
  arr.push(now);
  buckets.set(key, arr);
  // Cheap unbounded-growth guard: drop emptied buckets when the map gets large.
  if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.length) buckets.delete(k);
  return arr.length > max;
}

export function clientIp(request: Request): string {
  return request.headers.get('fly-client-ip')
    || (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
    || 'unknown';
}
