import { describe, it, expect, beforeAll } from 'vitest';
import { countryName, countryFlag, COUNTRY_NAMES } from '../src/engine/countries.js';
import { trackUrlFromUri, searchUrl, linkFor, linkLabel } from '../src/ui/links.js';
import { skeletonRows, skeletonBlock, skeletonFigs, loadingLabel } from '../src/ui/skeleton.js';
import { clockWedges, peakHour, renderClock } from '../src/ui/charts.js';
import { parseRoute, ROUTES } from '../src/ui/router.js';

/* ══════════ countries ══════════ */
describe('country names', () => {
  it('resolves the codes that actually appear in real exports', () => {
    // Straight from the two test files.
    expect(countryName('NG')).toBe('Nigeria');
    expect(countryName('GB')).toBe('United Kingdom');
    expect(countryName('US')).toBe('United States');
    expect(countryName('SE')).toBe('Sweden');
    expect(countryName('AR')).toBe('Argentina');
    expect(countryName('TR')).toBe('Türkiye');
    expect(countryName('FI')).toBe('Finland');
    expect(countryName('NL')).toBe('Netherlands');
    expect(countryName('FR')).toBe('France');
  });

  it('handles the non-ISO values Spotify emits', () => {
    // These are in the real data and are not countries at all.
    expect(countryName('ZZ')).toBe('Unknown location');
    expect(countryName('A1')).toBe('Anonymous proxy or VPN');
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(countryName('ng')).toBe('Nigeria');
    expect(countryName(' Gb ')).toBe('United Kingdom');
  });

  it('falls back to the raw code rather than showing nothing', () => {
    expect(countryName('QQ')).toBe('QQ');
    expect(countryName('')).toBe('Unknown location');
    expect(countryName(null)).toBe('Unknown location');
  });

  it('never returns an empty string', () => {
    for (const c of ['NG', 'ZZ', 'QQ', '', null, undefined, 123]) {
      expect(String(countryName(c)).length).toBeGreaterThan(0);
    }
  });

  it('produces a flag for real countries and none for pseudo-codes', () => {
    expect(countryFlag('NG')).toBe('🇳🇬');
    expect(countryFlag('GB')).toBe('🇬🇧');
    expect(countryFlag('ZZ')).toBe('');
    expect(countryFlag('A1')).toBe('');
    expect(countryFlag('')).toBe('');
    expect(countryFlag('123')).toBe('');
  });

  it('covers a broad set of codes, not just a handful', () => {
    expect(Object.keys(COUNTRY_NAMES).length).toBeGreaterThan(180);
  });
});

