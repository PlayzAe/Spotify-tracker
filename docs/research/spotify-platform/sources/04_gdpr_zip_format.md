# Source 04 — GDPR Extended Streaming History export

**Verdict: H3 PARTIALLY REFUTED. The export is the right primary source and arrives far
faster than the prompt feared — but it has four data-quality defects that will silently
corrupt three of the eight proposed statistics if the parser is written naively.**

---

## S4.1 — Which export to request (a distinction the prompt misses)

Spotify's Privacy page offers **two separate downloads**, requested independently:

| Download | Streaming history included | Arrival |
|---|---|---|
| **Account data** | ~30 days (some sources say ~1 year) | Days |
| **Extended streaming history** | **Account lifetime** | Hours to ~30 days |

> "The extended streaming history goes back to the day you created your account."

> "You need to submit them separately from the same Privacy Settings page."

**This matters operationally:** a user who requests the wrong one gets ~30 days of data
and a broken import. The onboarding flow must name the exact option and, defensively, the
parser should detect a short-window export and tell the user which button to press instead.

A commercial blog claiming extended history "covers only the past year" was **rejected**
during triangulation — it conflates the two products and is contradicted by a first-hand
export spanning 2014→2024 (S4.2) and by Spotify's own description.

---

## S4.2 — Field schema (first-hand primary source)

Source: Ortham, *"My Spotify extended streaming history data"* (2024-12-21) — a developer
who exported and parsed their own 227,024-record history. **Highest-value source in this
file**, because it documents behaviour Spotify does not.

Confirmed fields:

```
ts                                  string   ISO 8601 timestamp
platform                            string
ms_played                           number   milliseconds
conn_country                        string
ip_addr                             string
master_metadata_track_name          string
master_metadata_album_artist_name   string
master_metadata_album_album_name    string
spotify_track_uri                   string
episode_name                        string | null
episode_show_name                   string | null
spotify_episode_uri                 string | null
reason_start                        string
reason_end                          string
shuffle                             boolean
skipped                             boolean
offline                             boolean
offline_timestamp                   number | null
incognito_mode                      boolean
```

Corroborated by an independent 2025 export sample:

> `"ts": "2025-07-15T07:11:08Z", "platform": "android", "ms_played": 55229,
> "reason_end": "trackdone", "skipped": false, "offline": false, "incognito_mode": false`

Format and scale:

> "a zip archive of a directory of JSON files," each file capped at approximately **12 MB**

> 227,024 records totalling **155 MB of formatted JSON** (a ~10-year history)

**Note `duration_ms` is absent.** The export records how long you played, never how long
the track is. This is what breaks completion rate — see S6.4.

---

## S4.3 — Four data-quality defects (the important part)

All four from the same first-hand parse, and all four unmentioned in the original prompt.

### Defect 1 — `skipped` is unreliable for years at a time

> "No skips were recognised between 2015-04-13 and 2022-10-16."

The field is present but null/false across a multi-year span. **The prompt's MOST SKIPPED
query filters on `skipped = true` and would silently return near-empty results** for any
history overlapping that period.

Recommended derivation from the same source:

```
skipped OR reason_end IN ('backbtn', 'unknown', 'endplay', 'fwdbtn')
```

This must be computed at ingest into a derived column, not trusted from the raw field.

### Defect 2 — duplicate track URIs for the same recording

> "Identical recordings receive multiple URIs across different album releases, skewing
> per-track statistics."

A track on a single, an album, and a deluxe reissue carries **three different
`spotify_track_uri` values**. The prompt's MOST REPLAYED query does
`GROUP BY spotify_uri` — which splits one song into three rows, each with a third of the
true play count. **This corrupts the app's headline statistic.**

Fix: group on a normalised `(lower(track_name), lower(artist_name))` key for
user-facing leaderboards, retaining the URI for linking. Schema reflects this.

### Defect 3 — `offline_timestamp` unit change mid-history

> "The field contains values even when `offline: false`, representing over 23% of
> streaming time. Unit conversion required (switched from seconds to milliseconds
> mid-dataset)."

