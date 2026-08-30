/**
 * The store: ingest records, then re-slice them by range and filter.
 *
 * Deliberately free of DOM, Worker and zip concerns so it can be unit-tested
 * in plain Node. worker.js is a thin message wrapper around this.
 */
import {
  isSkipped, MIN_PLAY_MS, trackKey, platformClass, PLATFORMS,
  classify, KIND, KNOWN_FIELDS, startEpochSec, basename, rangeBoundSec,
} from './normalize.js';

export const FLAG = {
  SKIP: 1, SHUFFLE: 2, OFFLINE: 4, INCOGNITO: 8,
  COUNTED: 16, PODCAST: 32, AUDIOBOOK: 64, LOCAL: 128,
};
export const PLAT_SHIFT = 8;

export const SORTS = {
  time:      { label: 'Listening time', key: 'ms' },
  plays:     { label: 'Play count',     key: 'plays' },
  skips:     { label: 'Times skipped',  key: 'skips' },
  skipRate:  { label: 'Skip rate',      key: 'skipRate', minPlays: 5 },
  steady:    { label: 'Most consistent', key: 'steady' },
  weeks:     { label: 'Weeks in rotation', key: 'weeks' },
  first:     { label: 'First played',   key: 'first' },
  last:      { label: 'Last played',    key: 'last' },
  alpha:     { label: 'A–Z',            key: 'alpha' },
};

const bump = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);

export class Store {
  constructor() {
    this.col = { ts: [], tr: [], ar: [], al: [], ms: [], fl: [] };
    this.frozen = null;
    this.trackIds = new Map();  this.trackMeta = [];
    this.artistIds = new Map(); this.artistMeta = [];
    this.albumIds = new Map();  this.albumMeta = [];
    this.seen = new Set();
    this.unknownFields = new Map();
    this.countries = new Map();
    this.reasonEnd = new Map();
    this.reasonStart = new Map();
    this.stats = {
      filesParsed: 0, filesSkipped: [], records: 0, duplicates: 0,
      unparseable: 0, earliest: null, latest: null,
    };
  }

