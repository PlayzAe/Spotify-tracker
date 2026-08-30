import { describe, it, expect, beforeAll } from 'vitest';
import {
  clockWedges, peakHour, donutSlices, donutStrokes, barRows, heatLevels,
  polar, renderClock, renderDonut, renderBars,
} from '../src/ui/charts.js';
import {
  clamp01, easeOutCubic, easeOutQuint, easeInOutCubic, countValue,
  staggerDelay, fmtDuration, fmtInt, reducedMotion,
} from '../src/ui/anim.js';

beforeAll(() => {
  // anim.js reads matchMedia; give it a "motion allowed" browser.
  globalThis.matchMedia = () => ({ matches: false });
});

/* ══════════════ easing and counters ══════════════ */
describe('easing', () => {
  it('all curves start at 0 and end at 1', () => {
    for (const f of [easeOutCubic, easeOutQuint, easeInOutCubic]) {
      expect(f(0)).toBeCloseTo(0, 6);
      expect(f(1)).toBeCloseTo(1, 6);
    }
  });

  it('all curves are monotonic — a counter must never go backwards', () => {
    for (const f of [easeOutCubic, easeOutQuint, easeInOutCubic]) {
      let prev = -Infinity;
      for (let t = 0; t <= 1.0001; t += 0.02) {
        const v = f(t);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = v;
      }
    }
  });

  it('ease-out curves decelerate — past halfway by the midpoint', () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    expect(easeOutQuint(0.5)).toBeGreaterThan(0.5);
  });

  it('clamps out-of-range and non-finite input instead of exploding', () => {
    expect(clamp01(-5)).toBe(0);
    expect(clamp01(5)).toBe(1);
    expect(clamp01(NaN)).toBe(0);
    expect(clamp01(Infinity)).toBe(1);
    expect(easeOutQuint(-1)).toBe(0);
    expect(easeOutQuint(99)).toBe(1);
  });
});

describe('count-up', () => {
  it('lands exactly on the target value', () => {
    expect(countValue(0, 1_937_035, 1)).toBe(1_937_035);
  });

  it('starts at the starting value', () => {
    expect(countValue(0, 500, 0)).toBe(0);
    expect(countValue(120, 500, 0)).toBe(120);
  });

  it('never overshoots the target at any progress', () => {
    for (let t = 0; t <= 1.2; t += 0.01) {
      const v = countValue(0, 1000, t);
      expect(v).toBeLessThanOrEqual(1000 + 1e-9);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('counts down as well as up', () => {
    expect(countValue(100, 0, 1)).toBe(0);
    expect(countValue(100, 0, 0.5)).toBeLessThan(100);
  });
});

describe('stagger', () => {
  it('is zero for the first item and increases', () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(1)).toBeGreaterThan(staggerDelay(0));
  });

  it('caps, so a 600-row page still finishes quickly', () => {
    // Uncapped, 600 rows x 26ms would be 15 seconds of waiting.
    expect(staggerDelay(600)).toBeLessThanOrEqual(320);
    expect(staggerDelay(100000)).toBeLessThanOrEqual(320);
  });

  it('never returns a negative or non-finite delay', () => {
    expect(staggerDelay(-3)).toBe(0);
    expect(staggerDelay(NaN)).toBe(0);
  });
});

describe('duration formatting', () => {
  it('formats hours, minutes and seconds sensibly', () => {
    expect(fmtDuration(3.6e6)).toBe('1h 00m');
    expect(fmtDuration(90 * 60000)).toBe('1h 30m');
    expect(fmtDuration(5 * 60000)).toBe('5 min');
    expect(fmtDuration(4000)).toBe('4s');
    expect(fmtDuration(0)).toBe('0s');
  });

  it('handles the jxc-scale total without scientific notation', () => {
    const out = fmtDuration(32322 * 3.6e6);
    expect(out).toMatch(/^32,32\d+h/);
    expect(out).not.toMatch(/e\+/);
  });

  it('never renders a negative duration', () => {
    expect(fmtDuration(-500)).toBe('0s');
  });
});

/* ══════════════ listening clock ══════════════ */
describe('listening clock', () => {
  const hours = Array.from({ length: 24 }, (_, i) => (i === 21 ? 1000 : 100));

  it('always produces exactly 24 wedges', () => {
    expect(clockWedges(hours)).toHaveLength(24);
    expect(clockWedges([])).toHaveLength(24);
    expect(clockWedges(null)).toHaveLength(24);
  });

  it('gives the busiest hour the largest share', () => {
    const w = clockWedges(hours);
    expect(w[21].share).toBe(1);
    expect(w[0].share).toBeLessThan(1);
  });

  it('emits a valid closed path for every wedge, even at zero', () => {
    for (const w of clockWedges(new Array(24).fill(0))) {
      expect(w.d.startsWith('M')).toBe(true);
      expect(w.d.trimEnd().endsWith('Z')).toBe(true);
      expect(w.d).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  it('keeps a quiet hour visible rather than collapsing it to nothing', () => {
    // A zero hour must still be a wedge, or it reads as missing data.
    const w = clockWedges([1000, ...new Array(23).fill(0)]);
    expect(w[5].d).not.toMatch(/NaN/);
    expect(w[5].share).toBe(0);
  });

  it('identifies the peak hour, and returns null when there is no data', () => {
    expect(peakHour(hours)).toBe(21);
    expect(peakHour(new Array(24).fill(0))).toBeNull();
    expect(peakHour([])).toBeNull();
  });

  it('places 0 at the top and 6 to the right', () => {
    const top = polar(100, 100, 50, 0);
    const right = polar(100, 100, 50, 0.25);
    expect(top.y).toBeLessThan(100);
    expect(top.x).toBeCloseTo(100, 6);
    expect(right.x).toBeGreaterThan(100);
    expect(right.y).toBeCloseTo(100, 6);
  });

  it('renders SVG with no broken numbers', () => {
    const svg = renderClock(hours);
    expect(svg).toContain('<svg');
    expect(svg).toContain('aria-label');
    expect(svg).not.toMatch(/NaN|undefined/);
  });
});

/* ══════════════ donut ══════════════ */
describe('donut', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ title: `T${i}`, ms: (20 - i) * 1000 }));

  it('shares always sum to 1', () => {
    const { slices } = donutSlices(rows);
    const sum = slices.reduce((n, s) => n + s.share, 0);
    expect(sum).toBeCloseTo(1, 9);
  });

  it('collapses the tail into a single Other slice', () => {
    const { slices } = donutSlices(rows, { top: 5 });
    expect(slices).toHaveLength(6);
    expect(slices.at(-1).other).toBe(true);
    expect(slices.at(-1).label).toBe('15 more');
  });

  it('omits the Other slice when everything fits', () => {
    const { slices } = donutSlices(rows.slice(0, 3), { top: 8 });
    expect(slices).toHaveLength(3);
    expect(slices.some((s) => s.other)).toBe(false);
  });

  it('slices are contiguous — no gaps or overlaps around the ring', () => {
    const { slices } = donutSlices(rows);
    slices.forEach((s, i) => {
      if (i > 0) expect(s.start).toBeCloseTo(slices[i - 1].end, 9);
    });
    expect(slices.at(-1).end).toBeCloseTo(1, 9);
  });

  it('handles an empty or all-zero input without dividing by zero', () => {
    expect(donutSlices([]).slices).toEqual([]);
    expect(donutSlices([{ title: 'a', ms: 0 }]).total).toBe(0);
    expect(donutSlices(null).slices).toEqual([]);
  });

  it('ignores negative values rather than inverting an arc', () => {
    const { slices } = donutSlices([{ title: 'a', ms: 10 }, { title: 'b', ms: -50 }]);
    expect(slices).toHaveLength(1);
  });

  it('dash offsets are non-positive and within one circumference', () => {
    const { slices } = donutSlices(rows);
    for (const s of donutStrokes(slices)) {
      expect(Number(s.dashOffset)).toBeLessThanOrEqual(0);
      expect(Math.abs(Number(s.dashOffset))).toBeLessThanOrEqual(Number(s.circumference) + 0.01);
    }
  });

  it('renders without broken numbers, and degrades on empty data', () => {
    expect(renderDonut(rows)).not.toMatch(/NaN|undefined/);
    expect(renderDonut([])).toContain('Nothing to chart');
  });

  it('escapes hostile labels', () => {
    expect(renderDonut([{ title: '<script>x</script>', ms: 5 }])).not.toContain('<script>');
  });
});