/* ══════════ spotify links ══════════ */
describe('spotify links', () => {
  it('turns a track URI into a direct open.spotify.com link', () => {
    expect(trackUrlFromUri('spotify:track:0VjIjW4GlUZAMYd2vXMi3b'))
      .toBe('https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b');
  });

  it('rejects anything that is not a track URI', () => {
    for (const u of ['spotify:episode:abc', 'spotify:track:', 'not a uri', '', null, undefined,
                     'spotify:track:has space', 'javascript:alert(1)']) {
      expect(trackUrlFromUri(u)).toBeNull();
    }
  });

  it('builds a search URL when there is no URI', () => {
    const u = searchUrl('Blinding Lights', 'The Weeknd');
    expect(u.startsWith('https://open.spotify.com/search/')).toBe(true);
    expect(u).toContain('Blinding%20Lights');
    expect(u).toContain('The%20Weeknd');
  });

  it('escapes characters that would break the URL', () => {
    const u = searchUrl('A/B?C&D#E', 'X Y');
    expect(u).not.toMatch(/[ <>"]/);
    expect(u).toContain('%2F');
    expect(u).toContain('%26');
    expect(u).toContain('%23');
  });

  it('prefers the exact track over a search when a URI exists', () => {
    const withUri = linkFor({ uri: 'spotify:track:abc123', title: 'X', artist: 'Y' });
    expect(withUri).toBe('https://open.spotify.com/track/abc123');
    expect(linkFor({ title: 'X', artist: 'Y' })).toContain('/search/');
  });

  it('always returns a usable link, so a row is never dead', () => {
    for (const row of [{}, { title: '' }, { uri: 'garbage' }, null]) {
      const u = linkFor(row || undefined);
      expect(u.startsWith('https://open.spotify.com')).toBe(true);
    }
  });

  it('only ever points at open.spotify.com', () => {
    // Guards against a crafted title smuggling in another origin.
    const u = linkFor({ title: 'https://evil.example/x', artist: '//evil.example' });
    expect(new URL(u).origin).toBe('https://open.spotify.com');
  });

  it('produces a readable accessible name', () => {
    expect(linkLabel({ title: 'Vanished', artist: 'Crystal Castles' }))
      .toBe('Find Vanished by Crystal Castles on Spotify');
    expect(linkLabel({})).toBe('Find this on Spotify');
  });
});

/* ══════════ skeletons ══════════ */
describe('loading placeholders', () => {
  it('renders the requested number of rows', () => {
    expect((skeletonRows(6).match(/class="sk-row"/g) || []).length).toBe(6);
    expect(skeletonRows(0)).toBe('');
    expect(skeletonRows(-3)).toBe('');
  });

  it('hides placeholders from screen readers', () => {
    // A skeleton read aloud as content is worse than no skeleton.
    for (const h of [skeletonRows(3), skeletonBlock(100), skeletonFigs(4)]) {
      const nodes = (h.match(/<(li|div)\b/g) || []).length;
      expect((h.match(/aria-hidden="true"/g) || []).length).toBeGreaterThanOrEqual(1);
      expect(nodes).toBeGreaterThan(0);
    }
  });

  it('varies row widths so it reads as content, not a striped block', () => {
    const widths = [...skeletonRows(6).matchAll(/width:(\d+)%/g)].map((m) => m[1]);
    expect(new Set(widths).size).toBeGreaterThan(2);
  });

  it('clamps a silly block height instead of collapsing', () => {
    expect(skeletonBlock(0)).toContain('height:20px');
    expect(skeletonBlock(NaN)).toContain('height:120px');
  });

  it('gives a spoken label for the loading state', () => {
    expect(loadingLabel('songs')).toBe('Loading songs…');
  });
});

/* ══════════ clock, after the rescale ══════════ */
describe('listening clock scale', () => {
  it('separates hours that a zero-based scale would flatten', () => {
    // A heavy listener plays in every hour. On a 0..max scale these three
    // wedges differ by under 10% of the radius and the chart says nothing.
    const hours = new Array(24).fill(1000);
    hours[21] = 1400; hours[4] = 900;
    const w = clockWedges(hours);
    expect(w[21].share).toBe(1);
    expect(w[4].share).toBe(0);
    expect(w[21].share - w[0].share).toBeGreaterThan(0.15);
  });

  it('still handles a flat day without dividing by zero', () => {
    const w = clockWedges(new Array(24).fill(500));
    expect(w.every((x) => x.share === 1)).toBe(true);
    expect(w.every((x) => !/NaN/.test(x.d))).toBe(true);
  });

  it('gives every wedge an intensity tier between 0 and 3', () => {
    const hours = Array.from({ length: 24 }, (_, i) => i * 100);
    for (const w of clockWedges(hours)) {
      expect(w.tier).toBeGreaterThanOrEqual(0);
      expect(w.tier).toBeLessThanOrEqual(3);
      expect(Number.isInteger(w.tier)).toBe(true);
    }
  });

  it('gives a silent hour tier 0', () => {
    const hours = new Array(24).fill(100); hours[3] = 0;
    expect(clockWedges(hours)[3].tier).toBe(0);
  });

  it('labels each wedge for a screen reader and a tooltip', () => {
    const svg = renderClock(Array.from({ length: 24 }, (_, i) => i * 60000), (v) => `${v} ms`);
    expect((svg.match(/aria-label=/g) || []).length).toBeGreaterThanOrEqual(24);
    expect((svg.match(/<title>/g) || []).length).toBe(24);
    expect(svg).toContain('role="list"');
    expect(svg).not.toMatch(/NaN|undefined/);
  });

  it('is keyboard reachable', () => {
    expect((renderClock(new Array(24).fill(10)).match(/tabindex="0"/g) || []).length).toBe(24);
  });

  it('names the busiest hour in the middle', () => {
    const hours = new Array(24).fill(10); hours[7] = 999;
    expect(peakHour(hours)).toBe(7);
    expect(renderClock(hours)).toContain('07:00');
  });

  it('renders an empty day without a centre label', () => {
    const svg = renderClock(new Array(24).fill(0));
    expect(svg).toContain('<svg');
    expect(svg).not.toContain('busiest');
  });
});

/* ══════════ legal routes ══════════ */
describe('legal pages are reachable', () => {
  it('registers privacy and terms as real routes', () => {
    expect(ROUTES).toContain('/privacy');
    expect(ROUTES).toContain('/terms');
    expect(parseRoute('#/privacy')).toBe('/privacy');
    expect(parseRoute('#/terms')).toBe('/terms');
  });
});
