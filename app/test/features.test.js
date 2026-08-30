import { describe, it, expect } from 'vitest';
import { Store } from '../src/engine/store.js';
import { compare, avatarFor } from '../src/engine/compare.js';
import { play } from './fixtures.js';

const track = (name, artist, o = {}) => play({
  master_metadata_track_name: name,
  master_metadata_album_artist_name: artist,
  master_metadata_album_album_name: o.album || `${name} - single`,
  spotify_track_uri: `spotify:track:${name}${artist}`.replace(/\s/g, ''),
  ...o,
});
const build = (recs) => { const s = new Store(); recs.forEach((r) => s.ingestRecord(r)); return s.finalize(); };
const day = (n) => new Date(Date.UTC(2025, 0, 1 + n, 12, 0, 0)).toISOString();

describe('search', () => {
  const s = build([
    track('Blinding Lights', 'The Weeknd', { ts: day(0) }),
    track('Save Your Tears', 'The Weeknd', { ts: day(1) }),
    track('Levitating', 'Dua Lipa', { ts: day(2) }),
  ]);

  it('matches on track name', () => {
    expect(s.query({ q: 'blinding' }).tracks.map((t) => t.title)).toEqual(['Blinding Lights']);
  });

  it('matches on artist name and returns all their tracks', () => {
    expect(s.query({ q: 'weeknd' }).tracks).toHaveLength(2);
  });

  it('is case and accent insensitive', () => {
    expect(s.query({ q: 'DUA LIPA' }).tracks).toHaveLength(1);
  });

  it('matches on album name', () => {
    expect(s.query({ q: 'levitating - single' }).tracks).toHaveLength(1);
  });

  it('returns nothing for no match, without throwing', () => {
    expect(s.query({ q: 'zzzznothing' }).tracks).toEqual([]);
    expect(s.query({ q: 'zzzznothing' }).totals.tracks).toBe(0);
  });

  it('an empty query returns everything', () => {
    expect(s.query({ q: '' }).tracks).toHaveLength(3);
    expect(s.query({ q: '   ' }).tracks).toHaveLength(3);
  });

  it('search composes with a date range', () => {
    expect(s.query({ q: 'weeknd', from: '2025-01-01', to: '2025-01-01' }).tracks).toHaveLength(1);
  });
});

describe('pagination', () => {
  const s = build(Array.from({ length: 60 }, (_, i) =>
    track(`Song ${String(i).padStart(2, '0')}`, 'A', { ts: day(i), ms_played: (60 - i) * 60000 })));

  it('reports the full total alongside a page', () => {
    const r = s.query({ limit: 10 });
    expect(r.tracks).toHaveLength(10);
    expect(r.totals.tracks).toBe(60);
  });

  it('returns the next page from an offset', () => {
    const p1 = s.query({ limit: 10, offset: 0 }).tracks;
    const p2 = s.query({ limit: 10, offset: 10 }).tracks;
    expect(p1[0].title).toBe('Song 00');
    expect(p2[0].title).toBe('Song 10');
    expect(p1.map((t) => t.title)).not.toEqual(p2.map((t) => t.title));
  });

  it('walks every row exactly once across all pages', () => {
    const seen = [];
    for (let off = 0; off < 60; off += 7) seen.push(...s.query({ limit: 7, offset: off }).tracks.map((t) => t.title));
    expect(seen).toHaveLength(60);
    expect(new Set(seen).size).toBe(60);
  });

  it('returns an empty page past the end rather than wrapping', () => {
    expect(s.query({ limit: 10, offset: 500 }).tracks).toEqual([]);
  });
});

