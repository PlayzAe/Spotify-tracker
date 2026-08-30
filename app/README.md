# Longplay — app

The whole product. A client-side parser for the Spotify export and the interface
on top of it.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 277 tests, ~1s
npm run build    # static output in dist/
```

Node 20.19+. Three dependencies: `vite`, `vitest`, and `fflate` for streaming
unzip. **Nothing at runtime** — the built output is HTML, CSS, JS and two fonts.
It will host on anything that serves static files.

---

## Measured on a real export

| | |
|---|---|
| 160,634 records (11.3 MB zip → 123 MB JSON) | **~1.6 s** |
| 616,988 records (476 MB) | **5.1 s**, 43 MB heap |
| Resident store | **24 bytes per play** |
| Any range or filter query | **13–75 ms** |
| Album art hit rate | **98%** (120 albums sampled) |
| Network requests from the engine | **zero** |

---

## Layout

```
src/
  engine/            ← the load-bearing part. No DOM, no framework, no network.
    normalize.js       field rules — read this first
    store.js           ingest + query (columnar, re-sliceable)
    zip.js             archive classification + streaming
    compare.js         two-store overlap
    countries.js       ISO codes → names and flags
    worker.js          thin postMessage wrapper
  ui/                ← presentation. Replaceable.
    router.js          hash routing + the scroll rail
    charts.js          clock wedges, donuts, bars, heat levels
    covers.js          Deezer artwork + deterministic fallback
    presence.js        Discord/GitHub team widgets (Lanyard)
    statdetail.js      the panel a stat tile opens
    anim.js            scroll reveals, count-ups
    skeleton.js        loading placeholders
    links.js           outbound search links
    adblock.js         detection + prompt
  main.js            wiring
  style.css          the design system
test/                277 tests
public/fonts/        Archivo + Schibsted Grotesk, self-hosted
```

`src/engine/` talks only over `postMessage` and has no DOM dependency — drop it
into React, Svelte, Vue, or anything else without changing a line.

**The engine never makes a network request, and must not start.** Artwork lookups
live in `ui/covers.js` on purpose: that separation is what lets anyone verify the
privacy claim by opening the Network tab.

---

## The contract

```js
worker.postMessage({ cmd: 'ingest', files: [{ name, buffer }] }, [buffer]);

worker.postMessage({ cmd: 'query', token, opts: {
  from: '2026-01-01',   to: '2026-08-18',   // or null; date-only = local day
  platform: 1,          // index into PLATFORMS, or null
  shuffle: null,        // true | false | null
  offline: null,        // true | false | null
  content: 'music',     // 'music' | 'podcast' | null
  excludeIncognito: true,
  sort: 'time',         // time | plays | skips | skipRate | steady | weeks
                        // | first | last | alpha
  minPlays: 0, limit: 25, offset: 0,
}});
```

Back: `progress`, `done` (summary + first result), `queried`, `failed`.

`failed.reason` is one of `WRONG_EXPORT`, `README_ONLY`, `NO_HISTORY`,
`EMPTY_HISTORY`, `NOT_AN_ARCHIVE`, `PARSE_ERROR`. Each gets its own screen and its
own fix instruction. `WRONG_EXPORT` is the highest-value message in the product —
every competitor handles it badly, and getting it wrong costs the user days.

Queries carry a `token`; results with a stale token are discarded so fast clicking
cannot render an out-of-order answer.

---

## Rules that must not be quietly "simplified"

Each prevents an answer that *looks* right. All are covered by tests.

1. **`ts` is the END of a stream.** Undocumented by Spotify; proven on 137,153
   autoplay pairs (83.5% vs 0.3%). A track finishing at 00:04 belongs to the
   previous day.
2. **Derive skips from `reason_end`.** The raw `skipped` field is dead before
   2022-10 and reports 0.00% — reading as "you never skip anything" rather than
   as a bug.
3. **Group by normalized track key, not URI.** One recording has several URIs.
4. **Normalize title and artist SEPARATELY.** Running the regex over the joined
   `title|artist` string let `- \d{4} remaster.*$` eat the delimiter and the
   artist, silently merging different artists who share a song title.
5. **Do not strip `remix` or `edit`.** That merges genuinely different recordings.
6. **Match zip entries on basename.** They are nested two directories deep.
7. **Every millisecond accumulator is a `Float64Array`.** `Int32Array` overflows
   at ~596 hours and silently deleted Windows from the device chart.
8. **Parse range bounds in local time.** `Date.parse('2025-12-31')` is UTC but
   `Date.parse('2025-12-31T23:59:59')` is local; mixing them leaves gaps at every
   edge.
9. **Ignore `offline_timestamp`.** Populated regardless of `offline`; unit changed
   mid-history.
10. **Deduplicate on ingest.** 84 exact duplicates existed inside one real export.

---

## The design system

`src/style.css` is the single source. Tokens at the top, then base, then
components in the order they appear on screen.

- **Palette is pine.** `--pine: #156152`. Chosen against three things: Spotify's
  own green (looking official undermines the pitch), the cream/serif/terracotta
  cluster, and near-black with one acid pop. Neutrals carry a slight green bias so
  they read as chosen rather than inherited.
