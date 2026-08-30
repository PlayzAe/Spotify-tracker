/**
 * Normalization rules for the Spotify Extended Streaming History export.
 *
 * Every rule here is validated against a real 160,634-record export.
 * Do not "simplify" these without reading research/spotify-platform/ first —
 * each one prevents a silent, plausible-looking wrong answer.
 */

/* ------------------------------------------------------------------ *
 * Which files in the archive matter.
 *
 * CRITICAL: zip entries are NESTED. A real entry looks like
 *   my_spotify_data/Spotify Extended Streaming History/Streaming_History_Audio_2021.json
 * Matching on the full entry name finds ZERO files. Match the basename.
 * ------------------------------------------------------------------ */
export const basename = (p) => p.split(/[\\/]/).pop() || p;

export const isAudioHistory = (path) =>
  /^Streaming_History_Audio_.*\.json$/i.test(basename(path));

export const isVideoHistory = (path) =>
  /^Streaming_History_Video_.*\.json$/i.test(basename(path));

/* Files that tell us the user requested the WRONG export (DE-2). */
export const isAccountDataMarker = (path) => {
  const b = basename(path);
  return /^(Playlist\d*|YourLibrary|SearchQueries|Follow|Userdata|Identity|Payments|Marquee)\b.*\.json$/i.test(b);
};

export const isReadme = (path) => /^ReadMe.*\.(pdf|txt)$/i.test(basename(path));

/* ------------------------------------------------------------------ *
 * Derived skip (DE-13).
 *
 * The raw `skipped` field is unpopulated before 2022-10. Filtering on it
 * reports a 0.00% skip rate for older history — which renders as
 * "you never skip anything" rather than as a bug.
 *
 * Verified: derived is a strict SUPERSET of raw. Across 160,634 records
 * there were zero cases of skipped===true with a reason_end outside this set,
 * so the OR introduces no false negatives.
 * ------------------------------------------------------------------ */
const SKIP_REASONS = new Set(['backbtn', 'unknown', 'endplay', 'fwdbtn']);

export const isSkipped = (r) =>
  r.skipped === true || SKIP_REASONS.has(r.reason_end);

/* ------------------------------------------------------------------ *
 * Counted play threshold (DE-15).
 * Spotify counts a stream at 30,000 ms. Below that it is a skip, not a play.
 * Removes 9.1% of records in the test export — meaningful, not cosmetic.
 * ------------------------------------------------------------------ */
export const MIN_PLAY_MS = 30000;

/* ------------------------------------------------------------------ *
 * Track grouping key (DE-14).
 *
 * The same recording carries different spotify_track_uri values across
 * single / album / reissue. Grouping by URI splits one song into several rows.
 *
 * NOTE the correction: the regex published in the PRD and the frontend brief
 * also stripped `remix` and `edit`, which merged genuinely different
 * recordings — e.g. "Hot (Remix) [feat. Gunna and Travis Scott]" collapsed
 * into "Hot (feat. Gunna)". That is the last.fm over-merge failure the brief
 * itself lists as a hard NO. Those two tokens are deliberately absent below.
 *
 * Under-merging is cosmetic. Over-merging is wrong data.
 * ------------------------------------------------------------------ */
const PAREN_NOISE = /\s*[([][^)\]]*?(remaster|feat|version)[^)\]]*?[)\]]/gi;
const TRAILING_REMASTER = /\s*-\s*\d{4}\s*remaster.*$/i;

/* Normalize each part SEPARATELY, then join.
 *
 * The regex as published in the PRD ran over the combined `title|artist`
 * string, where `- \d{4} remaster.*$` greedily ate the delimiter and the
 * artist along with it: "Song - 2011 Remaster|Artist" collapsed to "song".
 * Two different artists covering the same title then shared one key —
 * silently merging their play counts. Caught by unit test, not by eye. */
const clean = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(PAREN_NOISE, '')
    .replace(TRAILING_REMASTER, '')
    .replace(/\s+/g, ' ')
    .trim();

export function trackKey(title, artist) {
  return `${clean(title)}|${clean(artist)}`;
}

/* ------------------------------------------------------------------ *
 * Platform normalization.
 *
 * Not in any requirement — found in the real data. Spotify changed the
 * platform string format mid-history, so one export contains both bare
 * tokens ("windows") and verbose device strings
 * ("Windows 10 (10.0.18363; x64; AppX)").
 *
 * The test export had 14 distinct strings: three Windows, five Android.
 * Un-normalized, the "device breakdown" card renders noise.
 * ------------------------------------------------------------------ */
export const PLATFORMS = ['Windows', 'Android', 'Android tablet', 'Web player', 'iOS', 'macOS', 'TV / console', 'Other'];

