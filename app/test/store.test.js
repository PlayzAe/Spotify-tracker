import { describe, it, expect } from 'vitest';
import { Store } from '../src/engine/store.js';
import { play, podcast, audiobook, localFile } from './fixtures.js';

const build = (records) => {
  const s = new Store();
  for (const r of records) s.ingestRecord(r);
  return s.finalize();
};

describe('ingest', () => {
  it('stores well-formed plays', () => {
    const s = build([play(), play({ ts: '2024-05-02T12:00:00Z' })]);
    expect(s.size).toBe(2);
    expect(s.summary().records).toBe(2);
  });

  it('drops exact duplicates — they exist inside a single export', () => {
    const s = build([play(), play(), play()]);
    expect(s.size).toBe(1);
    expect(s.summary().duplicates).toBe(2);
  });

  it('does not confuse two genuine plays of the same track', () => {
    const s = build([play(), play({ ts: '2024-05-01T12:05:00Z' })]);
    expect(s.size).toBe(2);
    expect(s.summary().duplicates).toBe(0);
  });

  it('counts unparseable records without throwing', () => {
    const s = new Store();
    for (const bad of [null, undefined, 42, 'string', [], {}, { ts: 123 },
                       { ts: 'not-a-date' }, { ts: '' }]) {
      expect(() => s.ingestRecord(bad)).not.toThrow();
    }
    expect(s.stats.unparseable).toBe(9);
    expect(s.stats.records).toBe(0);
  });

  it('survives every field being null', () => {
    const nulled = Object.fromEntries(Object.keys(play()).map((k) => [k, null]));
    nulled.ts = '2024-05-01T12:00:00Z';
    const s = new Store();
    expect(() => s.ingestRecord(nulled)).not.toThrow();
    expect(s.stats.records).toBe(1);
  });

  it('reports unknown fields — this is how audiobook_* was caught', () => {
    const s = build([play({ some_new_spotify_field: 'x', another_one: 1 })]);
    const fields = s.summary().unknownFields.map((u) => u.field);
    expect(fields).toContain('some_new_spotify_field');
    expect(fields).toContain('another_one');
  });

  it('does not flag the audiobook fields as unknown — they are documented now', () => {
    const s = build([play()]);
    expect(s.summary().unknownFields).toHaveLength(0);
  });

  it('clamps negative and non-numeric durations to zero', () => {
    const s = build([
      play({ ms_played: -500, ts: '2024-05-01T01:00:00Z' }),
      play({ ms_played: 'abc', ts: '2024-05-01T02:00:00Z' }),
      play({ ms_played: NaN, ts: '2024-05-01T03:00:00Z' }),
      play({ ms_played: undefined, ts: '2024-05-01T04:00:00Z' }),
    ]);
    expect(s.query().totalMs).toBe(0);
  });
});

describe('history that is not like the test export', () => {
  it('handles a library starting well before 2021', () => {
    const s = build([
      play({ ts: '2008-03-14T09:00:00Z' }),
      play({ ts: '2015-06-01T09:00:00Z' }),
      play({ ts: '2026-08-18T09:00:00Z' }),
    ]);
    expect(s.years()).toEqual([2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018,
                               2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010, 2009, 2008]);
    expect(s.years()).toHaveLength(19);
  });

  it('handles a brand-new account with a single day of history', () => {
    const s = build([play({ ts: '2026-08-18T09:00:00Z' })]);
    expect(s.years()).toEqual([2026]);
    const q = s.query();
    expect(q.plays).toBe(1);
    expect(q.days).toBe(1);
  });

  it('handles an account with no plays at all', () => {
    const s = build([]);
    expect(s.years()).toEqual([]);
    const q = s.query();
    expect(q.plays).toBe(0);
    expect(q.totalMs).toBe(0);
    expect(q.tracks).toEqual([]);
    expect(q.platforms).toEqual([]);
  });

  it('assigns a midnight-crossing play to exactly one year, never both or neither', () => {
    // Adjacent ranges must partition the timeline. Before the range-parsing fix,
    // "2025-12-31" (parsed UTC) against "2026-01-01" (parsed local) left a
    // one-hour hole in UTC+1 where a play belonged to neither year.
    const s = build([play({ ts: '2026-01-01T00:02:00Z', ms_played: 300000 })]);
    const in2025 = s.query({ from: '2025-01-01', to: '2025-12-31' }).plays;
    const in2026 = s.query({ from: '2026-01-01', to: '2026-12-31' }).plays;
    expect(in2025 + in2026).toBe(1);
  });

  it('partitions every play across a full set of adjacent year ranges', () => {
    const records = Array.from({ length: 40 }, (_, i) =>
      play({ ts: new Date(Date.UTC(2024, 11, 31, 22, i, 0)).toISOString(), ms_played: 300000,
             spotify_track_uri: `spotify:track:${i}` }));
    const s = build(records);
    const total = [2024, 2025].reduce((acc, y) =>
      acc + s.query({ from: `${y}-01-01`, to: `${y}-12-31` }).plays, 0);
    expect(total).toBe(40);
  });
});

