/**
 * Outbound links to Spotify.
 *
 * No API, no token, no login — these are just search URLs. On desktop the web
 * player opens in a new tab; on a phone the Spotify app claims the same URL and
 * opens the search there, so "find this on Spotify" works on both without any
 * platform detection.
 *
 * The export also carries a `spotify_track_uri`, and a direct link is better
 * than a search when we have one — it lands on the exact recording rather than
 * whatever the search ranks first.
 */

/** spotify:track:ID → https://open.spotify.com/track/ID */
export function trackUrlFromUri(uri) {
  const m = /^spotify:track:([A-Za-z0-9]+)$/.exec(String(uri || '').trim());
  return m ? `https://open.spotify.com/track/${m[1]}` : null;
}

const q = (s) => encodeURIComponent(String(s || '').trim());

/** Search URL. Quoting the title keeps multi-word names together. */
export function searchUrl(title, artist) {
  const parts = [title, artist].filter(Boolean).join(' ').trim();
  if (!parts) return 'https://open.spotify.com';
  return `https://open.spotify.com/search/${q(parts)}`;
}

/**
 * Best available link for a row: the exact track when we have its URI,
 * otherwise a search. Never returns null, so a row is always clickable.
 */
export function linkFor({ uri, title, artist } = {}) {
  return trackUrlFromUri(uri) || searchUrl(title, artist);
}

/** Human-readable description, used for the link's accessible name. */
export const linkLabel = ({ title, artist } = {}) =>
  `Find ${title || 'this'}${artist ? ` by ${artist}` : ''} on Spotify`;
