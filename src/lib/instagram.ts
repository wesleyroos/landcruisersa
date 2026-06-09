import { db } from '@/db/index';
import { siteConfig } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { Listing } from '@/db/schema';

const IG_API           = 'https://graph.instagram.com/v21.0';
const IG_AUTH_URL      = 'https://www.instagram.com/oauth/authorize';
const IG_TOKEN_URL     = 'https://api.instagram.com/oauth/access_token';
const IG_LONG_TOKEN    = 'https://graph.instagram.com/access_token';
const IG_REFRESH_TOKEN = 'https://graph.instagram.com/refresh_access_token';

export interface IgCredentials {
  userId:      string;
  accessToken: string;
  username:    string;
}

// ─── Config helpers ───────────────────────────────────────────────────────────

async function getConfig(key: string): Promise<string | null> {
  const row = db.select().from(siteConfig).where(eq(siteConfig.key, key)).get();
  return row?.value ?? null;
}

async function setConfig(key: string, value: string) {
  db.insert(siteConfig)
    .values({ key, value, updated_at: new Date() })
    .onConflictDoUpdate({ target: siteConfig.key, set: { value, updated_at: new Date() } })
    .run();
}

async function deleteConfig(key: string) {
  db.delete(siteConfig).where(eq(siteConfig.key, key)).run();
}

// ─── Credentials ──────────────────────────────────────────────────────────────

export async function getCredentials(): Promise<IgCredentials | null> {
  const [userId, accessToken, username] = await Promise.all([
    getConfig('ig_user_id'),
    getConfig('ig_access_token'),
    getConfig('ig_username'),
  ]);
  if (!userId || !accessToken || !username) return null;
  return { userId, accessToken, username };
}

export async function saveCredentials(creds: IgCredentials) {
  await Promise.all([
    setConfig('ig_user_id',      creds.userId),
    setConfig('ig_access_token', creds.accessToken),
    setConfig('ig_username',     creds.username),
  ]);
}

export async function clearCredentials() {
  await Promise.all([
    deleteConfig('ig_user_id'),
    deleteConfig('ig_access_token'),
    deleteConfig('ig_username'),
  ]);
}

// ─── OAuth state (CSRF nonce, 10-minute TTL) ──────────────────────────────────

export async function saveOAuthState(state: string) {
  await setConfig('ig_oauth_state', `${state}:${Date.now()}`);
}

export async function verifyAndClearOAuthState(state: string): Promise<boolean> {
  const stored = await getConfig('ig_oauth_state');
  if (!stored) return false;
  const colonIdx = stored.lastIndexOf(':');
  const storedState = stored.slice(0, colonIdx);
  const ts = Number(stored.slice(colonIdx + 1));
  await deleteConfig('ig_oauth_state');
  return storedState === state && Date.now() - ts < 10 * 60 * 1000;
}

// ─── OAuth URL ────────────────────────────────────────────────────────────────

export function buildOAuthUrl(appId: string, redirectUri: string, state: string): string {
  return `${IG_AUTH_URL}?${new URLSearchParams({
    client_id:     appId,
    redirect_uri:  redirectUri,
    scope:         'instagram_business_basic,instagram_business_content_publish',
    response_type: 'code',
    state,
  })}`;
}

// ─── Token exchange ───────────────────────────────────────────────────────────

export async function exchangeCodeForToken(
  code: string, appId: string, appSecret: string, redirectUri: string,
): Promise<string> {
  const res  = await fetch(IG_TOKEN_URL, {
    method: 'POST',
    body: new URLSearchParams({ client_id: appId, client_secret: appSecret, grant_type: 'authorization_code', redirect_uri: redirectUri, code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_message ?? 'Token exchange failed');
  return data.access_token;
}

export async function exchangeForLongLivedToken(shortToken: string, appSecret: string): Promise<string> {
  const res  = await fetch(`${IG_LONG_TOKEN}?${new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: appSecret, access_token: shortToken })}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? 'Long-lived token exchange failed');
  return data.access_token;
}

export async function refreshLongLivedToken(accessToken: string): Promise<string> {
  const res  = await fetch(`${IG_REFRESH_TOKEN}?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: accessToken })}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? 'Token refresh failed');
  return data.access_token;
}

