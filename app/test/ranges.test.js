import { describe, it, expect } from 'vitest';
import { rangeBoundSec } from '../src/engine/normalize.js';
import { Store } from '../src/engine/store.js';
import { play } from './fixtures.js';

const sec = (d) => Math.floor(d.getTime() / 1000);

describe('range boundaries', () => {
  it('treats a date-only string as local midnight, not UTC midnight', () => {
    // The JS trap: Date.parse('2025-06-01') is UTC, Date.parse('2025-06-01T00:00:00') is local.
    expect(rangeBoundSec('2025-06-01', 'start')).toBe(sec(new Date(2025, 5, 1, 0, 0, 0, 0)));
  });

  it('extends a date-only end bound to the last instant of that local day', () => {
    expect(rangeBoundSec('2025-06-01', 'end')).toBe(sec(new Date(2025, 5, 1, 23, 59, 59, 999)));
  });

  it('leaves an explicit instant alone', () => {
    expect(rangeBoundSec('2025-06-01T12:00:00Z', 'start')).toBe(Date.parse('2025-06-01T12:00:00Z') / 1000);
  });

  it('treats null and empty as unbounded', () => {
    expect(rangeBoundSec(null, 'start')).toBe(-Infinity);
    expect(rangeBoundSec(undefined, 'end')).toBe(Infinity);
    expect(rangeBoundSec('', 'start')).toBe(-Infinity);
  });

  it('falls back to unbounded on unparseable input rather than dropping everything', () => {
    expect(rangeBoundSec('not a date', 'start')).toBe(-Infinity);
    expect(rangeBoundSec('2025-13-45', 'end')).toBe(Infinity);
  });

  it('accepts Date objects and epoch milliseconds', () => {
    const d = new Date(2025, 5, 1, 9, 30);
    expect(rangeBoundSec(d, 'start')).toBe(sec(d));
    expect(rangeBoundSec(d.getTime(), 'start')).toBe(sec(d));
  });

  it('an end bound is always at or after the matching start bound', () => {
    for (const day of ['2020-01-01', '2024-02-29', '2025-12-31']) {
      expect(rangeBoundSec(day, 'end')).toBeGreaterThan(rangeBoundSec(day, 'start'));
    }
  });
});

describe('range partitioning over a whole day', () => {
  it('never loses or double-counts a play across adjacent day ranges', () => {
    // One play every 20 minutes for 48 hours, straddling a local midnight.
    const base = new Date(2025, 2, 14, 0, 0, 0);
    const records = Array.from({ length: 144 }, (_, i) => play({
      ts: new Date(base.getTime() + i * 20 * 60000).toISOString(),
      ms_played: 0,
      spotify_track_uri: `spotify:track:${i}`,
    }));
    const s = new Store();
    for (const r of records) s.ingestRecord(r);
    s.finalize();

    const days = ['2025-03-14', '2025-03-15', '2025-03-16'];
    const total = days.reduce((acc, d) => acc + s.query({ from: d, to: d }).plays, 0);
    expect(total).toBe(144);
    expect(s.query().plays).toBe(144);
  });

  it('a single-day range returns only that day', () => {
    const s = new Store();
    s.ingestRecord(play({ ts: new Date(2025, 2, 14, 12, 0).toISOString(), ms_played: 0 }));
    s.ingestRecord(play({ ts: new Date(2025, 2, 15, 12, 0).toISOString(), ms_played: 0,
                          spotify_track_uri: 'spotify:track:b' }));
    s.finalize();
    expect(s.query({ from: '2025-03-14', to: '2025-03-14' }).plays).toBe(1);
  });
});
