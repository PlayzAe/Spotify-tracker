# Data Engine & Platform PRD ("Backend")

**Version:** 1.0 · **Date:** 2026-08-17
**Parent:** [Product PRD](00-product-prd.md) · **Research:** [../research/spotify-platform/](../research/spotify-platform/)

---

## 0. Read this first — what "backend" means here

**This product has no server, no database, and no API.** A conventional backend PRD would
be a document about something that doesn't exist.

What *is* backend-shaped work, and what this document covers:

| Layer | What it is | Runs where |
|---|---|---|
| **A. Data engine** | Ingest → validate → parse → normalize → aggregate. Classic ETL | User's browser (Web Worker) |
| **B. Platform** | Hosting, deploy, headers, domain, monitoring | Static CDN |

Layer A is the real engineering. It's a pipeline over hundreds of thousands of records
with genuine data-quality problems — it just happens to execute client-side.

**If a server is ever proposed, it must be escalated as a scope change**, because it breaks
the $0 cost model, the privacy claim, and the unlimited-user property simultaneously.

Requirements numbered `DE-n` (data engine) and `PL-n` (platform).

---

## 1. Input contract

Source: Spotify Privacy → **Extended streaming history** (not "Account data").

| Property | Value |
|---|---|
| Container | `.zip`, sometimes split across several |
| Relevant files | `Streaming_History_Audio_*.json` |
| Ignore | Video, technical log, marquee, ReadMe files |
| Per-file size | ~12 MB |
| Total | Up to 150 MB+ / 200k+ records for a long history |

### Record schema

```json
{
  "ts": "2025-07-15T07:11:08Z",
  "platform": "android",
  "ms_played": 55229,
  "conn_country": "GB",
  "master_metadata_track_name": "Blinding Lights",
  "master_metadata_album_artist_name": "The Weeknd",
  "master_metadata_album_album_name": "After Hours",
  "spotify_track_uri": "spotify:track:0VjIjW4GlUZAMYd2vXMi3b",
  "episode_name": null,
  "episode_show_name": null,
  "spotify_episode_uri": null,
  "reason_start": "fwdbtn",
  "reason_end": "trackdone",
  "shuffle": false,
  "skipped": false,
  "offline": false,
  "offline_timestamp": null,
  "incognito_mode": false
}
```

**Absent:** track duration, genre, artwork, popularity. Consequences in §5.

---

## 2. Pipeline

```
ZIP ──▶ validate ──▶ stream-extract ──▶ parse ──▶ normalize ──▶ aggregate ──▶ view model
         (DE-1..4)     (DE-5..8)       (DE-9..12)  (DE-13..17)   (DE-18..22)
```

### Stage 1 — Validate (before any heavy work)

| # | Requirement | Priority |
|---|---|---|
| DE-1 | Verify the container is a readable zip (or json) | P0 |
| DE-2 | Detect **wrong export type** — Account Data vs Extended — and report distinctly | P0 |
| DE-3 | Detect a ReadMe-only zip and report distinctly | P0 |
| DE-4 | Estimate record volume and warn if it likely exceeds device capability | P1 |

DE-2 must fire **before** parsing, so the user isn't made to wait for a useless result.

### Stage 2 — Extract

| # | Requirement | Priority |
|---|---|---|
| DE-5 | Stream file-by-file; never decompress the whole archive into memory | P0 |
| DE-6 | Process only `Streaming_History_Audio_*.json` | P0 |
| DE-7 | Merge multiple zips into one dataset, deduplicating overlaps | P1 |
| DE-8 | Continue on a malformed file; record it and carry on | P0 |

### Stage 3 — Parse

| # | Requirement | Priority |
|---|---|---|
| DE-9 | Parse defensively — never throw on a missing or unexpected field | P0 |
| DE-10 | Skip and count unparseable records rather than failing the batch | P0 |
| DE-11 | **Log unrecognised field names** — early warning for format drift | P0 |
| DE-12 | Classify each record: music / podcast / local file | P0 |

DE-11 matters because the format **has already drifted** — `offline_timestamp` changed
units mid-history, and `skipped` was non-functional for years.

### Stage 4 — Normalize (the correctness stage)

This is where competitor products go wrong. Each rule below prevents a *silent* defect —
one that produces plausible but incorrect output.

| # | Requirement | Priority |
|---|---|---|
| DE-13 | **Derive skip status.** Do not trust the raw `skipped` field | P0 |
| DE-14 | **Compute a normalized track key** for grouping | P0 |
| DE-15 | Apply the 30,000 ms threshold for a counted play | P0 |
| DE-16 | Handle null track names (podcasts → `episode_name`; local files → skip or mark) | P0 |
| DE-17 | Ignore `offline_timestamp` entirely (unit changed mid-history) | P0 |

**DE-13 — skip derivation.** The raw field was unpopulated between 2015-04-13 and
2022-10-16. Filtering on it returns near-empty results for older history, presenting as
"you never skip anything" rather than as a bug.

```js
const isSkipped = r.skipped === true ||
  ['backbtn','unknown','endplay','fwdbtn'].includes(r.reason_end);
```

**DE-14 — track key.** The same recording carries different `spotify_track_uri` values
across single / album / reissue. Grouping by URI splits one song into several rows,
corrupting the headline "most replayed" statistic.

```js
key = `${title}|${artist}`.toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g,'')
  .replace(/\s*[\(\[].*?(remaster|remix|feat|version|edit).*?[\)\]]/gi,'')
  .replace(/\s*-\s*\d{4}\s*remaster.*$/i,'')
  .replace(/\s+/g,' ').trim();
```

⚠️ **Tune conservatively.** Over-merging combines genuinely different artists with similar
names — last.fm's documented failure. Under-merging is cosmetic; over-merging is wrong data.
Keep original strings for display; use the key only for grouping.