export function platformClass(p) {
  const s = (p || '').toLowerCase();
  if (!s) return 7;
  if (s.startsWith('web_player')) return 3;
  if (s.includes('android-tablet')) return 2;
  if (s.startsWith('android')) return 1;
  if (s.includes('ios') || s.includes('iphone') || s.includes('ipad')) return 4;
  if (s.startsWith('windows')) return 0;
  // Spotify writes this as "OS X 10.15.7 [x86, 0]" — with a space.
  if (s.includes('osx') || s.includes('os x') || s.includes('mac')) return 5;
  if (s.includes('webos') || s.includes('partner') || s.includes('_tv') || s.includes('cast')) return 6;
  return 7;
}

/* ------------------------------------------------------------------ *
 * Record classification (DE-12).
 * Four classes, not three — `audiobook_*` fields exist in current exports
 * and were absent from the documented schema.
 * ------------------------------------------------------------------ */
export const KIND = { MUSIC: 0, PODCAST: 1, AUDIOBOOK: 2, LOCAL: 3, UNKNOWN: 4 };

export function classify(r) {
  if (r.spotify_episode_uri || r.episode_name) return KIND.PODCAST;
  if (r.audiobook_uri || r.audiobook_title) return KIND.AUDIOBOOK;
  if (r.master_metadata_track_name) {
    return r.spotify_track_uri ? KIND.MUSIC : KIND.LOCAL;
  }
  return KIND.UNKNOWN;
}

/* Fields we know about. Anything else is format drift and must be reported —
 * the audiobook_* group is exactly how this requirement earned its keep. */
export const KNOWN_FIELDS = new Set([
  'ts', 'platform', 'ms_played', 'conn_country', 'ip_addr',
  'master_metadata_track_name', 'master_metadata_album_artist_name',
  'master_metadata_album_album_name', 'spotify_track_uri',
  'episode_name', 'episode_show_name', 'spotify_episode_uri',
  'audiobook_title', 'audiobook_uri', 'audiobook_chapter_uri', 'audiobook_chapter_title',
  'reason_start', 'reason_end', 'shuffle', 'skipped', 'offline',
  'offline_timestamp', 'incognito_mode',
]);

/* ------------------------------------------------------------------ *
 * `ts` is the END of a stream, not the start.
 *
 * Undocumented by Spotify and absent from every project doc before testing.
 * Proven on 137,153 back-to-back autoplay pairs: the gap between consecutive
 * timestamps matched the CURRENT track's duration 83.5% of the time and the
 * PREVIOUS track's 0.3% of the time. Reading ts as the start also inflates
 * apparent overlap from 0.42% to 13.6% of total listening time.
 *
 * Matters for sessions, streaks and day-boundary attribution: a track
 * finishing at 00:04 belongs to the previous day.
 * ------------------------------------------------------------------ */
export const startEpochSec = (tsIso, msPlayed) =>
  Math.floor(Date.parse(tsIso) / 1000) - Math.floor((msPlayed || 0) / 1000);

/* ------------------------------------------------------------------ *
 * Range boundaries, in the user's own timezone.
 *
 * JavaScript parses "2025-12-31" as UTC midnight but "2025-12-31T23:59:59"
 * as LOCAL time. Mixing the two — which a date picker and a preset button
 * naturally do — leaves gaps and overlaps at every range edge: in UTC+1 a
 * play at 23:57Z on Dec 31 fell into neither 2025 nor 2026.
 *
 * Everything else in the engine buckets by local time (hour-of-day and
 * weekday are only meaningful locally), so ranges resolve locally too.
 * ------------------------------------------------------------------ */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function rangeBoundSec(value, edge /* 'start' | 'end' */) {
  if (value === null || value === undefined || value === '') {
    return edge === 'start' ? -Infinity : Infinity;
  }
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  if (typeof value === 'number') return Math.floor(value / 1000);

  if (DATE_ONLY.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    // new Date(2025, 12, 45) silently rolls over to February 2026. Validate the
    // parts, then confirm the constructed date is the one that was asked for —
    // a bad bound must be ignored, never quietly become a different range.
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const dt = edge === 'start'
        ? new Date(y, m - 1, d, 0, 0, 0, 0)
        : new Date(y, m - 1, d, 23, 59, 59, 999);
      if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) {
        return Math.floor(dt.getTime() / 1000);
      }
    }
    return edge === 'start' ? -Infinity : Infinity;
  }
  const t = Date.parse(value);
  return Number.isNaN(t) ? (edge === 'start' ? -Infinity : Infinity) : Math.floor(t / 1000);
}
