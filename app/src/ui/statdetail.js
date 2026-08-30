/**
 * Per-metric breakdowns.
 *
 * The overview used to be one undifferentiated dump of eight numbers. Each
 * tile now opens the same number expressed several ways, because "32,283
 * hours" means very little until you also read "1,344 days" and "16h 38m a
 * day". Pure functions returning plain data, so they unit-test without a DOM.
 */

const HOUR = 3.6e6, DAY = 8.64e7;
const int = (n) => Math.round(n).toLocaleString();
const one = (n) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });

function dur(ms) {
  const h = Math.floor(ms / HOUR), m = Math.round((ms % HOUR) / 60000);
  if (h >= 1) return `${int(h)}h ${String(m).padStart(2, '0')}m`;
  if (m >= 1) return `${m} min`;
  return `${Math.max(0, Math.round(ms / 1000))}s`;
}

/** Rough real-world anchors, so a huge number lands as something imaginable. */
function scaleOf(ms) {
  const days = ms / DAY;
  if (days >= 365) return `about ${one(days / 365)} years of non-stop playback`;
  if (days >= 30) return `about ${one(days / 30.44)} months of non-stop playback`;
  if (days >= 1) return `${one(days)} days of non-stop playback`;
  return `${one(ms / HOUR)} hours of playback`;
}

/**
 * @param {string} key   which tile was opened
 * @param {object} r     the current query result
 * @returns {{title:string, lead:string, facts:Array<{value:string,label:string}>}|null}
 */
export function statDetail(key, r) {
  if (!r) return null;
  const perDay = r.days ? r.totalMs / r.days : 0;
  const counted = r.counted || 0;
  const short = Math.max(0, r.plays - counted);

  const F = (value, label) => ({ value, label });

  switch (key) {
    case 'time':
      return {
        title: 'Time listened',
        lead: 'Real millisecond durations from your file — not an estimate from play counts.',
        facts: [
          F(dur(r.totalMs), 'Total'),
          F(`${int(r.totalMs / 60000)} min`, 'In minutes'),
          F(`${int(r.totalMs / HOUR)} h`, 'In hours'),
          F(`${one(r.totalMs / DAY)} days`, 'End to end'),
          F(dur(perDay), 'On an average day you listened'),
          F(scaleOf(r.totalMs), 'Put another way'),
        ],
      };
    case 'plays':
      return {
        title: 'Songs played',
        lead: 'Spotify counts a play at 30 seconds. Anything shorter is a skip, so both numbers are shown.',
        facts: [
          F(int(r.plays), 'Times you pressed play'),
          F(int(counted), 'Counted plays (30s or more)'),
          F(int(short), 'Stopped before 30 seconds'),
          F(`${r.plays ? one(counted / r.plays * 100) : 0}%`, 'Made it past 30s'),
          F(r.days ? one(r.plays / r.days) : '0', 'Songs on an average day'),
          F(r.distinctTracks ? one(r.plays / r.distinctTracks) : '0', 'Plays per different song'),
        ],
      };
    case 'days':
      return {
        title: 'Days with music',
        lead: 'Days where you played at least one thing.',
        facts: [
          F(int(r.days), 'Days with listening'),
          F(dur(perDay), 'Average on those days'),
          F(`${one(r.days / 7)} weeks`, 'If you stacked them up'),
          F(r.days ? one(r.plays / r.days) : '0', 'Songs per listening day'),
        ],
      };
    case 'tracks':
      return {
        title: 'Different songs',
        lead: 'Counted once each, however many times you played them.',
        facts: [
          F(int(r.distinctTracks), 'Different songs'),
          F(int(r.distinctArtists), 'Different artists'),
          F(int(r.distinctAlbums), 'Different albums'),
          F(r.distinctArtists ? one(r.distinctTracks / r.distinctArtists) : '0', 'Songs per artist'),
          F(r.distinctTracks ? one(r.plays / r.distinctTracks) : '0', 'Average plays each'),
        ],
      };
    case 'artists':
      return {
        title: 'Different artists',
        lead: 'How wide your listening spreads, rather than how deep.',
        facts: [
          F(int(r.distinctArtists), 'Different artists'),
          F(int(r.distinctAlbums), 'Different albums'),
          F(r.distinctArtists ? dur(r.totalMs / r.distinctArtists) : '0s', 'Average time per artist'),
          F(r.distinctArtists ? one(r.distinctTracks / r.distinctArtists) : '0', 'Songs per artist'),
        ],
      };
    case 'skips':
      return {
        title: 'Skipped',
        lead: 'Worked out from why playback stopped, not from Spotify’s own skip flag — that field is empty for years of older history.',
        facts: [
          F(`${r.plays ? one(r.skips / r.plays * 100) : 0}%`, 'Of plays you cut short'),
          F(int(r.skips), 'Times you skipped'),
          F(int(r.plays - r.skips), 'Times you let it run'),
          F(r.days ? one(r.skips / r.days) : '0', 'Skips on an average day'),
        ],
      };
    case 'avg':
      return {
        title: 'Average a day',
        lead: 'Across days you actually listened, not across the whole calendar.',
        facts: [
          F(dur(perDay), 'On a listening day'),
          F(dur(r.totalMs / Math.max(1, r.days) / 24 * 24), 'Same figure, exact'),
          F(`${r.days ? one(perDay / HOUR / 24 * 100) : 0}%`, 'Of a whole day'),
          F(r.days ? one(r.plays / r.days) : '0', 'Songs per listening day'),
        ],
      };
    default:
      return null;
  }
}

/** The tiles, in order. `key` links a tile to its breakdown. */
export const STAT_TILES = [
  { key: 'time', label: 'Time listened', hero: true },
  { key: 'minutes', label: 'Minutes', detail: 'time' },
  { key: 'plays', label: 'Songs played' },
  { key: 'days', label: 'Days with music' },
  { key: 'tracks', label: 'Different songs' },
  { key: 'artists', label: 'Different artists' },
  { key: 'skips', label: 'Skipped' },
  { key: 'avg', label: 'Average a day' },
];