### Stage 5 — Aggregate

| # | Requirement | Priority |
|---|---|---|
| DE-18 | Build aggregates **incrementally** during parse; never retain all raw records | P0 |
| DE-19 | Compute the full stat set (§4) in a single pass where possible | P0 |
| DE-20 | Record dataset metadata: earliest ts, **latest ts (snapshot date)**, counts, skipped files | P0 |
| DE-21 | Emit a data-quality report (records parsed/skipped, unknown fields, ranges) | P1 |
| DE-22 | Flag stats lacking sufficient data rather than emitting noise | P1 |

DE-18 is the memory strategy: 200k records held as objects will exhaust mobile memory.
Aggregate and discard.

---

## 3. Output contract

The engine emits a **view model** — no raw records:

```
{
  meta:     { snapshotDate, earliest, latest, totalPlays, totalMs,
              filesParsed, filesSkipped, unknownFields[], quality{} },
  totals:   { plays, ms, distinctTracks, distinctArtists, days },
  tracks:   [ { key, title, artist, album, plays, ms, skips, firstPlayed, lastPlayed } ],
  artists:  [ { name, plays, ms, distinctTracks, firstPlayed } ],
  albums:   [ { key, title, artist, plays, ms } ],
  time:     { byHour[], byWeekday[], byMonth[], byYear[], streaks[] },
  behaviour:{ platforms{}, shuffle{}, offline{}, reasonEnd{}, reasonStart{}, countries{} },
  content:  { musicMs, podcastMs, localFileCount },
  flags:    { sparse, staleExport, partialParse }
}
```

`meta.snapshotDate` = `latest` — the measured boundary, never estimated. The frontend
displays it persistently (FE-14).

---

## 4. Statistics to compute

| Stat | Rule |
|---|---|
| Most replayed | Count by `trackKey`, plays ≥30s only |
| **Most listened** | `SUM(ms_played)` by `trackKey`, excluding derived skips |
| Most skipped | Derived skip rate by `trackKey`, min 5 plays |
| Top artists / albums | By ms and by count |
| First played | `MIN(ts)` per track — discovery dates |
| By hour / weekday | Local time |
| Monthly / yearly | Full lifetime |
| Longest streak | Consecutive days with ≥1 play |
| Platform / shuffle / offline / country | Distribution |
| `reason_end` / `reason_start` | Distribution |
| Podcast vs music | By ms |

**Not computable:** completion % (no duration), genres (deprecated), anything live.

---

## 5. Non-functional

| # | Requirement | Target | Priority |
|---|---|---|---|
| DE-23 | Run entirely in a **Web Worker** | — | P0 |
| DE-24 | Post real progress to the main thread | ≥1/s | P0 |
| DE-25 | Peak memory within mid-range mobile budget | 150 MB input | P0 |
| DE-26 | Parse throughput | 100k records <30s desktop | P1 |
| DE-27 | Deterministic — same input always yields identical output | — | P0 |
| DE-28 | **Zero network calls** from the engine | — | P0 |
| DE-29 | Parser layer decoupled from Spotify's field names | — | P2 |

DE-28 is a hard architectural boundary: the engine never fetches. Cover art is a
**frontend** concern (FE-21..29), deliberately separated so the engine stays provably
offline.

DE-29 keeps the door open for Apple Music / YouTube Music later.

---

## 6. Platform

| # | Requirement | Priority |
|---|---|---|
| PL-1 | Static hosting on a free tier (Cloudflare Pages or GitHub Pages) | P0 |
| PL-2 | **No server-side runtime**, no serverless functions, no database | P0 |
| PL-3 | No environment secrets (nothing requires them) | P0 |
| PL-4 | Custom domain over HTTPS | P0 |
| PL-5 | Strict `Content-Security-Policy` permitting only ads + CMP + Deezer | P0 |
| PL-6 | Security headers: HSTS, `X-Content-Type-Options`, `Referrer-Policy` | P1 |
| PL-7 | Analytics limited to cookieless, non-identifying (Cloudflare Web Analytics) | P0 |
| PL-8 | Deploy from git; preview deploys on branches | P1 |
| PL-9 | Long-cache static assets; content-hashed filenames | P1 |
| PL-10 | Uptime monitoring on a free tier | P2 |

### Cost model

| Item | Cost |
|---|---|
| Hosting (static, any traffic) | **$0** |
| Compute (user's browser) | **$0** |
| Storage / database | **$0** — none exists |
| Cover art (Deezer CDN hotlink) | **$0** |
| Analytics | **$0** |
| **Domain** | **only recurring cost** |

Serving 100,000 users costs the same as serving 5. That property is the direct result of
having no backend, and it is worth protecting against well-meaning feature requests.

---

## 7. Acceptance criteria

- [ ] 227k-record / 150 MB export parses without crash on mid-range Android
- [ ] Main thread stays responsive throughout (verified in performance profile)
- [ ] Account Data zip → wrong-export signal **before** full parse
- [ ] ReadMe-only zip → distinct signal
- [ ] Malformed file among valid ones → partial results + skip recorded
- [ ] Skip rates non-zero for pre-2022 history (proves DE-13)
- [ ] Same song across single/album/reissue → **one** leaderboard row (proves DE-14)
- [ ] Plays <30s excluded from play counts, retained for skip analysis
- [ ] Podcast records classified, not counted as music tracks
- [ ] Unknown fields surfaced in the quality report
- [ ] `snapshotDate` equals max `ts` in the dataset
- [ ] **Zero network requests originate from the worker**
- [ ] Identical input → byte-identical view model across runs
- [ ] Deployed site has no server-side runtime
