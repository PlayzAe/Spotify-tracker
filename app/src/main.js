/**
 * Longplay — alpha UI.
 *
 * The engine (src/engine/) does the work and never touches the network.
 * This file is presentation only: views, controls, animation triggers.
 *
 * Every worker reply is routed by token, so a fast click can never render a
 * stale answer over a newer one.
 */
import EngineWorker from './engine/worker.js?worker';
import { compare, avatarFor } from './engine/compare.js';
import * as covers from './ui/covers.js';
import * as adblock from './ui/adblock.js';
import { renderClock, renderDonut, renderBars } from './ui/charts.js';
import { countUp, revealOnScroll, fmtInt, fmtDuration, reducedMotion, swapContent } from './ui/anim.js';
import { createRouter, createRail } from './ui/router.js';
import { countryName, countryFlag } from './engine/countries.js';
import { linkFor, linkLabel } from './ui/links.js';
import { skeletonRows, skeletonBlock } from './ui/skeleton.js';
import { statDetail, STAT_TILES } from './ui/statdetail.js';
import { mountPresence, TEAM } from './ui/presence.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dstr = (ms) => new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const PAGE = 25;
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

let worker = null, cmpWorker = null;
let meta = null, latest = null, cmpB = null, labels = { a: 'You', b: 'Them' };
let view = 'overview', entity = 'tracks', page = 0, searchPage = 0, drillName = null;

/* Token routing: every query carries an id, and a reply is only used if it is
   still the newest of its kind. */
let seq = 0;
const tok = { main: -1, search: -1, drill: -1, cmpSide: -1 };

const state = { from: null, to: null, platform: null, shuffle: null, offline: null, content: null, sort: 'time' };

/* ══════════ theme ══════════ */
const root = document.documentElement;
try { const t = localStorage.getItem('lp-theme'); if (t) root.setAttribute('data-theme', t); } catch { /* private mode */ }

/* With no stored choice there is no data-theme attribute, so the theme is
   whatever the OS says. Reading only the attribute made the first click a
   no-op for anyone on a light OS — it "switched" to the theme already
   showing. Resolve the effective theme, then flip that. */
const effectiveTheme = () =>
  root.getAttribute('data-theme')
  || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

/* The browser tints its own chrome from this, so it tracks the page
   background. A stale value leaves a pale bar above a dark page. */
const syncThemeColor = () => {
  const bg = getComputedStyle(root).getPropertyValue('--paper').trim();
  let m = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
  m.content = bg;
};

$('theme').onclick = () => {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  try { localStorage.setItem('lp-theme', next); } catch { /* ignore */ }
  syncThemeColor();
};
syncThemeColor();

/* ══════════ router, rail ══════════ */
createRail(document.getElementById('rail'), 26);

const router = createRouter({
  onChange: (route) => {
    // The hash survives a reload, so landing on /stats with no file loaded
    // used to show an empty shell — or the Compare tab you happened to be on
    // last time. Nothing persists between sessions, so bounce to upload.
    if (route === '/stats' && !meta) { location.replace('#/upload'); return; }
    // Re-arm reveals for the page that just became visible: an
    // IntersectionObserver never fires on a display:none element.
    requestAnimationFrame(() => revealOnScroll());
  },
});
router.apply();
document.querySelectorAll('.tabs [data-tab]').forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll('.tabs [data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== b.dataset.tab; });
  };
});

/* ══════════ upload plumbing ══════════ */
function wireDrop(zone, input, onFiles) {
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => onFiles([...input.files]));
  ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('over'); }));
  zone.addEventListener('drop', (e) => onFiles([...e.dataTransfer.files]));
}
const toPayload = async (files) => {
  const out = [];
  for (const f of files) out.push({ name: f.name, buffer: await f.arrayBuffer() });
  return out;
};
wireDrop($('drop'), $('file'), loadMain);
wireDrop($('cmp-drop'), $('cmp-file'), loadCompare);

