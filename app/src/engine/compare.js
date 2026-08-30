/**
 * Compare two uploaded histories.
 *
 * Both files are parsed in the same browser tab. Nothing is uploaded, no account
 * is needed, and neither person's data reaches a server — which is the one thing
 * stats.fm's compare feature cannot say.
 *
 * The export carries NO username, display name or profile picture (verified
 * against a real export: the only identifying fields are ip_addr and
 * conn_country, and neither is used). Labels are typed by whoever is at the
 * keyboard, and avatars are generated from the label.
 */

/** Overlap between two ranked lists, keyed on a stable identity. */
function overlap(left, right, idOf, limit) {
  const rank = new Map();
  right.forEach((r, i) => rank.set(idOf(r), { row: r, rank: i + 1 }));

  const shared = [];
  left.forEach((l, i) => {
    const hit = rank.get(idOf(l));
    if (!hit) return;
    shared.push({
      key: idOf(l),
      title: l.title,
      artist: l.artist || '',
      album: l.album || '',
      a: { rank: i + 1, ms: l.ms, plays: l.plays },
      b: { rank: hit.rank, ms: hit.row.ms, plays: hit.row.plays },
      // Positive = higher (better) on the left. Used to sort by disagreement.
      gap: hit.rank - (i + 1),
      bestRank: Math.min(i + 1, hit.rank),
    });
  });
  shared.sort((x, y) => x.bestRank - y.bestRank);
  return limit ? shared.slice(0, limit) : shared;
}

const tid = (r) => `${(r.title || '').toLowerCase()}|${(r.artist || '').toLowerCase()}`;
const aid = (r) => (r.title || '').toLowerCase();

/**
 * @param {object} A  query result from store A (use a large `limit`)
 * @param {object} B  query result from store B
 * @param {object} labels { a: 'You', b: 'Freddy' }
 */
export function compare(A, B, labels = { a: 'A', b: 'B' }, limit = 50) {
  const sharedArtists = overlap(A.artists, B.artists, aid, limit);
  const sharedTracks = overlap(A.tracks, B.tracks, tid, limit);
  const sharedAlbums = overlap(A.albums, B.albums, tid, limit);

  // Taste overlap: share of each side's listening time spent on artists the
  // other person also plays. Deliberately not a single "compatibility %" —
  // the two sides are usually very different, and averaging hides that.
  const bArtists = new Set(B.artists.map(aid));
  const aArtists = new Set(A.artists.map(aid));
  const msIn = (rows, set) => rows.reduce((n, r) => n + (set.has(aid(r)) ? r.ms : 0), 0);
  const aTotal = A.artists.reduce((n, r) => n + r.ms, 0);
  const bTotal = B.artists.reduce((n, r) => n + r.ms, 0);

  return {
    labels,
    totals: {
      a: { ms: A.totalMs, plays: A.plays, tracks: A.distinctTracks, artists: A.distinctArtists, albums: A.distinctAlbums },
      b: { ms: B.totalMs, plays: B.plays, tracks: B.distinctTracks, artists: B.distinctArtists, albums: B.distinctAlbums },
    },
    sharedArtists,
    sharedTracks,
    sharedAlbums,
    counts: {
      artists: overlap(A.artists, B.artists, aid).length,
      tracks: overlap(A.tracks, B.tracks, tid).length,
      albums: overlap(A.albums, B.albums, tid).length,
    },
    // Two numbers, not one. "You spend 34% of your time on artists they also
    // play; they spend 6% on artists you play" is honest; a single blended
    // score is not.
    overlapShare: {
      a: aTotal ? msIn(A.artists, bArtists) / aTotal : 0,
      b: bTotal ? msIn(B.artists, aArtists) / bTotal : 0,
    },
    // Where they disagree hardest about a shared artist — the fun part.
    biggestDisagreements: [...sharedArtists]
      .sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap))
      .slice(0, 10),
  };
}

/** Deterministic avatar from a typed label, since the export has no picture. */
export function avatarFor(label, size = 64) {
  const s = String(label || '?');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h >>>= 0;
  const hue = h % 360;
  const initial = ([...s.trim()][0] || '?').toUpperCase().replace(/[<&>]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
<circle cx="32" cy="32" r="32" fill="hsl(${hue} 46% 38%)"/>
<text x="32" y="42" font-family="system-ui,sans-serif" font-size="27" font-weight="600"
 fill="rgba(255,255,255,.9)" text-anchor="middle">${initial}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