export async function getIgUserInfo(accessToken: string): Promise<{ id: string; username: string }> {
  const res  = await fetch(`${IG_API}/me?fields=id,username&access_token=${accessToken}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? 'Failed to get user info');
  return { id: data.id, username: data.username };
}

// ─── Media publishing ─────────────────────────────────────────────────────────

async function createChildContainer(userId: string, accessToken: string, imageUrl: string): Promise<string> {
  const res  = await fetch(`${IG_API}/${userId}/media`, {
    method: 'POST',
    body: new URLSearchParams({ image_url: imageUrl, is_carousel_item: 'true', access_token: accessToken }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? `Failed to create carousel item: ${imageUrl}`);
  return data.id;
}

async function waitForContainer(containerId: string, accessToken: string, maxAttempts = 20): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const res  = await fetch(`${IG_API}/${containerId}?fields=status_code&access_token=${accessToken}`);
    const data = await res.json();
    if (data.status_code === 'FINISHED') return;
    if (data.status_code === 'ERROR') throw new Error(`Container ${containerId} entered ERROR state`);
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error(`Container ${containerId} timed out`);
}

async function createSingleContainer(userId: string, accessToken: string, imageUrl: string, caption: string): Promise<string> {
  const res  = await fetch(`${IG_API}/${userId}/media`, {
    method: 'POST',
    body: new URLSearchParams({ image_url: imageUrl, caption, access_token: accessToken }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? 'Failed to create image container');
  return data.id;
}

async function createCarouselContainer(userId: string, accessToken: string, childIds: string[], caption: string): Promise<string> {
  const res  = await fetch(`${IG_API}/${userId}/media`, {
    method: 'POST',
    body: new URLSearchParams({ media_type: 'CAROUSEL', children: childIds.join(','), caption, access_token: accessToken }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? 'Failed to create carousel container');
  return data.id;
}

async function publishMedia(userId: string, accessToken: string, creationId: string, attempt = 0): Promise<string> {
  const res  = await fetch(`${IG_API}/${userId}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: creationId, access_token: accessToken }),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data.error?.message ?? 'Failed to publish media';
    // Instagram sometimes reports the container as FINISHED but isn't ready to publish yet
    if (attempt < 4 && msg.includes('not available')) {
      await new Promise(r => setTimeout(r, 5000));
      return publishMedia(userId, accessToken, creationId, attempt + 1);
    }
    throw new Error(msg);
  }
  return data.id;
}

// ─── Caption builder ──────────────────────────────────────────────────────────

const MODEL_TAGS: Record<string, string> = {
  '70-series':  '#LC70 #LandCruiser70',
  '76-series':  '#LC76 #LandCruiser76',
  '79-series':  '#LC79 #LandCruiser79',
  '100-series': '#LC100 #LandCruiser100',
  '200-series': '#LC200 #LandCruiser200',
  '300-series': '#LC300 #LandCruiser300',
  'other':      '#LandCruiser',
};

export function buildCaption(listing: Listing): string {
  const modelTag   = MODEL_TAGS[listing.model] ?? '#LandCruiser';
  const modelLabel = listing.model.replace(/-/g, ' ').toUpperCase();
  const lines: string[] = [];

  if (listing.listing_type === 'for_sale') {
    lines.push(`${listing.year} Land Cruiser ${modelLabel} — R${listing.price.toLocaleString('en-ZA')}`);
    lines.push(`📍 ${listing.province} | ${listing.mileage.toLocaleString('en-ZA')} km | ${listing.transmission} | ${listing.fuel_type ?? 'Diesel'}`);
  } else {
    lines.push(`${listing.year} Land Cruiser ${modelLabel}`);
    lines.push(`📍 ${listing.province}`);
  }

  lines.push('');
  const desc = listing.description.trim();
  lines.push(desc.length <= 300 ? desc : desc.slice(0, 297) + '…');

  if (listing.mods) {
    lines.push('');
    lines.push('🔧 ' + listing.mods.trim().slice(0, 200));
  }

  lines.push('');
  lines.push('📲 Link in bio to view full listing');
  lines.push('');
  lines.push(`#LandCruiserSA ${modelTag} #4x4SouthAfrica #4x4SA #OffRoad #LandCruiser #TLC`);
  if (listing.listing_type === 'for_sale') lines.push('#LandCruiserForSale #4x4ForSale');

  return lines.join('\n');
}

// ─── Main post function ───────────────────────────────────────────────────────

export async function postListingToInstagram(listing: Listing, creds: IgCredentials): Promise<string> {
  const photos: string[] = JSON.parse(listing.photos);
  if (!photos.length) throw new Error('Listing has no photos');

  const imageUrls = photos.slice(0, 10); // IG carousel max 10
  const caption   = buildCaption(listing);

  if (imageUrls.length === 1) {
    const containerId = await createSingleContainer(creds.userId, creds.accessToken, imageUrls[0], caption);
    await waitForContainer(containerId, creds.accessToken);
    return publishMedia(creds.userId, creds.accessToken, containerId);
  }

  // Carousel: create + await each child, then create carousel container + publish
  const childIds: string[] = [];
  for (const url of imageUrls) {
    const childId = await createChildContainer(creds.userId, creds.accessToken, url);
    await waitForContainer(childId, creds.accessToken);
    childIds.push(childId);
  }

  const carouselId = await createCarouselContainer(creds.userId, creds.accessToken, childIds, caption);
  return publishMedia(creds.userId, creds.accessToken, carouselId);
}