function resetSession() {
  cmpWorker?.terminate(); cmpWorker = null;
  cmpB = null; latest = null; meta = null; drillName = null; drillAlbum = null;
  view = 'overview'; entity = 'tracks'; page = 0; searchPage = 0;
  labels = { a: 'You', b: 'Them' };
  Object.assign(state, { from: null, to: null, platform: null, shuffle: null,
    offline: null, content: null, sort: 'time' });
  $('cmp-out').hidden = true; $('cmp-out').innerHTML = '';
  $('cmp-empty').hidden = false; $('cmp-progress').textContent = '';
  $('drill').hidden = true;
  const q = $('q'); if (q) q.value = '';
  document.querySelectorAll('[data-view]').forEach((x) =>
    x.setAttribute('aria-selected', String(x.dataset.view === 'overview')));
}

async function loadMain(files) {
  if (!files.length) return;
  resetSession();                       // a second upload starts clean
  $('error').hidden = true; $('progress').hidden = false;
  $('p-detail').textContent = `opening ${files.length} file${files.length > 1 ? 's' : ''}…`;
  $('p-bar').style.transform = 'scaleX(0.04)';
  $('p-records').textContent = '0';
  const payload = await toPayload(files);
  worker?.terminate();
  worker = new EngineWorker();
  worker.onmessage = onMain;
  worker.onerror = () => showError('PARSE_ERROR');
  worker.postMessage({ cmd: 'ingest', files: payload, initialQuery: { ...state, limit: PAGE } }, payload.map((p) => p.buffer));
}

function onMain({ data: d }) {
  if (d.type === 'progress') {
    $('p-records').textContent = fmtInt(d.records);
    $('p-detail').textContent = `${d.files} file${d.files > 1 ? 's' : ''} read`;
    $('p-bar').style.transform = `scaleX(${Math.min(0.94, 0.08 + d.files * 0.03)})`;
    return;
  }
  if (d.type === 'failed') return showError(d.reason);
  if (d.type === 'done') {
    meta = d.summary;
    $('p-bar').style.transform = 'scaleX(1)';
    setTimeout(() => { $('progress').hidden = true; }, 280);
    buildControls();
    renderMeta();
    renderMain(d.result);
    router.go('/stats');            // results are their own page, not a longer one
    maybeAdblock();
    return;
  }
  if (d.type !== 'queried') return;
  if (d.token === tok.drill) return renderDrill(d.result);
  if (d.token === tok.search) return renderSearch(d.result);
  if (d.token === tok.cmpSide) return renderCompare(d.result);
  if (d.token === tok.main) return renderMain(d.result);
}

const ERRORS = {
  WRONG_EXPORT: ['This is the wrong download — easy to fix',
    'Spotify sent you “Account data”. That one covers about a year and has no listening times in it, so there is nothing here to measure.',
    'Go back to spotify.com/account/privacy and tick “Extended streaming history”. It is a separate request on the same page.'],
  README_ONLY: ['This file only has the instructions PDF',
    'Your listening history was not included in what Spotify sent.',
    'Request “Extended streaming history” and wait for the second email.'],
  NO_HISTORY: ['No listening history in this file',
    'We look for files named Streaming_History_Audio — there were none.',
    'If you unzipped or renamed anything, try the original zip from Spotify.'],
  EMPTY_HISTORY: ['Your history file is empty',
    'Right file, but Spotify put no plays in it. That usually means a very new account.',
    'If your account is not new, request the export again in a few days.'],
  NOT_AN_ARCHIVE: ['That does not look like a Spotify export',
    'We read the .zip Spotify emails you, or the .json files from inside it.',
    'Try again with the zip exactly as you downloaded it.'],
  PARSE_ERROR: ['Something went wrong reading that file',
    'It may have been damaged while downloading.',
    'Downloading it again from Spotify usually fixes this.'],
};
function showError(reason) {
  const [t, b, f] = ERRORS[reason] || ERRORS.PARSE_ERROR;
  $('progress').hidden = true; $('error').hidden = false;
  $('e-title').textContent = t; $('e-body').textContent = b; $('e-fix').textContent = f;
  $('error').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
}

/* ══════════ controls ══════════ */
let groups = [];
function paintPills(g) {
  g.box.innerHTML = '';
  for (const it of (typeof g.items === 'function' ? g.items() : g.items)) {
    const b = document.createElement('button');
    b.className = 'pill' + (g.isOn(it) ? ' on' : '');
    b.textContent = it.label;
    b.onclick = () => { g.onPick(it); page = 0; syncPills(); runMain(); };
    g.box.appendChild(b);
  }
}
const syncPills = () => groups.forEach(paintPills);

