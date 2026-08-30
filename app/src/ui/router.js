/**
 * Hash router + scroll rail.
 *
 * Hash routing rather than a framework or the History API: the whole product
 * is a static file with no server, so there is nothing to rewrite deep links
 * against. A hash works from a file:// open, from any static host, and needs
 * no build step.
 *
 * The pure parts are exported separately so they can be unit-tested without
 * a DOM or a browser.
 */

export const ROUTES = ['/', '/why', '/get', '/upload', '/stats', '/privacy', '/terms'];

/** Normalize any hash into a known route. Unknown routes fall back to '/'. */
export function parseRoute(hash) {
  const raw = String(hash || '').replace(/^#/, '').trim();
  if (!raw || raw === '/') return '/';
  const path = ('/' + raw.replace(/^\/+/, '').replace(/\/+$/, '')).toLowerCase();
  return ROUTES.includes(path) ? path : '/';
}

/**
 * Which meter segments are lit at a given scroll position.
 * Returns a count, not a percentage, so the caller never has to round.
 */
export function litSegments(scrollY, docHeight, viewport, segments) {
  const scrollable = Math.max(0, docHeight - viewport);
  if (segments <= 0) return 0;
  if (scrollable <= 0) return segments;             // page fits: meter is full
  const p = Math.min(1, Math.max(0, scrollY / scrollable));
  return Math.round(p * segments);
}

/* ---------- DOM wiring ---------- */

export function createRouter({ onChange } = {}) {
  const pages = [...document.querySelectorAll('[data-page]')];
  const links = [...document.querySelectorAll('#nav a')];

  const apply = () => {
    const route = parseRoute(location.hash);
    for (const p of pages) p.classList.toggle('on', p.dataset.page === route);
    for (const a of links) a.classList.toggle('on', parseRoute(a.getAttribute('href')) === route);
    // A route change is a new page, so start at the top — but never fight a
    // reduced-motion preference with smooth scrolling.
    window.scrollTo({ top: 0, behavior: 'instant' });
    onChange?.(route);
    return route;
  };

  window.addEventListener('hashchange', apply);
  return { apply, go: (r) => { location.hash = r; } };
}

/** Build the meter segments once, then only toggle a class on scroll. */
export function createRail(el, segments = 26) {
  if (!el) return { update() {} };
  el.innerHTML = Array.from({ length: segments }, () => '<i></i>').join('');
  const bars = [...el.children];
  let last = -1;
  let queued = false;

  const paint = () => {
    queued = false;
    const lit = litSegments(window.scrollY, document.documentElement.scrollHeight, window.innerHeight, segments);
    if (lit === last) return;
    last = lit;
    // Lights fill from the bottom, like a level meter.
    bars.forEach((b, i) => b.classList.toggle('lit', i >= segments - lit));
  };
  const update = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(paint);   // coalesce to one paint per frame
  };

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  // requestAnimationFrame does not fire in a hidden tab, so any scrolling that
  // happened while the tab was in the background never painted. Repaint on the
  // way back in, otherwise the meter shows a stale position.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
  update();
  return { update };
}