Do not use this field. It is not needed for any proposed statistic.

### Defect 4 — overlapping timestamps

> "Approximately 2.6% of total streaming duration shows unexplained overlaps between
> consecutive streams."

Consequence: `SUM(ms_played)` slightly overstates real listening time. Acceptable for a
personal stats app, but "total minutes listened" should not be presented as exact. Worth
one line of honesty in the UI.

---

## S4.4 — Delivery lag: the prompt's biggest overestimate

The original prompt's FAILURE 1 assumes the export "lags by 1–3 months" and treats a
multi-month coverage gap as the headline risk. **Evidence does not support this.**

> "The page says that the preparation time is 30 days, but I'm pretty sure that's because
> that's GDPR limit: in my case it took about **4 hours** to receive the email."
> — first-hand account

> "Usually 1–5 days"; "most of our users report receiving the email as soon as the next
> day" — independent guide

> "Spotify officially says 'up to 30 days'" — the legal maximum, not the typical case

**Triangulated conclusion:** the 30-day figure is the GDPR statutory ceiling. Real-world
delivery is **hours to ~5 days**, and the export runs approximately up to the request date.

Residual risk is a **small recency lag of days, not months** — the last few days of plays
may be absent, since the export is compiled rather than live. Some users have reported
larger gaps, and Spotify has acknowledged at least one historical compilation bug, so the
parser must not *assume* currency — it must **measure** it.

**Design response:** rather than assuming any particular lag, the ingest computes
`MAX(ts)` from the imported data and records it as the coverage boundary. The sync then
fills forward from that measured point. This is strictly better than designing around an
estimated lag, and it is self-correcting if Spotify's behaviour changes.

---

## S4.5 — The genuinely unavoidable gap

This is the real constraint, and it is **not** the export lag — it is the interaction
between the export boundary and the recently-played window.

First-party: `GET /me/player/recently-played`

> "The maximum number of items to return. Default: 20. Minimum: 1. Maximum: 50."

> `after`: "Returns all items after (but not including) this cursor position."
> `before`: "Returns all items before (but not including) this cursor position."

Community and independent corroboration:

> "This endpoint has only ever returned 50 items total. You can use the cursors to
> paginate within that limit but not outside of it."

> "once you play a 51st track, the oldest entry is pushed off the end and is gone from
> that list permanently, and there is no way to scroll further back"

> "It is a short convenience window, not a history archive, and Spotify designed it that
> way intentionally."

**Therefore:**

1. The prompt's Call 8+ plan — "paginate until you reach the timestamp of your last sync"
   — **cannot work**. There is nothing to paginate into.
2. **A 14-day polling interval is unsafe.** A user playing >50 tracks between syncs
   permanently loses the overflow. At a typical ~50–70 plays/day, a 14-day gap loses well
   over 90% of plays.

This is the most serious technical finding in the research, and it directly contradicts
the central premise of the original design. **The bi-weekly cadence must be rejected.**
See `synthesis.md` §3 and `sync_algorithm.md` for the corrected cadence.

---

## S4.6 — Answers to the prompt's open questions

| Question | Answer |
|---|---|
| Is `ms_played` always present? | Yes, as an integer, in all observed samples |
| Minimum play that "counts"? | **30,000 ms** — confirmed. Spotify's royalty threshold: "A Spotify stream is counted after a listener plays at least 30 seconds of a track" |
| Is `spotify_track_uri` always present? | **No** — null for podcast episodes (which use `spotify_episode_uri`) and for local files. Parser must handle null |
| Does `skipped` reliably indicate a skip? | **No** — see Defect 1 |
| Max zip size? | ~12 MB per JSON file; ~155 MB uncompressed for a 10-year history. A single-year import is far smaller — low tens of MB at most |
| Does the export allow computing completion rate? | **No, not alone** — `duration_ms` is absent. Requires API enrichment |
| Does `ms_played` cap at `duration_ms`? | Not directly evidenced; the 2.6% overlap anomaly suggests timing data is approximate. `[INSUFFICIENT EVIDENCE]` — clamp the ratio to 100% defensively |