function buildControls() {
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const items = [{ label: 'All time', from: null, to: null }];
  for (const y of meta.years) items.push({ label: String(y), from: `${y}-01-01`, to: `${y}-12-31` });
  const lastN = (days, label) => {
    const end = new Date(meta.latest);
    return { label, from: iso(new Date(end.getTime() - days * 86400000)), to: iso(end) };
  };
  if (meta.years.length) items.push(lastN(30, 'Last 30 days'), lastN(90, 'Last 3 months'), lastN(365, 'Last year'));

  groups = [
    { box: $('ranges'), items,
      isOn: (it) => state.from === it.from && state.to === it.to,
      onPick: (it) => { state.from = it.from; state.to = it.to; $('from').value = it.from || ''; $('to').value = it.to || ''; } },
    { box: $('plats'),
      // A function, not a snapshot: the device list is only known once a query
      // returns, and it changes with the date range.
      items: () => [{ label: 'All devices', index: null }].concat((latest?.platforms || []).map((p) => ({ label: p.name, index: p.index }))),
      isOn: (it) => state.platform === it.index,
      onPick: (it) => { state.platform = it.index; } },
    { box: $('hows'),
      items: [{ label: 'Any way', shuffle: null, offline: null }, { label: 'On shuffle', shuffle: true, offline: null },
              { label: 'Picked on purpose', shuffle: false, offline: null }, { label: 'Offline', shuffle: null, offline: true }],
      isOn: (it) => state.shuffle === it.shuffle && state.offline === it.offline,
      onPick: (it) => { state.shuffle = it.shuffle; state.offline = it.offline; } },
    { box: $('kinds'),
      items: [{ label: 'Everything', content: null }, { label: 'Music only', content: 'music' }, { label: 'Podcasts only', content: 'podcast' }],
      isOn: (it) => state.content === it.content,
      onPick: (it) => { state.content = it.content; } },
  ];
  syncPills();

  $('apply').onclick = () => { state.from = $('from').value || null; state.to = $('to').value || null; page = 0; syncPills(); runMain(); };
  $('reset').onclick = () => {
    Object.assign(state, { from: null, to: null, platform: null, shuffle: null, offline: null, content: null, sort: 'time' });
    $('from').value = ''; $('to').value = ''; $('sort').value = 'time';
    page = 0; drillName = null; $('drill').hidden = true;
    syncPills(); runMain();
  };
  $('sort').onchange = () => { state.sort = $('sort').value; page = 0; runMain(); };
  $('art').onchange = () => { covers.setEnabled($('art').checked); renderBoard(); };
  $('drill-close').onclick = () => { $('drill').hidden = true; drillName = null; };

  document.querySelectorAll('[data-view]').forEach((b) => {
    b.onclick = () => {
      view = b.dataset.view;
      document.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      if (['songs', 'artists', 'albums'].includes(view)) { entity = view === 'songs' ? 'tracks' : view; page = 0; }
      showView();
    };
  });

  let debounce = null;
  $('q').oninput = () => { clearTimeout(debounce); debounce = setTimeout(() => { searchPage = 0; runSearch(); }, 180); };
}

function showView() {
  const board = ['songs', 'artists', 'albums'].includes(view);
  $('view-overview').hidden = view !== 'overview';
  $('view-board').hidden = !board;
  $('view-clock').hidden = view !== 'clock';
  $('view-search').hidden = view !== 'search';
  $('view-compare').hidden = view !== 'compare';
  $('controls').hidden = view === 'compare';
  if (board) { $('board-title').textContent = { tracks: 'Songs', artists: 'Artists', albums: 'Albums' }[entity]; runMain(); }
  if (view === 'clock') renderClockView();
  if (view === 'search') runSearch();
}

const runMain = () => (showBoardSkeleton(), worker?.postMessage({
  cmd: 'query', opts: { ...state, limit: PAGE, offset: page * PAGE }, token: (tok.main = ++seq) }));
