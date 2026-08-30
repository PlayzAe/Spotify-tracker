# Frontend PRD — Spotify Stats (Emberfig)

**Version:** 1.0 · **Date:** 2026-08-17 · **Owner:** Freddy (frontend)
**Parent:** [Product PRD](00-product-prd.md) · **Design guidance:** [../brief/](../brief/)

Requirements are numbered `FE-n` and written to be testable. **Visual and interaction
design is not specified here** — that's Freddy's, informed by the design brief.

---

## 1. Scope

Everything the user sees and touches: upload flow, states, stats presentation, freshness
system, share export, ads/consent, FAQ, accessibility.

Parsing and aggregation are specified in the [Data Engine PRD](02-data-engine-prd.md).
The frontend consumes its output; it does not parse.

---

## 2. Upload and onboarding

| # | Requirement | Priority |
|---|---|---|
| FE-1 | Accept `.zip` as downloaded from Spotify — no unzipping, renaming, or file-hunting required | P0 |
| FE-2 | Accept multiple zips in one session (Spotify splits large exports) | P0 |
| FE-3 | Accept loose `.json` files as an alternative input | P1 |
| FE-4 | Support drag-and-drop **and** a keyboard-accessible file picker | P0 |
| FE-5 | Display privacy reassurance at the drop zone itself, not only in the footer | P0 |
| FE-6 | Landing page must convey: what it is, free, no login, data stays local — within ~10s of reading | P0 |
| FE-7 | Provide export-request instructions that **explicitly distinguish "Extended streaming history" from "Account data"**, with a visual of the correct option | P0 |
| FE-8 | State realistic delivery expectations (hours to a few days; 30 days is Spotify's stated max) | P0 |
| FE-9 | No email capture, no signup, no cookie wall before content | P0 |

**FE-7 is the highest-leverage requirement in this document.** Choosing the wrong export
costs the user days and is the top competitor failure.

---

## 3. Processing states

| # | Requirement | Priority |
|---|---|---|
| FE-10 | Show **real** progress during parsing — files processed and plays counted, not a spinner | P0 |
| FE-11 | UI must remain responsive throughout parsing (no main-thread blocking) | P0 |
| FE-12 | Warn before parsing if file size likely exceeds device capability | P1 |

### FE-13 — All states must be designed and handled (P0)

Each requires a **specific, actionable** message. Generic errors are a defect.

| State | Must convey |
|---|---|
| Empty / first landing | What this is, free, no login, private |
| **Wrong export** | "This looks like Account Data, not Extended Streaming History" + how to fix. **Highest value** |
| ReadMe-only zip | Streaming history wasn't included in the request; link to instructions |
| Wrong file type | What we accept |
| Parsing | Real progress |
| Partial success | Show results anyway; state what was skipped and why |
| Empty history | Distinguish new account from wrong export |
| Too large / OOM | Suggest desktop or chunked processing — never just crash |
| Sparse data | Name which stats are hidden and why |
| Stale export | Note that a fresh export shows recent listening |
| Success | Results + snapshot date |

---

## 4. Results presentation

| # | Requirement | Priority |
|---|---|---|
| FE-14 | **Snapshot date persistently visible** on results — not a tooltip or footer | P0 |
| FE-15 | Never imply live data ("updating…", "last synced", relative timestamps) | P0 |
| FE-16 | No stat gated, blurred, teased, or locked behind anything | P0 |
| FE-17 | Core stats always reachable even when not featured by the rotation | P0 |
| FE-18 | Stats needing more data must hide themselves, not display noise | P1 |
| FE-19 | Charts must have text alternatives conveying the same numbers | P0 |
| FE-20 | Use tabular figures for all numeric displays | P1 |

### Stat coverage (P0 unless noted)

Core: total plays · total listening time · top tracks by play count · **top tracks by
listening time** (distinct from play count) · top artists · top albums · most skipped
(derived) · first-played/discovery dates

Time: by hour · by weekday · monthly · yearly · longest streak · year-over-year (P1)

Behavioural — the export-only differentiators: platform · shuffle vs deliberate · offline ·
`reason_end` breakdown · `reason_start` (P1) · country (P1) · podcast vs music split

---

## 5. Cover art

| # | Requirement | Priority |
|---|---|---|
| FE-21 | Fetch covers from Deezer public API via JSONP — no proxy, no key | P1 |
| FE-22 | Only look up albums **currently displayed**; never the full library | P0 |
| FE-23 | Send artist/album name only — never play counts, timestamps, or rankings | P0 |
| FE-24 | Throttle to stay within ~50 req / 5s; cache results in `localStorage` | P0 |
| FE-25 | Hotlink Deezer's CDN — never download, store, or re-host images | P0 |
| FE-26 | Provide a user-facing **off switch** for artwork | P0 |
| FE-27 | Disclose the lookup precisely in privacy copy and FAQ | P0 |
| FE-28 | Design a deterministic generative fallback for misses — same track always renders identically | P0 |
| FE-29 | Lazy-load on scroll; degrade silently if Deezer is unreachable | P1 |

**FE-28 is not an edge case.** Local files, obscure releases, podcasts, and users who
disable artwork are all normal.

---

## 6. Freshness system

| # | Requirement | Priority |
|---|---|---|
| FE-30 | Results are selected from a larger deck than is shown at once | P1 |
| FE-31 | Selection seeded by `hash(dataset + date)` — **stable within a day**, varies across days | P1 |
| FE-32 | Never reshuffle within a session (refresh must not change the view) | P0 |
| FE-33 | Conditional cards appear **only when their pattern genuinely exists** | P0 |
| FE-34 | Never fabricate or force a pattern to fill a slot | P0 |
| FE-35 | Sparse histories still produce a coherent experience, not empty slots | P1 |
| FE-36 | Support multiple framings of the same statistic | P2 |
| FE-37 | December: full year-in-review mode | P2 |

Minimum viable deck at launch: ~15–20 cards with strong conditional rules. See
[../brief/10-freshness-system.md](../brief/10-freshness-system.md).

---

## 7. Share export

| # | Requirement | Priority |
|---|---|---|
| FE-38 | Generate a shareable image client-side (canvas) and offer download | P0 |
| FE-39 | No upload, no hosting, no server involvement | P0 |
| FE-40 | Exclude incognito-mode plays by default | P0 |
| FE-41 | Exclude location data by default | P1 |
| FE-42 | No ads in or adjacent to the share image | P0 |
| FE-43 | Reflect the current rotation so shares vary | P2 |

This is the only growth mechanism — no login, no email list, no referrals.

---

## 8. Ads, consent, adblock

| # | Requirement | Priority |
|---|---|---|
| FE-44 | Reserve fixed ad dimensions — no layout shift on load | P0 |
| FE-45 | Label ads clearly | P0 |
| FE-46 | Max one ad unit per viewport | P0 |
| FE-47 | **No ads between upload and results**, inside the stats grid, or overlaying results | P0 |
| FE-48 | Consent banner (CMP) for EEA/UK; not a dark pattern | P0 |
| FE-49 | Full functionality when consent is declined | P0 |
| FE-50 | Adblock prompt: **after results**, once per session, dismissible (X, click-outside, Esc) | P0 |
| FE-51 | **Never gate any feature** on disabling an ad blocker | P0 |
| FE-52 | Adblock copy states ads are never based on their data, because we never receive it | P0 |

---

## 9. Content

| # | Requirement | Priority |
|---|---|---|
| FE-53 | FAQ covering privacy, data limits, why no live data, missing covers, wrong file | P0 |
| FE-54 | Privacy statement using specific claims, not vague reassurance | P0 |
| FE-55 | Never claim "no cookies" while ads run, or "contacts nobody" while art lookups run | P0 |
| FE-56 | Explain the no-API decision honestly where users will ask | P0 |
| FE-57 | Feedback path requesting one specific failure, per Emberfig's framing | P1 |
| FE-58 | State clearly: not affiliated with or endorsed by Spotify | P0 |

Draft copy: [../brief/06-honest-copy.md](../brief/06-honest-copy.md) and
[12-ads-and-adblock.md](../brief/12-ads-and-adblock.md).

---

## 10. Non-functional

| # | Requirement | Target | Priority |
|---|---|---|---|
| FE-59 | Interactive on mid-range mobile / 4G | <2s | P0 |
| FE-60 | Mobile-first responsive | 320px+ | P0 |
| FE-61 | Light and dark themes; respect `prefers-color-scheme` + manual toggle | — | P0 |
| FE-62 | Respect `prefers-reduced-motion` | — | P0 |
| FE-63 | WCAG AA contrast | 4.5:1 text, 3:1 UI | P0 |
| FE-64 | Full keyboard navigation with visible focus | — | P0 |
| FE-65 | Semantic HTML; correct heading order | — | P0 |
| FE-66 | Self-host fonts (no third-party font CDN) | — | P1 |
| FE-67 | No third-party scripts beyond ads + CMP | — | P0 |
| FE-68 | Function with a content blocker active | — | P0 |
| FE-69 | Never encode meaning in colour alone | — | P0 |

---

## 11. Acceptance criteria

- [ ] 150 MB export → results on mid-range Android without crash, UI responsive throughout
- [ ] Uploading Account Data (not Extended) → the specific guiding error
- [ ] Zip containing only a ReadMe → its own distinct error
- [ ] One malformed JSON among many → partial results, skip noted
- [ ] DevTools Network shows **no** request containing listening data
- [ ] Artwork off → no Deezer requests, fallback tiles render
- [ ] Refresh within a day → identical card selection
- [ ] Consent declined → everything still works
- [ ] Adblock active → prompt appears once, dismissible, nothing gated
- [ ] Keyboard-only journey completes upload → results → share
- [ ] Screen reader conveys top-stat numbers
- [ ] Snapshot date visible on results at all breakpoints
- [ ] Lighthouse a11y ≥95
