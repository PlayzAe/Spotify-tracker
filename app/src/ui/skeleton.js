/**
 * Loading placeholders.
 *
 * Skeletons rather than spinners, per the brief. A spinner says "something is
 * happening"; a skeleton says "a list of rows is coming and here is how big it
 * will be", so the layout does not jump when the real content lands.
 *
 * Everything here is a string, so it can be tested without a DOM.
 */

/** A row placeholder shaped like a real leaderboard row. */
export function skeletonRows(n = 6) {
  const rows = [];
  for (let i = 0; i < Math.max(0, n); i++) {
    // Vary the title width so it reads as content rather than a striped block.
    const w = 42 + ((i * 37) % 38);
    rows.push(
      `<li class="sk-row" style="--d:${Math.min(i * 40, 240)}ms" aria-hidden="true">` +
        '<span class="sk sk-num"></span>' +
        '<span class="sk sk-art"></span>' +
        `<span class="sk-t"><span class="sk sk-line" style="width:${w}%"></span>` +
          `<span class="sk sk-line sk-sub" style="width:${Math.round(w * 0.55)}%"></span></span>` +
        '<span class="sk sk-val"></span>' +
      '</li>',
    );
  }
  return rows.join('');
}

/** A generic block placeholder, e.g. where a chart is about to appear. */
export function skeletonBlock(height = 120) {
  // `Number(h) || 120` would send an explicit 0 to the default. Separate
  // "unusable input" from "a real number that happens to be small".
  const n = Number(height);
  const h = Number.isFinite(n) ? Math.max(20, n) : 120;
  return `<div class="sk sk-block" style="height:${h}px" aria-hidden="true"></div>`;
}

/** Figure tiles, so the stats grid does not pop in from nothing. */
export function skeletonFigs(n = 8) {
  let out = '';
  for (let i = 0; i < Math.max(0, n); i++) {
    out += '<div class="fig" aria-hidden="true"><span class="sk sk-line" style="width:64%;height:22px"></span>' +
           '<span class="sk sk-line sk-sub" style="width:44%;margin-top:8px"></span></div>';
  }
  return out;
}

/** Screen-reader announcement that pairs with a visual skeleton. */
export const loadingLabel = (what = 'results') => `Loading ${what}…`;