describe('query — ranges', () => {
  const s = build([
    play({ ts: '2023-06-01T12:00:00Z', ms_played: 100000 }),
    play({ ts: '2024-06-01T12:00:00Z', ms_played: 200000 }),
    play({ ts: '2025-06-01T12:00:00Z', ms_played: 300000 }),
  ]);

  it('returns everything with no range', () => {
    expect(s.query().plays).toBe(3);
  });

  it('filters to a single year', () => {
    const q = s.query({ from: '2024-01-01', to: '2024-12-31T23:59:59' });
    expect(q.plays).toBe(1);
    expect(q.totalMs).toBe(200000);
  });

  it('supports an open-ended start and end', () => {
    expect(s.query({ from: '2024-01-01' }).plays).toBe(2);
    expect(s.query({ to: '2024-12-31T23:59:59' }).plays).toBe(2);
  });

  it('returns an empty but valid result for a range with no data', () => {
    const q = s.query({ from: '2019-01-01', to: '2019-12-31' });
    expect(q.plays).toBe(0);
    expect(q.tracks).toEqual([]);
    expect(q.hours).toHaveLength(24);
    expect(q.wdays).toHaveLength(7);
  });

  it('handles an inverted range without throwing', () => {
    const q = s.query({ from: '2026-01-01', to: '2020-01-01' });
    expect(q.plays).toBe(0);
  });
});

describe('query — filters', () => {
  const s = build([
    play({ ts: '2024-01-01T10:00:00Z', platform: 'windows', shuffle: true, offline: false }),
    play({ ts: '2024-01-02T10:00:00Z', platform: 'android', shuffle: false, offline: true }),
    play({ ts: '2024-01-03T10:00:00Z', platform: 'windows', shuffle: false, offline: false, incognito_mode: true }),
    podcast({ ts: '2024-01-04T10:00:00Z', platform: 'web_player x' }),
  ]);

  it('excludes incognito plays by default', () => {
    expect(s.query().plays).toBe(3);
    expect(s.query({ excludeIncognito: false }).plays).toBe(4);
  });

  it('filters by device', () => {
    expect(s.query({ platform: 0 }).plays).toBe(1);  // Windows, minus the incognito one
    expect(s.query({ platform: 1 }).plays).toBe(1);  // Android
  });

  it('filters by shuffle and offline', () => {
    expect(s.query({ shuffle: true }).plays).toBe(1);
    expect(s.query({ shuffle: false }).plays).toBe(2);
    expect(s.query({ offline: true }).plays).toBe(1);
  });

  it('filters by content type', () => {
    expect(s.query({ content: 'music' }).plays).toBe(2);
    expect(s.query({ content: 'podcast' }).plays).toBe(1);
  });

  it('combines filters', () => {
    expect(s.query({ platform: 0, shuffle: true }).plays).toBe(1);
    expect(s.query({ platform: 1, shuffle: true }).plays).toBe(0);
  });
});