- **Type is Archivo for display, Schibsted Grotesk for body.** Both self-hosted
  and subset. Do not swap in a webfont from a CDN — it breaks the zero-network
  claim and the tests will catch it.
- **Three theme states, not two.** Bare `:root` is the full light palette;
  `prefers-color-scheme: dark` is guarded with `:root:not([data-theme="light"])`
  so an explicit choice wins; `:root[data-theme="dark"]` handles the toggle.
  Never define a colour only inside a media or `[data-theme]` block.
- **Only `transform` and `opacity` animate.** Both are compositor properties.
  Anything animating `width`, `height`, `top` or `left` is a bug.
- **Entrance animations are off under 700px** on purpose. They cost scroll
  smoothness on the devices least able to afford it.

---

## What the tests cover

277 tests across 11 files. Written to fail loudly rather than to pass easily —
four real bugs were found by writing them, and several more by driving the UI.

**Engine** (`normalize`, `store`, `zip`, `ranges`, `features`)

- Files — nested paths, Windows separators, case, video/readme/Account-Data detection
- Skips — explicit flag, derived reasons, non-skip reasons, missing fields
- Track keys — release variants merge; remixes, edits, sped-up and slowed do not;
  different artists never merge; nulls never throw
- Platforms — both Spotify string formats, tablet vs phone, `OS X` spacing
- Records — nulls, wrong types, negative/NaN durations, empty objects, arrays
- Histories unlike ours — accounts starting in 2008, single-day, empty, midnight
  and year boundaries
- Ranges — local-day semantics, open ends, inverted ranges, invalid dates, and a
  partitioning test proving no play is ever lost or double-counted
- Sorting — all nine modes, minimum thresholds, limits, offsets
- Numeric safety — totals past Int32 in global and per-entity accumulators
- Archives — real zips, corrupt, truncated, multi-zip merges, non-archives,
  JSON-object-instead-of-array, empty uploads
- Determinism — identical input yields byte-identical output

**Interface** (`ui`, `router`, `frontend`, `covers`, `presence`, `guidelines`)

- Chart maths — wedge scaling, donut slices, bar shares, clamping edge cases
- Routing — every route, unknown hashes, nav highlighting
- Covers — deterministic tiles, hostile input, emoji, artwork-off behaviour
- Presence — payload parsing, missing fields, XSS from the API, no key in the DOM
- `guidelines.test.js` reads the shipped CSS and HTML as text. Every rule in it was
  a real defect: `transition: all`, layout-property transitions, sub-16px inputs,
  unthemed browser surfaces, duplicate attributes, missing skip link, convergent
  fonts, straight quotes. They are guardrails against silent regressions, not
  style policing — if one fires on a change you meant, change the test.

### Not covered

Stated rather than implied:

- **Mobile memory.** Untested on a real device. This is where a 150 MB export will
  actually strain.
- **Real Deezer responses.** Match rate measured live (98%) but not in the suite —
  tests must not depend on a third-party network.
- **Ad-blocker detection in a real blocked browser.** Verified only for the
  negative case (no false positive). Someone with uBlock or Brave Shields up
  should confirm the positive.
- **Accessibility audit.** Focus states, landmarks, skip link and live regions are
  present; no screen-reader pass has been run.
- **Motion.** Hover and transition timing was verified by state, not by eye — the
  headless browser used during development runs as a hidden tab, where CSS
  transitions are frozen.

---

## Behaviour the UI pins down

- **Range controls are derived from the data.** A 2008 account gets 2008. Nothing
  hardcoded.
- **Filters compose** — year × device × shuffle/offline × content type, at once.
- **Nine sort modes** across songs, artists and albums. `steady` and `weeks` are
  the differentiator: they stop a two-week obsession outranking a years-long
  habit, which is the single loudest complaint about Wrapped.
- **Artwork is off-switchable**, cached in `localStorage`, throttled to ~8
  requests/second, and only looked up for rows on screen. Misses fall back to a
  deterministic generated tile, so the same track always looks the same.
- **The data-quality panel is written for a normal person** — "Spotify listed these
  twice, so we counted them once", not "duplicates dropped: 84".
- **Ad-block detection requires two agreeing signals** and treats every ambiguous
  state as "not blocking". A false accusation is worse than a miss. **No ads are
  loaded in this build** — detection only, nothing is gated on the answer.
- **Presence widgets** use Lanyard's public read endpoint. No key, and a test
  asserts none ever reaches the DOM.