const runSearch = () => worker?.postMessage({
  cmd: 'query', opts: { ...state, q: $('q').value.trim(), sort: 'time', limit: PAGE, offset: searchPage * PAGE },
  token: (tok.search = ++seq) });

/* Which stat tile is expanded, if any. */
let openStat = null;
function renderStatDetail(r) {
  const box = $('fig-detail');
  if (!box) return;
  const d = openStat ? statDetail(openStat, r) : null;
  if (!d) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = `<h3>${esc(d.title)}</h3><p class="lead">${esc(d.lead)}</p>
    <div class="fig-facts">${d.facts.map((f) =>
      `<div class="fig-fact"><b>${esc(f.value)}</b><span>${esc(f.label)}</span></div>`).join('')}</div>`;
}

/* Show placeholders only if the answer does not arrive quickly. Flashing a
   skeleton for a 15 ms query is worse than showing nothing at all. */
let skTimer = null;
function showBoardSkeleton() {
  if (!['songs', 'artists', 'albums'].includes(view)) return;
  clearTimeout(skTimer);
  skTimer = setTimeout(() => {
    const box = $('board');
    if (box && !box.dataset.fresh) box.innerHTML = skeletonRows(8);
  }, 220);
}

/* ══════════ render ══════════ */
function renderMeta() {
  $('r-title').textContent = `${dstr(Date.parse(meta.earliest))} — ${dstr(Date.parse(meta.latest))}`;
  $('r-note').textContent = `A snapshot of the file you uploaded. Anything played after ${dstr(Date.parse(meta.latest))} isn’t in it — ask Spotify for a fresh export to see newer plays.`;
  const q = [['Plays counted', `${fmtInt(meta.records)} across ${meta.filesParsed} file${meta.filesParsed > 1 ? 's' : ''}`]];
  if (meta.duplicates) q.push(['Repeats removed', `${fmtInt(meta.duplicates)} — Spotify listed these twice, so we counted them once`]);
  if (meta.unparseable) q.push(['Entries skipped', `${fmtInt(meta.unparseable)} — unreadable, the rest is unaffected`]);
  if (meta.filesSkipped.length) q.push(['Files skipped', meta.filesSkipped.map((f) => `${f.name} (${f.reason})`).join(', ')]);
  q.push(['Different songs', fmtInt(meta.distinctTracks)], ['Different artists', fmtInt(meta.distinctArtists)]);
  if (meta.countries.length) {
    q.push(['Where you listened', meta.countries
      .map(([c, n]) => `${countryFlag(c)} ${countryName(c)} (${fmtInt(n)})`.trim()).join(' · ')]);
  }
  if (meta.unknownFields.length) q.push(['New fields from Spotify', `${meta.unknownFields.map((u) => u.field).join(', ')} — ignored safely`]);
  q.push(['Memory used', `${(meta.storeBytes / 1e6).toFixed(1)} MB, in this tab only`]);
  $('quality').innerHTML = `<dl>${q.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}

function renderMain(r) {
  latest = r;
  $('q-time').textContent = `${r.tookMs} ms`;
  syncPills();

  const VALUES = {
    time: fmtDuration(r.totalMs),
    minutes: fmtInt(r.totalMs / 60000),
    plays: fmtInt(r.plays),
    days: fmtInt(r.days),
    tracks: fmtInt(r.distinctTracks),
    artists: fmtInt(r.distinctArtists),
    skips: `${(r.plays ? r.skips / r.plays * 100 : 0).toFixed(1)}%`,
    avg: r.days ? fmtDuration(r.totalMs / r.days) : '—',
  };
  $('figs').innerHTML = STAT_TILES.map((t) =>
    `<button class="fig${t.hero ? ' hero-fig' : ''}" data-stat="${t.detail || t.key}"
       aria-pressed="${openStat === (t.detail || t.key)}"
       aria-controls="fig-detail"><span class="v">${esc(VALUES[t.key])}</span>
       <span class="l">${esc(t.label)}</span></button>`).join('');
  $('figs').querySelectorAll('[data-stat]').forEach((b) => {
    b.onclick = () => {
      openStat = openStat === b.dataset.stat ? null : b.dataset.stat;
      renderStatDetail(r);
      $('figs').querySelectorAll('[data-stat]').forEach((x) =>
        x.setAttribute('aria-pressed', String(x.dataset.stat === openStat)));
    };
  });
  renderStatDetail(r);
  // Only the two headline figures count up. Animating all eight would leave
  // nothing on screen readable for a second.
  countUp($('figs').querySelector('.hero-fig .v'), r.totalMs, { format: fmtDuration, duration: 850 });
  countUp($('figs').children[1].querySelector('.v'), r.totalMs / 60000, { format: fmtInt, duration: 850 });

  $('chart-hours').innerHTML = renderBars(r.hours.map((v, i) => [`${String(i).padStart(2, '0')}:00`, v]), fmtDuration);
  $('chart-wdays').innerHTML = renderBars(r.wdays.map((v, i) => [WD[i], v]), fmtDuration);
  $('chart-plats').innerHTML = renderBars(r.platforms.map((p) => [p.name, p.ms]), fmtDuration);
  $('chart-months').innerHTML = renderBars(r.months.slice(-24).map(([m, v]) => [m, v]), fmtDuration);
  $('donut-artists').innerHTML = renderDonut(r.artists.slice(0, 12), { top: 7 });

  if (['songs', 'artists', 'albums'].includes(view)) renderBoard();
  if (view === 'clock') renderClockView();
}

const SORT_NOTE = {
  time: 'Ranked by how long you actually listened.',
  plays: "Only plays over 30 seconds count — Spotify’s own rule for a real play.",
  steady: "Weighted by how many separate weeks it stayed in rotation, so a short obsession can’t outrank a years-long habit.",
  weeks: 'How many separate weeks it turned up in.',
  skips: 'How often you started it and cut it short.',
  skipRate: 'How often you skip it when it comes on. Needs at least 5 starts.',
  first: 'Oldest discoveries first.',
  last: 'What you played most recently.',
  alpha: 'Alphabetical.',
};

function rowHTML(x, i, drill = 'none') {
  const val = {
    plays: `${fmtInt(x.plays)} plays`, skips: `${fmtInt(x.skips)} skips`,
    skipRate: `${Math.round(x.skipRate * 100)}% skipped`, weeks: `${fmtInt(x.weeks)} weeks`,
    first: x.first ? dstr(x.first) : '—', last: x.last ? dstr(x.last) : '—',
  }[state.sort] || fmtDuration(x.ms);
  const sub = {
    time: `${fmtInt(x.plays)} plays`, plays: fmtDuration(x.ms),
    skipRate: `${fmtInt(x.skips)} of ${fmtInt(x.raw)} times`, skips: `out of ${fmtInt(x.raw)} starts`,
    weeks: fmtDuration(x.ms),
  }[state.sort] || `${fmtInt(x.plays)} plays · ${fmtDuration(x.ms)}`;
  const tag = x.steady ? '<span class="tag tag-steady">steady</span>'
            : x.binge ? '<span class="tag tag-binge">short burst</span>' : '';
  const href = linkFor({ uri: x.uri, title: x.title, artist: x.artist });
  const openable = drill === 'artists' || drill === 'albums';
  return `<li style="--d:${Math.min(i * 22, 300)}ms">
    <img class="cv" alt="" loading="lazy" src="${covers.fallbackTile(x.title, x.artist)}" data-i="${i}">
    <span class="t"><strong>${esc(x.title)}${tag}</strong>${x.artist ? `<span class="a">${esc(x.artist)}</span>` : ''}</span>
    <span class="v">${esc(val)}<span class="s">${esc(sub)}</span></span>
    <a class="ext" href="${esc(href)}" target="_blank" rel="noopener noreferrer"
       title="${esc(linkLabel(x))}" aria-label="${esc(linkLabel(x))}">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></a>
    ${openable ? `<button class="drill" data-kind="${drill}" data-title="${esc(x.title)}" data-artist="${esc(x.artist || '')}"
       aria-label="See what is inside ${esc(x.title)}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg></button>` : ''}
  </li>`;
}

function renderBoard() {
  if (!latest) return;
  const rows = latest[entity] || [];
  const total = latest.totals?.[entity] ?? rows.length;
  const box = $('board');
  box.classList.toggle('art', covers.isEnabled());
  $('board-note').textContent = SORT_NOTE[state.sort] || '';
  clearTimeout(skTimer);
  swapContent(box, () => {
    box.innerHTML = rows.length ? rows.map((x, i) => rowHTML(x, i, entity === 'tracks' ? 'none' : entity)).join('')
      : '<li class="empty">Nothing here for these filters. Try widening the dates.</li>';
    if (covers.isEnabled()) paintCovers(box, rows, entity);
    box.querySelectorAll('.drill').forEach((b) => {
      b.onclick = () => openDrill(b.dataset.kind, b.dataset.title, b.dataset.artist);
    });
  });
  renderPager($('pager'), page, total, (p) => { page = p; runMain(); });
}

function renderPager(el, cur, total, go) {
  const pages = Math.max(1, Math.ceil(total / PAGE));
  if (pages <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = `<button ${cur === 0 ? 'disabled' : ''} data-go="${cur - 1}">← Back</button>
    <span class="pinfo">${fmtInt(cur * PAGE + 1)}–${fmtInt(Math.min(total, (cur + 1) * PAGE))} of ${fmtInt(total)}</span>
    <button ${cur >= pages - 1 ? 'disabled' : ''} data-go="${cur + 1}">Next →</button>`;
  el.querySelectorAll('[data-go]').forEach((b) => {
    b.onclick = () => { go(Number(b.dataset.go)); el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' }); };
  });
}

/* Only ever look up what is on screen — never the whole library. */
function paintCovers(box, rows, kind) {
  box.querySelectorAll('img.cv').forEach((img) => {
    const x = rows[Number(img.dataset.i)];
    if (!x) return;
    const album = kind === 'artists' ? x.title : (x.album || x.title);
    const artist = kind === 'artists' ? x.title : x.artist;
    covers.lookup(album, artist).then((res) => {
      if (!res?.url || !img.isConnected) return;
      const probe = new Image();
      probe.onload = () => { img.src = res.url; };   // keeps the fallback tile on a 404
      probe.src = res.url;
    });
  });
}

/* ══════════ artist drill-down ══════════ */
let drillAlbum = null;
function openDrill(kind, title, artist) {
  drillName = title;
  drillAlbum = kind === 'albums' ? { title, artist } : null;
  const scope = kind === 'albums' ? { albumName: { title, artist } } : { artistName: title };
  $('drill').hidden = false;
  $('drill-title').textContent = drillAlbum ? `${title} — ${artist}` : title;
  $('drill-donut').innerHTML = skeletonBlock(150);
  $('drill-list').innerHTML = skeletonRows(6);
  $('drill').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
  worker.postMessage({
    cmd: 'query',
    opts: { ...state, ...scope, sort: 'time', limit: 100, offset: 0 },
    token: (tok.drill = ++seq),
  });
}
function renderDrill(r) {
  if (!drillName) return;
  $('drill').hidden = false;
  $('drill-title').textContent = drillName;
  $('drill-donut').innerHTML =
    `<p class="muted small">${fmtDuration(r.totalMs)} across ${fmtInt(r.distinctTracks)} song${r.distinctTracks === 1 ? '' : 's'}.</p>`
    + renderDonut(r.tracks, { top: 8 });
  const box = $('drill-list');
  const rows = r.tracks.slice(0, 50);
  box.classList.toggle('art', covers.isEnabled());
  box.innerHTML = rows.map((x, i) => rowHTML(x, i, 'none')).join('');
  if (covers.isEnabled()) paintCovers(box, rows, 'tracks');
  $('drill').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
}

/* ══════════ clock ══════════ */
function renderClockView() {
  if (!latest) return;
  // Every lookup is guarded. A single $(id) that no longer exists throws on
  // .innerHTML and silently kills every line after it — which is exactly how
  // the weekday chart went blank when the second clock panel was removed.
  const set = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };
  set('clock-time', renderClock(latest.hours, fmtDuration));
  set('chart-wdays2', renderBars(latest.wdays.map((v, i) => [WD[i], v]), fmtDuration));
  const note = $('clock-note');
  if (note) {
    const peak = latest.hours.indexOf(Math.max(...latest.hours));
    note.textContent = latest.totalMs
      ? `You listen most around ${String(peak).padStart(2, '0')}:00 — ${fmtDuration(latest.hours[peak])} there in total. Hover any wedge for its hour.`
      : 'No listening in this range.';
  }
}

/* ══════════ search ══════════ */
function renderSearch(r) {
  const rows = r.tracks || [];
  const total = r.totals?.tracks ?? rows.length;
  const q = $('q').value.trim();
  $('q-count').textContent = q ? `${fmtInt(total)} match${total === 1 ? '' : 'es'}` : `${fmtInt(total)} songs in your history`;
  const box = $('search-list');
  box.classList.toggle('art', covers.isEnabled());
  box.innerHTML = rows.length ? rows.map((x, i) => rowHTML(x, i, 'none')).join('')
    : '<li class="empty">Nothing matched. Try a shorter search.</li>';
  if (covers.isEnabled()) paintCovers(box, rows, 'tracks');
  renderPager($('search-pager'), searchPage, total, (p) => { searchPage = p; runSearch(); });
}

/* ══════════ compare ══════════ */
async function loadCompare(files) {
  if (!files.length || !worker) return;
  $('cmp-progress').textContent = 'reading…';
  const payload = await toPayload(files);
  cmpWorker?.terminate();
  cmpWorker = new EngineWorker();
  cmpWorker.onmessage = ({ data: d }) => {
    if (d.type === 'progress') { $('cmp-progress').textContent = `${fmtInt(d.records)} plays read…`; return; }
    if (d.type === 'failed') { $('cmp-progress').textContent = (ERRORS[d.reason] || ERRORS.PARSE_ERROR)[0]; return; }
    if (d.type === 'done') { cmpWorker.postMessage({ cmd: 'query', opts: { limit: 800 }, token: 1 }); return; }
    if (d.type === 'queried') {
      cmpB = d.result;
      $('cmp-progress').textContent = '';
      // Ask our own side for a matching deep list, then compare the two.
      worker.postMessage({ cmd: 'query', opts: { limit: 800 }, token: (tok.cmpSide = ++seq) });
    }
  };
  cmpWorker.postMessage({ cmd: 'ingest', files: payload }, payload.map((p) => p.buffer));
}

function renderCompare(A) {
  if (!cmpB) return;
  const c = compare(A, cmpB, labels, 200);
  const pct = (v) => `${Math.round(v * 100)}%`;

  /* A number on each side is a comparison you have to do in your head. A bar
     behind each one makes the ratio readable at a glance, which is the whole
     point of putting them side by side. */
  const statRow = (label, av, bv, aTxt, bTxt, i) => {
    const max = Math.max(av, bv) || 1;
    return `<div class="cmp-row wide" style="--d:${Math.min(i * 40, 240)}ms">
      <span class="cmp-a"><b class="cmp-rank">${esc(aTxt)}</b>
        <span class="cmp-bar"><i style="--w:${(av / max).toFixed(3)}"></i></span></span>
      <span class="cmp-mid"><span>${esc(label)}</span></span>
      <span class="cmp-b"><b class="cmp-rank">${esc(bTxt)}</b>
        <span class="cmp-bar"><i style="--w:${(bv / max).toFixed(3)}"></i></span></span>
    </div>`;
  };

  const rankRow = (x, i, sub) => `<div class="cmp-row" style="--d:${Math.min(i * 22, 260)}ms">
      <span class="cmp-a"><b class="cmp-rank">#${x.a.rank}</b></span>
      <span class="cmp-mid"><strong>${esc(x.title)}</strong>${sub ? `<span>${esc(sub)}</span>` : ''}</span>
      <span class="cmp-b"><b class="cmp-rank">#${x.b.rank}</b></span>
    </div>`;

  /* Show a handful, hide the rest behind a toggle. Twenty artists and twenty
     songs stacked in one column was the clutter — not the data itself. */
  const section = (id, title, hint, rows, render) => {
    if (!rows.length) return `<div class="cmp-sec"><h3>${esc(title)}</h3>
      <p class="empty">Nothing in common here — which is its own kind of result.</p></div>`;
    const head = rows.slice(0, 6), tail = rows.slice(6);
    return `<div class="cmp-sec">
      <h3>${esc(title)}</h3>${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
      ${head.map((x, i) => render(x, i)).join('')}
      ${tail.length ? `<div id="${id}-rest" hidden>${tail.map((x, i) => render(x, i)).join('')}</div>
        <div class="cmp-more"><button class="pill" data-more="${id}">Show all ${rows.length}</button></div>` : ''}
    </div>`;
  };

  $('cmp-empty').hidden = true;
  $('cmp-out').hidden = false;
  $('cmp-out').innerHTML = `
    <div class="panel">
      <div class="cmp-heads">
        <div class="cmp-who"><img class="cmp-av" src="${avatarFor(labels.a)}" alt="">
          <input id="cmp-a-name" value="${esc(labels.a)}" aria-label="Your label"></div>
        <span class="cmp-vs">vs</span>
        <div class="cmp-who right"><img class="cmp-av" src="${avatarFor(labels.b)}" alt="">
          <input id="cmp-b-name" value="${esc(labels.b)}" aria-label="Their label"></div>
      </div>
      ${statRow('Time listened', c.totals.a.ms, c.totals.b.ms,
                fmtDuration(c.totals.a.ms), fmtDuration(c.totals.b.ms), 0)}
      ${statRow('Songs played', c.totals.a.plays, c.totals.b.plays,
                fmtInt(c.totals.a.plays), fmtInt(c.totals.b.plays), 1)}
      ${statRow('Different songs', c.totals.a.tracks, c.totals.b.tracks,
                fmtInt(c.totals.a.tracks), fmtInt(c.totals.b.tracks), 2)}
      ${statRow('Different artists', c.totals.a.artists, c.totals.b.artists,
                fmtInt(c.totals.a.artists), fmtInt(c.totals.b.artists), 3)}
    </div>

    <div class="panel">
      <h2>How much you overlap</h2>
      <p class="muted small" style="max-width:58ch">Two numbers, not one score. Overlap is
        almost never mutual, and that asymmetry is the interesting part.</p>
      ${statRow('of listening spent on artists the other also plays',
                c.overlapShare.a, c.overlapShare.b, pct(c.overlapShare.a), pct(c.overlapShare.b), 0)}
      <p class="muted small" style="margin-top:12px">${fmtInt(c.counts.artists)} artists and
        ${fmtInt(c.counts.tracks)} songs in common.</p>
    </div>

    <div class="panel">
      ${section('sa', 'Artists you share', '', c.sharedArtists, (x, i) => rankRow(x, i, ''))}
      ${section('st', 'Songs you share', '', c.sharedTracks, (x, i) => rankRow(x, i, x.artist))}
      ${section('sd', 'Where you disagree most', 'Both of you play these, but rank them very differently.',
                c.biggestDisagreements, (x, i) => rankRow(x, i, ''))}
    </div>`;

  $('cmp-out').querySelectorAll('[data-more]').forEach((b) => {
    b.onclick = () => {
      const rest = $(`${b.dataset.more}-rest`);
      if (!rest) return;
      rest.hidden = !rest.hidden;
      b.textContent = rest.hidden ? b.textContent.replace('Show fewer', 'Show all') : 'Show fewer';
    };
  });

  const relabel = () => {
    labels = { a: $('cmp-a-name').value || 'You', b: $('cmp-b-name').value || 'Them' };
    renderCompare(A);
  };
  $('cmp-a-name').onchange = relabel;
  $('cmp-b-name').onchange = relabel;
}

/* ══════════ team presence ══════════ */
/* Floating on desktop, inline in the footer on phones — a chip hovering over
   a phone screen covers the content it is meant to sit beside. */
mountPresence($('presence-moses'), TEAM.moses);
mountPresence($('presence-tim'), TEAM.timileyin);
mountPresence($('inline-moses'), TEAM.moses);
mountPresence($('inline-tim'), TEAM.timileyin);

/* ══════════ adblock ══════════ */
async function maybeAdblock() {
  if (adblock.alreadyDismissed()) return;
  const res = await adblock.detect();
  if (res.blocking) setTimeout(() => adblock.showPrompt(), 1400);
}