describe('query — sorting', () => {
  const s = build([
    // Short track played often
    ...Array.from({ length: 5 }, (_, i) => play({
      ts: `2024-01-0${i + 1}T10:00:00Z`, ms_played: 40000,
      master_metadata_track_name: 'Short', spotify_track_uri: 'spotify:track:s',
    })),
    // Long track played twice
    ...Array.from({ length: 2 }, (_, i) => play({
      ts: `2024-02-0${i + 1}T10:00:00Z`, ms_played: 600000,
      master_metadata_track_name: 'Long', spotify_track_uri: 'spotify:track:l',
    })),
    // Skipped repeatedly
    ...Array.from({ length: 6 }, (_, i) => play({
      ts: `2024-03-0${i + 1}T10:00:00Z`, ms_played: 5000, reason_end: 'fwdbtn',
      master_metadata_track_name: 'Skippy', spotify_track_uri: 'spotify:track:k',
    })),
  ]);

  it('ranks by play count', () => {
    expect(s.query({ sort: 'plays' }).tracks[0].title).toBe('Short');
  });

  it('ranks by listening time — a different answer', () => {
    expect(s.query({ sort: 'time' }).tracks[0].title).toBe('Long');
  });

  it('ranks by skip count and skip rate', () => {
    expect(s.query({ sort: 'skips' }).tracks[0].title).toBe('Skippy');
    expect(s.query({ sort: 'skipRate' }).tracks[0].title).toBe('Skippy');
  });

  it('ranks by first and last played', () => {
    expect(s.query({ sort: 'first' }).tracks[0].title).toBe('Short');
    expect(s.query({ sort: 'last' }).tracks[0].title).toBe('Skippy');
  });

  it('ranks alphabetically', () => {
    expect(s.query({ sort: 'alpha' }).tracks.map((t) => t.title)).toEqual(['Long', 'Short', 'Skippy']);
  });

  it('excludes sub-30s plays from the counted total but keeps them for skips', () => {
    const q = s.query();
    expect(q.plays).toBe(13);
    expect(q.counted).toBe(7);   // 5 Short + 2 Long; Skippy's 6 are all under 30s
    expect(q.skips).toBe(6);
  });

  it('honours a minimum play threshold', () => {
    expect(s.query({ minPlays: 6 }).tracks.map((t) => t.title)).toEqual(['Skippy']);
  });

  it('honours the result limit', () => {
    expect(s.query({ limit: 1 }).tracks).toHaveLength(1);
  });
});

describe('numeric safety', () => {
  it('does not overflow on a listening total beyond Int32 range', () => {
    // Int32 overflows at ~596 hours of milliseconds. This bug shipped in the
    // first build and silently deleted Windows from the device chart.
    const s = new Store();
    for (let i = 0; i < 5000; i++) {
      s.ingestRecord(play({
        ts: new Date(Date.UTC(2024, 0, 1, 0, 0, i)).toISOString(),
        ms_played: 600000,               // 10 minutes each
        spotify_track_uri: `spotify:track:${i}`,
      }));
    }
    s.finalize();
    const q = s.query();
    const expected = 5000 * 600000;       // 3e9 ms — well past Int32
    expect(q.totalMs).toBe(expected);
    expect(q.platforms[0].ms).toBe(expected);
    expect(q.platforms[0].ms).toBeGreaterThan(2 ** 31);
    expect(q.wdays.reduce((a, b) => a + b, 0)).toBe(expected);
    expect(q.hours.every((h) => h >= 0)).toBe(true);
  });

  it('keeps per-entity totals as doubles too', () => {
    const s = new Store();
    for (let i = 0; i < 4000; i++) {
      s.ingestRecord(play({
        ts: new Date(Date.UTC(2024, 0, 1, 0, 0, i)).toISOString(),
        ms_played: 600000,
        spotify_track_uri: 'spotify:track:same',
      }));
    }
    s.finalize();
    expect(s.query().tracks[0].ms).toBe(4000 * 600000);
  });
});

describe('summary', () => {
  it('reports the measured snapshot boundary, never an estimate', () => {
    const s = build([
      play({ ts: '2022-03-05T10:00:00Z' }),
      play({ ts: '2026-08-18T23:58:15Z' }),
    ]);
    const sum = s.summary();
    expect(sum.earliest).toBe('2022-03-05T10:00:00Z');
    expect(sum.latest).toBe('2026-08-18T23:58:15Z');
  });

  it('reports 24 bytes per stored play', () => {
    const s = build([play(), play({ ts: '2024-05-02T12:00:00Z' })]);
    expect(s.summary().storeBytes).toBe(48);
  });
});

describe('determinism', () => {
  it('produces identical output for identical input', () => {
    const recs = [play(), play({ ts: '2024-05-02T12:00:00Z', ms_played: 90000 }), podcast({ ts: '2024-05-03T12:00:00Z' })];
    const a = JSON.stringify(build(recs).query());
    const b = JSON.stringify(build(recs).query());
    expect(a).toBe(b);
  });
});