  #intern(map, meta, key, value) {
    let id = map.get(key);
    if (id === undefined) { id = meta.length; map.set(key, id); meta.push(value); }
    return id;
  }

  /** Returns true if the record was stored. */
  ingestRecord(r) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) { this.stats.unparseable++; return false; }
    if (typeof r.ts !== 'string' || Number.isNaN(Date.parse(r.ts))) {
      this.stats.unparseable++; return false;
    }
    for (const k in r) if (!KNOWN_FIELDS.has(k)) bump(this.unknownFields, k);

    const ms = Number.isFinite(r.ms_played) && r.ms_played > 0 ? Math.floor(r.ms_played) : 0;

    const fp = `${r.ts}|${ms}|${r.spotify_track_uri || ''}|${r.reason_start || ''}|${r.reason_end || ''}`;
    if (this.seen.has(fp)) { this.stats.duplicates++; return false; }
    this.seen.add(fp);

    if (!this.stats.earliest || r.ts < this.stats.earliest) this.stats.earliest = r.ts;
    if (!this.stats.latest || r.ts > this.stats.latest) this.stats.latest = r.ts;

    const kind = classify(r);
    let tr = -1, ar = -1, al = -1;
    if (kind === KIND.MUSIC || kind === KIND.LOCAL) {
      const title = r.master_metadata_track_name;
      const artist = r.master_metadata_album_artist_name || 'Unknown artist';
      const album = r.master_metadata_album_album_name || 'Unknown album';
      if (title) {
        tr = this.#intern(this.trackIds, this.trackMeta, trackKey(title, artist), [title, artist, album, r.spotify_track_uri || null]);
        ar = this.#intern(this.artistIds, this.artistMeta, artist, artist);
        al = this.#intern(this.albumIds, this.albumMeta, `${album}|${artist}`, [album, artist]);
      }
    }

    let fl = 0;
    if (isSkipped(r)) fl |= FLAG.SKIP;
    if (r.shuffle) fl |= FLAG.SHUFFLE;
    if (r.offline) fl |= FLAG.OFFLINE;
    if (r.incognito_mode) fl |= FLAG.INCOGNITO;
    if (ms >= MIN_PLAY_MS) fl |= FLAG.COUNTED;
    if (kind === KIND.PODCAST) fl |= FLAG.PODCAST;
    if (kind === KIND.AUDIOBOOK) fl |= FLAG.AUDIOBOOK;
    if (kind === KIND.LOCAL) fl |= FLAG.LOCAL;
    fl |= (platformClass(r.platform) & 7) << PLAT_SHIFT;

    this.col.ts.push(startEpochSec(r.ts, ms));
    this.col.tr.push(tr); this.col.ar.push(ar); this.col.al.push(al);
    this.col.ms.push(ms); this.col.fl.push(fl);

    if (r.conn_country) bump(this.countries, r.conn_country);
    if (r.reason_end) bump(this.reasonEnd, r.reason_end);
    if (r.reason_start) bump(this.reasonStart, r.reason_start);
    this.stats.records++;
    return true;
  }

  ingestFileText(name, text) {
    let arr;
    try { arr = JSON.parse(text); }
    catch { this.stats.filesSkipped.push({ name: basename(name), reason: 'not valid JSON' }); return false; }
    if (!Array.isArray(arr)) {
      this.stats.filesSkipped.push({ name: basename(name), reason: 'not a list of plays' }); return false;
    }
    for (const r of arr) this.ingestRecord(r);
    this.stats.filesParsed++;
    return true;
  }

  finalize() {
    const c = this.col;
    this.frozen = {
      ts: Int32Array.from(c.ts), tr: Int32Array.from(c.tr), ar: Int32Array.from(c.ar),
      al: Int32Array.from(c.al), ms: Int32Array.from(c.ms), fl: Int32Array.from(c.fl),
      n: c.ts.length,
    };
    this.col = { ts: [], tr: [], ar: [], al: [], ms: [], fl: [] };
    return this;
  }

  get size() { return this.frozen ? this.frozen.n : this.col.ts.length; }

  /** Resolve an artist name to the id used by query({ artist }). */
  artistId(name) {
    const id = this.artistIds.get(name);
    return id === undefined ? null : id;
  }

  /** Resolve an album to the id used by query({ album }). */
  albumId(title, artist) {
    const id = this.albumIds.get(`${title}|${artist}`);
    return id === undefined ? null : id;
  }

  /** Years present in the data — derived, never hardcoded. */
  years() {
    if (!this.stats.earliest) return [];
    const a = new Date(this.stats.earliest).getUTCFullYear();
    const b = new Date(this.stats.latest).getUTCFullYear();
    const out = [];
    for (let y = b; y >= a; y--) out.push(y);
    return out;
  }

  query(opts = {}) {
    if (!this.frozen) this.finalize();
    const t0 = (globalThis.performance?.now?.() ?? Date.now());
    const {
      from = null, to = null, platform = null, shuffle = null, offline = null,
      country = null, content = null, excludeIncognito = true,
      sort = 'time', minPlays = 0, limit = 25, offset = 0,
      q = '', artist = null, artistName = null, album = null, albumName = null,
    } = opts;
    const needle = String(q || '').trim().toLowerCase();
    const artistFilter = artistName != null ? this.artistId(artistName) : artist;
    const albumFilter = albumName != null ? this.albumId(albumName.title, albumName.artist) : album;

    // Resolved in the viewer's timezone; see rangeBoundSec for why.
    const a = rangeBoundSec(from, 'start');
    const b = rangeBoundSec(to, 'end');
    const { ts, tr, ar, al, ms, fl, n } = this.frozen;

    // Float64 everywhere a millisecond total accumulates. Int32 overflows at ~596 h.
    const T = new Map(), A = new Map(), L = new Map();
    const hours = new Float64Array(24), wdays = new Float64Array(7), plats = new Float64Array(8);
    const months = new Map(), days = new Set();
    let plays = 0, counted = 0, totalMs = 0, skips = 0, podMs = 0, musicMs = 0, shuffleN = 0, offlineN = 0;

    const ent = (m, id) => {
      let e = m.get(id);
      if (!e) { e = { id, plays: 0, raw: 0, ms: 0, skips: 0, first: Infinity, last: -Infinity, weeks: new Set(), peak: new Map() }; m.set(id, e); }
      return e;
    };

    for (let i = 0; i < n; i++) {
      const t = ts[i];
      if (t < a || t > b) continue;
      const f = fl[i];
      if (excludeIncognito && (f & FLAG.INCOGNITO)) continue;
      if (platform !== null && ((f >> PLAT_SHIFT) & 7) !== platform) continue;
      if (shuffle !== null && !!(f & FLAG.SHUFFLE) !== shuffle) continue;
      if (offline !== null && !!(f & FLAG.OFFLINE) !== offline) continue;
      if (content === 'music' && (f & (FLAG.PODCAST | FLAG.AUDIOBOOK))) continue;
      if (content === 'podcast' && !(f & FLAG.PODCAST)) continue;
      if (artistFilter !== null && artistFilter !== undefined && ar[i] !== artistFilter) continue;
      if (albumFilter !== null && albumFilter !== undefined && al[i] !== albumFilter) continue;

      const m = ms[i], isCounted = !!(f & FLAG.COUNTED), isSkip = !!(f & FLAG.SKIP);
      plays++; totalMs += m;
      if (isCounted) counted++;
      if (isSkip) skips++;
      if (f & FLAG.SHUFFLE) shuffleN++;
      if (f & FLAG.OFFLINE) offlineN++;
      if (f & FLAG.PODCAST) podMs += m; else musicMs += m;

      const d = new Date(t * 1000);
      hours[d.getHours()] += m;
      wdays[d.getDay()] += m;
      plats[(f >> PLAT_SHIFT) & 7] += m;
      days.add(Math.floor(t / 86400));
      bump(months, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, m);

      const ti = tr[i];
      if (ti >= 0) {
        for (const [map, id] of [[T, ti], [A, ar[i]], [L, al[i]]]) {
          const e = ent(map, id);
          e.raw++; e.ms += m;
          if (isCounted) e.plays++;
          if (isSkip) e.skips++;
          if (t < e.first) e.first = t;
          if (t > e.last) e.last = t;
          const wk = Math.floor(t / 604800);
          e.weeks.add(wk);
          e.peak.set(wk, (e.peak.get(wk) || 0) + m);
        }
      }
    }

    const nameOf = {
      tracks: (id) => this.trackMeta[id],
      artists: (id) => [this.artistMeta[id], ''],
      albums: (id) => this.albumMeta[id],
    };
    const rank = (map, which) => {
      const rows = [];
      for (const e of map.values()) {
        if (e.raw < minPlays) continue;
        if (SORTS[sort]?.minPlays && e.raw < SORTS[sort].minPlays) continue;
        const meta = nameOf[which](e.id);
        if (needle && !`${meta[0]} ${meta[1] || ''} ${meta[2] || ''}`.toLowerCase().includes(needle)) continue;

        // Consistency: the answer to "a two-week binge shoved this into my top 5".
        // spread  = how many distinct weeks it appeared in
        // peakShare = share of its total time that fell in its single biggest week
        // A steady favourite has a low peakShare; a binge has a high one.
        let peakMs = 0;
        for (const v of e.peak.values()) if (v > peakMs) peakMs = v;
        const peakShare = e.ms ? peakMs / e.ms : 0;
        rows.push({
          title: meta[0], artist: meta[1] || '', album: meta[2] || '', uri: meta[3] || null,
          plays: e.plays, raw: e.raw, ms: e.ms, skips: e.skips,
          skipRate: e.raw ? e.skips / e.raw : 0,
          weeks: e.weeks.size,
          peakShare,
          // Thresholds are deliberately strict. On a heavy listener's history
          // a loose rule tags literally every row, and a badge that never
          // varies is decoration rather than information.
          steady: e.weeks.size >= 26 && peakShare <= 0.22,
          // Either genuinely brief, or overwhelmingly concentrated in one week.
          // AND was too strict: the canonical "two-week phase" spans three
          // calendar weeks, so its peak week is only ~50% — exactly the case
          // this flag exists to catch.
          binge: e.weeks.size <= 3 || peakShare >= 0.75,
          first: e.first === Infinity ? null : e.first * 1000,
          last: e.last === -Infinity ? null : e.last * 1000,
        });
      }
      const cmp = {
        time: (x, y) => y.ms - x.ms,
        plays: (x, y) => y.plays - x.plays || y.ms - x.ms,
        skips: (x, y) => y.skips - x.skips,
        skipRate: (x, y) => y.skipRate - x.skipRate || y.raw - x.raw,
        first: (x, y) => x.first - y.first,
        last: (x, y) => y.last - x.last,
        alpha: (x, y) => x.title.localeCompare(y.title),
        // Weighted by how many distinct weeks it survived, so a single
        // binge cannot outrank a year-long habit.
        steady: (x, y) => (y.ms * y.weeks) - (x.ms * x.weeks),
        weeks: (x, y) => y.weeks - x.weeks || y.ms - x.ms,
      }[sort] || ((x, y) => y.ms - x.ms);
      rows.sort(cmp);
      return { total: rows.length, rows: rows.slice(offset, offset + limit) };
    };

    const rT = rank(T, 'tracks'), rA = rank(A, 'artists'), rL = rank(L, 'albums');
    return {
      tookMs: Math.round((globalThis.performance?.now?.() ?? Date.now()) - t0),
      plays, counted, totalMs, skips, podMs, musicMs, shuffleN, offlineN,
      days: days.size,
      distinctTracks: T.size, distinctArtists: A.size, distinctAlbums: L.size,
      tracks: rT.rows, artists: rA.rows, albums: rL.rows,
      totals: { tracks: rT.total, artists: rA.total, albums: rL.total },
      hours: Array.from(hours), wdays: Array.from(wdays),
      platforms: PLATFORMS.map((p, i) => ({ name: p, index: i, ms: plats[i] })).filter((p) => p.ms > 0),
      months: [...months.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1)),
    };
  }

  summary() {
    const s = this.stats;
    return {
      ...s,
      years: this.years(),
      distinctTracks: this.trackMeta.length,
      distinctArtists: this.artistMeta.length,
      distinctAlbums: this.albumMeta.length,
      unknownFields: [...this.unknownFields.entries()].map(([field, count]) => ({ field, count })),
      countries: [...this.countries.entries()].sort((a, b) => b[1] - a[1]),
      reasonEnd: [...this.reasonEnd.entries()].sort((a, b) => b[1] - a[1]),
      reasonStart: [...this.reasonStart.entries()].sort((a, b) => b[1] - a[1]),
      storeBytes: this.size * 24,
    };
  }
}