describe('artist drill-down', () => {
  const s = build([
    track('One', 'Nemo', { ts: day(0), ms_played: 300000 }),
    track('Two', 'Nemo', { ts: day(1), ms_played: 200000 }),
    track('Three', 'Nemo', { ts: day(2), ms_played: 100000 }),
    track('Other', 'Someone Else', { ts: day(3), ms_played: 900000 }),
  ]);

  it('resolves an artist name to an id', () => {
    expect(s.artistId('Nemo')).not.toBeNull();
    expect(s.artistId('Nobody At All')).toBeNull();
  });

  it('returns only that artist\'s tracks, ranked', () => {
    const r = s.query({ artist: s.artistId('Nemo') });
    expect(r.tracks.map((t) => t.title)).toEqual(['One', 'Two', 'Three']);
    expect(r.totalMs).toBe(600000);
  });

  it('gives shares that add up to the whole — usable for a donut chart', () => {
    const r = s.query({ artist: s.artistId('Nemo') });
    const sum = r.tracks.reduce((n, t) => n + t.ms, 0);
    expect(sum).toBe(r.totalMs);
    expect(r.tracks.map((t) => Math.round(t.ms / sum * 100))).toEqual([50, 33, 17]);
  });

  it('composes with a date range', () => {
    const r = s.query({ artist: s.artistId('Nemo'), from: '2025-01-01', to: '2025-01-02' });
    expect(r.tracks).toHaveLength(2);
  });
});

describe('consistency — the "two-week binge" problem', () => {
  // The loudest Wrapped complaint: a short binge outranks a year-long habit.
  const bingeDays = Array.from({ length: 14 }, (_, i) =>
    track('Binge Song', 'Binge Artist', { ts: day(i), ms_played: 600000 }));       // 140 min total
  const steadyDays = Array.from({ length: 50 }, (_, i) =>
    track('Steady Song', 'Steady Artist', { ts: day(i * 7), ms_played: 150000 })); // 50 weeks, 125 min
  const s = build([...bingeDays, ...steadyDays]);

  it('by raw time, the binge wins — which is what users complain about', () => {
    expect(s.query({ sort: 'time' }).artists[0].title).toBe('Binge Artist');
  });

  it('by consistency, the year-long habit wins instead', () => {
    expect(s.query({ sort: 'steady' }).artists[0].title).toBe('Steady Artist');
  });

  it('counts the distinct weeks each one actually appeared in', () => {
    const rows = s.query({ sort: 'weeks' }).artists;
    const steady = rows.find((r) => r.title === 'Steady Artist');
    const binge = rows.find((r) => r.title === 'Binge Artist');
    expect(steady.weeks).toBeGreaterThan(binge.weeks);
    expect(binge.weeks).toBeLessThanOrEqual(3);
  });

  it('flags each one so the UI can label it honestly', () => {
    const rows = s.query().artists;
    expect(rows.find((r) => r.title === 'Steady Artist').steady).toBe(true);
    expect(rows.find((r) => r.title === 'Binge Artist').binge).toBe(true);
  });

  it('does not flag ordinary listening as either — a badge on every row is noise', () => {
    // 8 weeks of moderate listening: neither a year-long habit nor a binge.
    const ordinary = Array.from({ length: 8 }, (_, i) =>
      track('Mid Song', 'Mid Artist', { ts: day(i * 7), ms_played: 200000 }));
    const m = build(ordinary).query().artists[0];
    expect(m.steady).toBe(false);
    expect(m.binge).toBe(false);
  });

  it('peakShare shows how concentrated the listening was', () => {
    const rows = s.query().artists;
    expect(rows.find((r) => r.title === 'Binge Artist').peakShare).toBeGreaterThan(0.4);
    expect(rows.find((r) => r.title === 'Steady Artist').peakShare).toBeLessThan(0.2);
  });

  it('never divides by zero on a track with no play time', () => {
    const z = build([track('Zero', 'Z', { ms_played: 0 })]);
    expect(z.query().tracks[0].peakShare).toBe(0);
  });
});

