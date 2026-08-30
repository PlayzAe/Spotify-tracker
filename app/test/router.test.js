import { describe, it, expect } from 'vitest';
import { parseRoute, litSegments, ROUTES } from '../src/ui/router.js';

describe('route parsing', () => {
  it('maps every known route to itself', () => {
    for (const r of ROUTES) expect(parseRoute('#' + r)).toBe(r);
  });

  it('treats an empty or bare hash as home', () => {
    for (const h of ['', '#', '#/', undefined, null]) expect(parseRoute(h)).toBe('/');
  });

  it('is case-insensitive and tolerates stray slashes', () => {
    expect(parseRoute('#/STATS')).toBe('/stats');
    expect(parseRoute('#//upload//')).toBe('/upload');
    expect(parseRoute('#upload')).toBe('/upload');
  });

  it('falls back to home for an unknown route instead of showing nothing', () => {
    // A blank page on a bad link is the worst outcome; home is always valid.
    expect(parseRoute('#/nope')).toBe('/');
    expect(parseRoute('#/stats/extra')).toBe('/');
    expect(parseRoute('#/../etc')).toBe('/');
  });

  it('never throws on hostile input', () => {
    for (const h of ['#<script>', '#/%%%', '#'.repeat(50), '#/'.padEnd(500, 'a')]) {
      expect(() => parseRoute(h)).not.toThrow();
      expect(ROUTES).toContain(parseRoute(h));
    }
  });
});

describe('scroll meter', () => {
  it('is empty at the top and full at the bottom', () => {
    expect(litSegments(0, 3000, 800, 20)).toBe(0);
    expect(litSegments(2200, 3000, 800, 20)).toBe(20);
  });

  it('is half lit at the midpoint', () => {
    expect(litSegments(1100, 3000, 800, 20)).toBe(10);
  });

  it('fills completely when the page does not scroll at all', () => {
    // Otherwise a short page shows a permanently empty meter, which reads as broken.
    expect(litSegments(0, 600, 800, 20)).toBe(20);
    expect(litSegments(0, 800, 800, 20)).toBe(20);
  });

  it('clamps past the ends rather than overflowing', () => {
    expect(litSegments(99999, 3000, 800, 20)).toBe(20);
    expect(litSegments(-500, 3000, 800, 20)).toBe(0);
  });

  it('never returns more segments than exist, or a negative count', () => {
    for (const y of [0, 100, 5000, -20]) {
      const n = litSegments(y, 4000, 900, 26);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(26);
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  it('handles a zero-segment meter without dividing by zero', () => {
    expect(litSegments(500, 3000, 800, 0)).toBe(0);
  });

  it('is monotonic — scrolling down never un-lights a segment', () => {
    let prev = -1;
    for (let y = 0; y <= 2200; y += 50) {
      const n = litSegments(y, 3000, 800, 26);
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });
});
