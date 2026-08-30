/**
 * Animation helpers.
 *
 * Rule for everything here: only `transform` and `opacity` are animated. Those
 * two are handled by the compositor and never trigger layout or paint, so a
 * list of 50 rows animating in costs about the same as one. Anything that
 * animates width/height/top/left is a bug, not a style choice.
 *
 * Every function is a no-op when the viewer asks for reduced motion.
 */

export const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- easing ---------- */
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeOutQuint = (t) => 1 - Math.pow(1 - clamp01(t), 5);
export const easeInOutCubic = (t) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export function clamp01(t) {
  // NaN -> 0, but +Infinity must clamp to 1: a counter handed a bad duration
  // should land on its target, not reset to the start.
  if (Number.isNaN(t) || t === undefined || t === null) return 0;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/* ---------- counting up ---------- */

/** Pure: value at progress `t` between from and to. Exported so it can be tested. */
export const countValue = (from, to, t, ease = easeOutQuint) =>
  from + (to - from) * ease(clamp01(t));

/**
 * Count a number up in place. Returns a cancel function.
 * Skips straight to the final value under reduced motion — the number is the
 * point, the animation is decoration.
 */
export function countUp(el, to, { duration = 900, from = 0, format = String, ease = easeOutQuint } = {}) {
  if (!el) return () => {};
  if (reducedMotion() || duration <= 0) { el.textContent = format(to); return () => {}; }
  let raf = 0;
  const t0 = performance.now();
  const step = (now) => {
    const t = (now - t0) / duration;
    el.textContent = format(countValue(from, to, t, ease));
    if (t < 1) raf = requestAnimationFrame(step);
    else el.textContent = format(to);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/* ---------- scroll reveal ---------- */

/**
 * Reveal elements as they enter the viewport, once each.
 * Uses IntersectionObserver so there is no scroll listener and no layout
 * thrash. Elements start hidden via CSS (.reveal) and get .in added.
 */
export function revealOnScroll(root = document, selector = '.reveal') {
  const els = [...root.querySelectorAll(selector)];
  if (!els.length) return () => {};
  if (reducedMotion() || typeof IntersectionObserver !== 'function') {
    els.forEach((e) => e.classList.add('in'));
    return () => {};
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  els.forEach((e) => io.observe(e));
  return () => io.disconnect();
}

/* ---------- stagger ---------- */

/**
 * Delay for item `i`, in ms. Capped so a 500-row list does not take 40 seconds
 * to finish appearing — after `maxItems` everything shares the last delay.
 */
export function staggerDelay(i, { step = 26, max = 320 } = {}) {
  if (!Number.isFinite(i) || i < 0) return 0;
  return Math.min(i * step, max);
}

/** Apply stagger delays as a CSS custom property. */
export function stagger(els, opts) {
  const list = [...els];
  if (reducedMotion()) { list.forEach((e) => e.style.setProperty('--d', '0ms')); return; }
  list.forEach((e, i) => e.style.setProperty('--d', `${staggerDelay(i, opts)}ms`));
}

/* ---------- number formatting used by counters ---------- */
export const fmtInt = (n) => Math.round(n).toLocaleString();
export const fmtHours = (ms) => `${Math.round(ms / 3.6e6).toLocaleString()}h`;
export function fmtDuration(ms) {
  const h = Math.floor(ms / 3.6e6);
  const m = Math.round((ms % 3.6e6) / 60000);
  if (h >= 1) return `${h.toLocaleString()}h ${String(m).padStart(2, '0')}m`;
  if (m >= 1) return `${m} min`;
  return `${Math.max(0, Math.round(ms / 1000))}s`;
}

/* ---------- one-shot transition helper ---------- */

/**
 * Swap panel content with a fade-IN only.
 *
 * The obvious version fades out, waits, then renders — which delays the new
 * numbers by a full animation. The brief is explicit that nothing may delay
 * reading a number, so the content lands immediately and only the opacity
 * catches up.
 */
export function swapContent(el, render, { duration = 150 } = {}) {
  if (!el) return;
  render();
  if (reducedMotion()) return;
  el.style.transition = 'none';
  el.style.opacity = '0';
  el.style.transform = 'translateY(5px)';
  requestAnimationFrame(() => {
    el.style.transition = `opacity ${duration}ms var(--ease, ease), transform ${duration}ms var(--ease, ease)`;
    el.style.opacity = '1';
    el.style.transform = 'none';
  });
}
