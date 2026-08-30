/**
 * Chart geometry, as pure functions.
 *
 * All the maths lives here, separately from the DOM, so it can be unit-tested
 * without a browser. The render helpers below build SVG strings from it.
 *
 * SVG rather than canvas: these are small datasets (24 hours, 7 days, 12 slices)
 * and SVG scales to any DPI, animates on the compositor via stroke-dashoffset
 * and transform, and stays readable to a screen reader.
 */

/* ---------- shared ---------- */
export const TAU = Math.PI * 2;

/** Polar to cartesian, with 0 at 12 o'clock and angles running clockwise. */
export function polar(cx, cy, r, fraction) {
  const a = fraction * TAU - Math.PI / 2;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

const f2 = (n) => Number(n.toFixed(2));

/* ---------- listening clock (24-hour radial) ---------- */

/**
 * One wedge per hour, radius proportional to that hour's share.
 * Returns geometry only — no DOM, no colours.
 *
 * A minimum radius is enforced so a quiet hour is still visibly a wedge rather
 * than vanishing, which would read as missing data instead of a low value.
 */
export function clockWedges(hours, { cx = 100, cy = 100, rMin = 30, rMax = 94, gap = 0.006 } = {}) {
  const vals = Array.from({ length: 24 }, (_, i) => Math.max(0, Number(hours?.[i]) || 0));
  const max = Math.max(...vals);
  // Scale from the MINIMUM, not from zero. A heavy listener plays music in
  // every hour of the day, so a 0..max scale compresses all 24 wedges into a
  // near-perfect circle and the chart says nothing. Anchoring the floor at the
  // quietest hour spends the whole radius on the range that actually varies.
  const nonZero = vals.filter((v) => v > 0);
  const min = nonZero.length ? Math.min(...nonZero) : 0;
  const span = max - min;
  return vals.map((v, i) => {
    const share = v <= 0 ? 0 : span > 0 ? (v - min) / span : 1;
    const r = rMin + (rMax - rMin) * share;
    const a0 = i / 24 + gap;
    const a1 = (i + 1) / 24 - gap;
    const p0 = polar(cx, cy, rMin, a0);
    const p1 = polar(cx, cy, r, a0);
    const p2 = polar(cx, cy, r, a1);
    const p3 = polar(cx, cy, rMin, a1);
    return {
      hour: i, value: v, share,
      // 0-3 intensity band. Colour reinforces size rather than replacing it,
      // so the chart still reads if you cannot distinguish the greens.
      tier: v <= 0 ? 0 : Math.min(3, Math.floor(share * 3.999)),
      d: `M${f2(p0.x)} ${f2(p0.y)} L${f2(p1.x)} ${f2(p1.y)} ` +
         `A${f2(r)} ${f2(r)} 0 0 1 ${f2(p2.x)} ${f2(p2.y)} ` +
         `L${f2(p3.x)} ${f2(p3.y)} ` +
         `A${f2(rMin)} ${f2(rMin)} 0 0 0 ${f2(p0.x)} ${f2(p0.y)} Z`,
    };
  });
}

/** The hour with the most listening, or null when there is none. */
export function peakHour(hours) {
  const vals = Array.from({ length: 24 }, (_, i) => Number(hours?.[i]) || 0);
  const max = Math.max(...vals);
  return max > 0 ? vals.indexOf(max) : null;
}

/* ---------- donut ---------- */

/**
 * Slices for a donut. Everything past `top` collapses into one "Other" slice,
 * so an artist with 300 tracks does not render 300 unreadable slivers.
 */
export function donutSlices(rows, { top = 8, getValue = (r) => r.ms, getLabel = (r) => r.title } = {}) {
  const clean = (rows || []).map((r) => ({ label: getLabel(r), value: Math.max(0, Number(getValue(r)) || 0) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = clean.reduce((n, r) => n + r.value, 0);
  if (!total) return { total: 0, slices: [] };

  const head = clean.slice(0, top);
  const tail = clean.slice(top);
  const rest = tail.reduce((n, r) => n + r.value, 0);
  const parts = rest > 0 ? [...head, { label: `${tail.length} more`, value: rest, other: true }] : head;

  let acc = 0;
  const slices = parts.map((p, i) => {
    const share = p.value / total;
    const s = { ...p, index: i, share, start: acc, end: acc + share };
    acc += share;
    return s;
  });
  return { total, slices };
}

/**
 * Donut arcs as stroke-dash values on a single circle — one path per slice,
 * animated by transitioning stroke-dashoffset. Cheaper and smoother than
 * generating arc `d` strings, and it animates on the compositor.
 */
export function donutStrokes(slices, { r = 60 } = {}) {
  const circumference = TAU * r;
  return slices.map((s) => ({
    ...s,
    dashArray: `${f2(s.share * circumference)} ${f2(circumference)}`,
    dashOffset: f2(-s.start * circumference),
    circumference: f2(circumference),
  }));
}

/* ---------- bars ---------- */

export function barRows(rows, { getValue = (r) => r[1], getLabel = (r) => r[0] } = {}) {
  const clean = (rows || []).map((r) => ({ label: getLabel(r), value: Math.max(0, Number(getValue(r)) || 0) }));
  const max = Math.max(1, ...clean.map((r) => r.value));
  return clean.map((r) => ({ ...r, pct: f2(r.value / max * 100) }));
}

/* ---------- calendar heatmap ---------- */

/**
 * Buckets day totals into 0-4 intensity levels using quantiles rather than a
 * linear scale — one 24-hour day would otherwise flatten every other day to
 * level 0 and the calendar would read as empty.
 */
export function heatLevels(dayMap) {
  const values = [...(dayMap?.values?.() ?? [])].filter((v) => v > 0).sort((a, b) => a - b);
  if (!values.length) return { thresholds: [], level: () => 0 };
  const q = (p) => values[Math.min(values.length - 1, Math.floor(values.length * p))];
  const thresholds = [q(0.25), q(0.5), q(0.75), q(0.92)];
  return {
    thresholds,
    level: (v) => {
      if (!v || v <= 0) return 0;
      let l = 1;
      for (const t of thresholds) if (v > t) l++;
      return Math.min(4, l);
    },
  };
}

/* ---------- render helpers (strings, no DOM writes) ---------- */

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderClock(hours, fmt = (v) => String(v)) {
  const wedges = clockWedges(hours);
  const peak = peakHour(hours);
  const total = wedges.reduce((n, w) => n + w.value, 0);

  // Hour markers sit OUTSIDE the wedges so they never collide with the data.
  const labels = [0, 3, 6, 9, 12, 15, 18, 21].map((h) => {
    const p = polar(100, 100, 108, h / 24);
    const big = h % 6 === 0;
    return `<text x="${f2(p.x)}" y="${f2(p.y + 3.4)}" class="ck-h${big ? ' ck-h-big' : ''}">${String(h).padStart(2, '0')}</text>`;
  }).join('');

  const paths = wedges.map((w) => {
    const pct = total > 0 ? (w.value / total * 100).toFixed(1) : '0.0';
    const cls = `ck-w ck-t${w.tier}${w.hour === peak ? ' ck-peak' : ''}`;
    return `<path d="${w.d}" class="${cls}" style="--d:${w.hour * 16}ms" tabindex="0" role="listitem"` +
      ` aria-label="${w.hour}:00, ${esc(fmt(w.value))}, ${pct} percent">` +
      `<title>${String(w.hour).padStart(2, '0')}:00 — ${esc(fmt(w.value))} · ${pct}%</title></path>`;
  }).join('');

  const ring = `<circle cx="100" cy="100" r="30" class="ck-hub"/>`;
  const centre = peak === null ? '' :
    `<text x="100" y="97" class="ck-c1">${String(peak).padStart(2, '0')}:00</text>` +
    `<text x="100" y="109" class="ck-c2">busiest</text>`;

  return `<svg viewBox="-14 -14 228 228" class="clock" role="list" aria-label="Listening by hour of day">` +
    `${paths}${ring}${centre}${labels}</svg>`;
}

export function renderDonut(rows, opts = {}) {
  const { slices, total } = donutSlices(rows, opts);
  if (!total) return '<p class="muted">Nothing to chart in this range.</p>';
  const strokes = donutStrokes(slices);
  const arcs = strokes.map((s, i) => `<circle class="dn-s dn-c${i % 8}${s.other ? ' dn-other' : ''}" cx="80" cy="80" r="60"
      stroke-dasharray="${s.dashArray}" stroke-dashoffset="${s.dashOffset}" style="--d:${i * 60}ms"><title>${esc(s.label)} — ${(s.share * 100).toFixed(1)}%</title></circle>`).join('');
  const legend = strokes.map((s, i) => `<li class="dn-l"><span class="dn-k dn-c${i % 8}"></span>
      <span class="dn-n">${esc(s.label)}</span><span class="dn-v">${(s.share * 100).toFixed(1)}%</span></li>`).join('');
  return `<div class="donut-wrap">
    <svg viewBox="0 0 160 160" class="donut" role="img" aria-label="Share of listening">${arcs}</svg>
    <ul class="dn-legend">${legend}</ul></div>`;
}

export function renderBars(rows, fmt = (v) => String(v), opts = {}) {
  const bars = barRows(rows, opts);
  if (!bars.length) return '<p class="muted">Nothing here yet.</p>';
  // --w is a unit scalar for transform:scaleX, NOT a width. Animating width
  // relayouts the row on every frame; scaleX runs on the compositor.
  // A total on its own is hard to compare across 24 rows. The share of the
  // whole answers "is this a lot?" without the reader doing the division.
  const sum = bars.reduce((n, b) => n + b.value, 0);
  return bars.map((b, i) => {
    const share = sum > 0 ? (b.value / sum * 100) : 0;
    return `<div class="row">
      <span class="rl">${esc(b.label)}</span>
      <span class="rt"><span class="rf" style="--w:${(b.pct / 100).toFixed(4)};--d:${Math.min(i * 18, 300)}ms"></span></span>
      <span class="rv">${b.value ? esc(fmt(b.value)) : '—'}</span>
      <span class="rp">${b.value ? `${share.toFixed(1)}%` : ''}</span>
    </div>`;
  }).join('');
}