describe('compare two histories', () => {
  const A = build([
    track('Shared One', 'Both Artist', { ts: day(0), ms_played: 600000 }),
    track('Mine Only', 'My Artist', { ts: day(1), ms_played: 500000 }),
    track('Shared Two', 'Both Artist', { ts: day(2), ms_played: 100000 }),
  ]).query({ limit: 500 });

  const B = build([
    track('Shared One', 'Both Artist', { ts: day(0), ms_played: 200000 }),
    track('Yours Only', 'Your Artist', { ts: day(1), ms_played: 900000 }),
    track('Shared Two', 'Both Artist', { ts: day(2), ms_played: 300000 }),
  ]).query({ limit: 500 });

  const c = compare(A, B, { a: 'You', b: 'Freddy' });

  it('finds the tracks both people play', () => {
    expect(c.sharedTracks.map((t) => t.title).sort()).toEqual(['Shared One', 'Shared Two']);
    expect(c.counts.tracks).toBe(2);
  });

  it('finds shared artists', () => {
    expect(c.sharedArtists.map((a) => a.title)).toEqual(['Both Artist']);
  });

  it('reports each side\'s rank for a shared item', () => {
    // A ranks by time: Shared One (600k) > Mine Only (500k) > Shared Two (100k)
    // B ranks by time: Yours Only (900k) > Shared Two (300k) > Shared One (200k)
    const one = c.sharedTracks.find((t) => t.title === 'Shared One');
    expect(one.a.rank).toBe(1);
    expect(one.b.rank).toBe(3);
    expect(one.gap).toBe(2);           // 2 places lower on B's side

    const two = c.sharedTracks.find((t) => t.title === 'Shared Two');
    expect(two.a.rank).toBe(3);
    expect(two.b.rank).toBe(2);
    expect(two.gap).toBe(-1);
  });

  it('reports overlap as two numbers, not one blended score', () => {
    expect(c.overlapShare.a).toBeGreaterThan(0);
    expect(c.overlapShare.b).toBeGreaterThan(0);
    expect(c.overlapShare.a).not.toBe(c.overlapShare.b);
  });

  it('keeps both sets of totals', () => {
    expect(c.totals.a.ms).toBe(1200000);
    expect(c.totals.b.ms).toBe(1400000);
  });

  it('carries the labels the user typed', () => {
    expect(c.labels).toEqual({ a: 'You', b: 'Freddy' });
  });

  it('surfaces the biggest disagreements', () => {
    expect(Array.isArray(c.biggestDisagreements)).toBe(true);
  });

  it('handles two people with nothing in common', () => {
    const X = build([track('Alpha', 'One', { ts: day(0) })]).query();
    const Y = build([track('Beta', 'Two', { ts: day(0) })]).query();
    const none = compare(X, Y);
    expect(none.sharedTracks).toEqual([]);
    expect(none.sharedArtists).toEqual([]);
    expect(none.overlapShare.a).toBe(0);
  });

  it('handles an empty history on one side without throwing', () => {
    const empty = build([]).query();
    const c2 = compare(A, empty);
    expect(c2.sharedTracks).toEqual([]);
    expect(c2.overlapShare.b).toBe(0);
  });

  it('is symmetric in what it finds, if not in what it reports', () => {
    const back = compare(B, A, { a: 'Freddy', b: 'You' });
    expect(back.counts.tracks).toBe(c.counts.tracks);
    expect(back.overlapShare.a).toBeCloseTo(c.overlapShare.b, 10);
  });
});

describe('generated avatars', () => {
  it('are deterministic per label', () => {
    expect(avatarFor('Moses')).toBe(avatarFor('Moses'));
    expect(avatarFor('Moses')).not.toBe(avatarFor('Freddy'));
  });

  it('survive empty, emoji and hostile labels', () => {
    for (const l of ['', null, undefined, '🎧', '<script>']) {
      const a = avatarFor(l);
      expect(a.startsWith('data:image/svg+xml')).toBe(true);
      expect(decodeURIComponent(a)).not.toContain('<script');
    }
  });
});

describe('listening clock', () => {
  it('returns 24 hourly buckets that sum to the range total', () => {
    const s = build([
      track('A', 'X', { ts: day(0), ms_played: 300000 }),
      track('B', 'X', { ts: day(1), ms_played: 600000 }),
    ]);
    const r = s.query();
    expect(r.hours).toHaveLength(24);
    expect(Math.round(r.hours.reduce((a, b) => a + b, 0))).toBe(r.totalMs);
  });

  it('returns 7 weekday buckets that also sum to the total', () => {
    const s = build(Array.from({ length: 14 }, (_, i) => track(`T${i}`, 'X', { ts: day(i), ms_played: 60000 })));
    const r = s.query();
    expect(r.wdays).toHaveLength(7);
    expect(Math.round(r.wdays.reduce((a, b) => a + b, 0))).toBe(r.totalMs);
  });
});
