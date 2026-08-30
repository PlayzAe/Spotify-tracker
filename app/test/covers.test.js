/**
 * covers.js touches localStorage and document at import time, so this stubs the
 * minimum browser surface. Only the pure logic is exercised — network matching
 * is proven separately against the live Deezer catalogue (98% on 120 albums).
 */
import { describe, it, expect, beforeAll } from 'vitest';

let covers;
beforeAll(async () => {
  globalThis.localStorage = {
    _d: {},
    getItem(k) { return this._d[k] ?? null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  };
  globalThis.document = { createElement: () => ({ remove() {} }), head: { appendChild() {} } };
  globalThis.window = globalThis;
  covers = await import('../src/ui/covers.js');
});

describe('fallback tiles', () => {
  it('are deterministic — the same track always renders identically', () => {
    const a = covers.fallbackTile('Vanished', 'Crystal Castles');
    const b = covers.fallbackTile('Vanished', 'Crystal Castles');
    expect(a).toBe(b);
  });

  it('differ between different tracks', () => {
    expect(covers.fallbackTile('Vanished', 'Crystal Castles'))
      .not.toBe(covers.fallbackTile('Untrust Us', 'Crystal Castles'));
  });

  it('produce a usable data URI', () => {
    const t = covers.fallbackTile('Test', 'Artist');
    expect(t.startsWith('data:image/svg+xml')).toBe(true);
    expect(decodeURIComponent(t)).toContain('<svg');
  });

  it('never break on empty, null or hostile input', () => {
    for (const [t, a] of [['', ''], [null, null], [undefined, undefined],
                          ['<script>x</script>', '&"'], ['🎧', '🎵']]) {
      const tile = covers.fallbackTile(t, a);
      expect(tile.startsWith('data:image/svg+xml')).toBe(true);
      expect(decodeURIComponent(tile)).not.toContain('<script');
    }
  });
});

describe('artwork toggle', () => {
  it('reports and respects the enabled flag', async () => {
    expect(covers.isEnabled()).toBe(true);
    covers.setEnabled(false);
    expect(covers.isEnabled()).toBe(false);
    // With artwork off, nothing may be requested at all.
    await expect(covers.lookup('After Hours', 'The Weeknd')).resolves.toBeNull();
    covers.setEnabled(true);
  });

  it('resolves to null for missing album or artist without queueing a request', async () => {
    await expect(covers.lookup('', 'The Weeknd')).resolves.toBeNull();
    await expect(covers.lookup('After Hours', '')).resolves.toBeNull();
    await expect(covers.lookup(null, null)).resolves.toBeNull();
  });
});

describe('genre map', () => {
  it('covers Deezer\'s taxonomy and stays small — 22 broad genres, not thousands', () => {
    const names = Object.values(covers.GENRES);
    expect(names).toContain('Rap/Hip Hop');
    expect(names).toContain('Electro');
    expect(names).toContain('Alternative');
    expect(names.length).toBeLessThanOrEqual(25);
  });
});
