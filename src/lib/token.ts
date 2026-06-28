import { createHmac, randomBytes, createHash, timingSafeEqual } from 'node:crypto';

// Signing secret for session cookies and any HMAC tokens. Prefer a dedicated
// AUTH_SECRET; fall back to ADMIN_SECRET so the feature still works if only the
// existing admin secret is set. Sessions are invalid (and sign-in is impossible)
// until one of these is configured — fail closed, never sign with a blank key.
function secret(): string | null {
  const s = import.meta.env.AUTH_SECRET ?? process.env.AUTH_SECRET
    ?? import.meta.env.ADMIN_SECRET ?? process.env.ADMIN_SECRET ?? '';
  return s ? String(s) : null;
}

// Domain-separated key for user-session cookies. We derive it from the base
// secret rather than signing with the secret directly — so even when the secret
// falls back to ADMIN_SECRET (which is also the raw admin cookie value), the
// user-session signing key is a distinct one-way derivation, never the admin
// bearer itself. Set a dedicated AUTH_SECRET in prod for full separation.
function sessionKey(): string | null {
  const s = secret();
  if (!s) return null;
  return createHmac('sha256', s).update('lcsa-user-session-v1').digest('hex');
}

// URL-safe base64 without padding (cookie/URL friendly).
function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function hmac(data: string, key: string): string {
  return b64url(createHmac('sha256', key).update(data).digest());
}

// Timing-safe string compare that never throws on length mismatch.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// ── One-time magic-link tokens ───────────────────────────────────────────────
// The raw token is emailed to the user; only sha256(raw) is stored in the DB, so
// a database leak cannot be replayed into a login.
export function randomToken(): string {
  return randomBytes(32).toString('hex');
}
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

// ── Stateless signed session value ───────────────────────────────────────────
// Format: base64url(JSON payload).hmac  — tamper-evident, carries its own expiry.
export interface SessionPayload {
  uid: number;
  exp: number; // unix seconds
}

export function signSession(payload: SessionPayload): string | null {
  const key = sessionKey();
  if (!key) return null;
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  return `${body}.${hmac(body, key)}`;
}

export function verifySession(value: string | undefined | null): SessionPayload | null {
  if (!value) return null;
  const key = sessionKey();
  if (!key) return null;
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!safeEqual(sig, hmac(body, key))) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString('utf8')) as SessionPayload;
    if (!payload || typeof payload.uid !== 'number' || typeof payload.exp !== 'number') return null;
    if (payload.exp * 1000 < Date.now()) return null; // expired
    return payload;
  } catch {
    return null;
  }
}

export function authConfigured(): boolean {
  return secret() !== null;
}