/* ══════════════ bars ══════════════ */
describe('bars', () => {
  it('scales the largest to 100%', () => {
    const b = barRows([['a', 5], ['b', 10]]);
    expect(b[1].pct).toBe(100);
    expect(b[0].pct).toBe(50);
  });

  it('never divides by zero on an all-zero series', () => {
    for (const r of barRows([['a', 0], ['b', 0]])) expect(r.pct).toBe(0);
  });

  it('clamps negatives to zero', () => {
    expect(barRows([['a', -5], ['b', 10]])[0].pct).toBe(0);
  });

  it('renders and escapes labels', () => {
    expect(renderBars([['<b>', 1]])).not.toContain('<b>');
    expect(renderBars([])).toContain('Nothing here');
  });
});

/* ══════════════ calendar heatmap ══════════════ */
describe('calendar heat levels', () => {
  it('uses quantiles so one huge day does not flatten the rest', () => {
    // 100 ordinary days plus one enormous one. On a linear scale every
    // ordinary day would land in level 0 and the calendar would look empty.
    const m = new Map();
    for (let i = 0; i < 100; i++) m.set(i, 1000 + i * 10);
    m.set(999, 10_000_000);
    const { level } = heatLevels(m);
    const levels = [...m.values()].map(level);
    expect(new Set(levels).size).toBeGreaterThan(2);
    expect(levels.filter((l) => l === 0)).toHaveLength(0);
  });

  it('gives zero and missing days level 0', () => {
    const m = new Map([[1, 100], [2, 200]]);
    const { level } = heatLevels(m);
    expect(level(0)).toBe(0);
    expect(level(undefined)).toBe(0);
  });

  it('never exceeds level 4', () => {
    const m = new Map([[1, 1], [2, 2], [3, 3]]);
    const { level } = heatLevels(m);
    expect(level(1e12)).toBeLessThanOrEqual(4);
  });

  it('handles an empty calendar', () => {
    const { level, thresholds } = heatLevels(new Map());
    expect(thresholds).toEqual([]);
    expect(level(5)).toBe(0);
  });
});

/* ══════════════ reduced motion ══════════════ */
describe('reduced motion', () => {
  it('is reported from the media query', () => {
    globalThis.matchMedia = () => ({ matches: true });
    expect(reducedMotion()).toBe(true);
    globalThis.matchMedia = () => ({ matches: false });
    expect(reducedMotion()).toBe(false);
  });

  it('does not throw where matchMedia is unavailable', () => {
    const saved = globalThis.matchMedia;
    delete globalThis.matchMedia;
    expect(() => reducedMotion()).not.toThrow();
    expect(reducedMotion()).toBe(false);
    globalThis.matchMedia = saved;
  });
});
