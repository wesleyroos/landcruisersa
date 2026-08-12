// Combined social reach, for copy that promises an audience.
//
// Instagram is live (ig_account_snapshots, synced daily). Facebook has no API
// wired up, so FB_FOLLOWERS is a MANUAL figure — bump it when you check the
// page. Keep it deliberately conservative: this number appears in a paid offer,
// where overstating reach is a promise we can't keep.
//
// NOTE: /admin/media-kit carries its own hardcoded FB block (followers/reach/
// views/engagement, for the sponsor deck). Keep the follower figure there in
// step with this one.

import { igFollowers } from './ig-followers';

export const FB_FOLLOWERS = 9_500; // checked 2026-08-12 ("almost 10k, growing")

export function socialFollowers(): number {
  return igFollowers() + FB_FOLLOWERS;
}

// Rounded DOWN to the nearest thousand — never round a marketing claim up.
// Comma separators to match igFollowersDisplay(), so the numbers sitting next
// to each other in the same card are formatted the same way.
export function socialReachDisplay(): string {
  return (Math.floor(socialFollowers() / 1000) * 1000).toLocaleString('en-US');
}

export function fbFollowersDisplay(): string {
  return FB_FOLLOWERS.toLocaleString('en-US');
}
