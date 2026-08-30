# Source 06 — Endpoint deprecations (the finding the original prompt missed entirely)

**Verdict: H5 PARTIALLY REFUTED. The app's core user-scoped endpoints survive, but the
metadata-enrichment half of the proposed schema is dead.**

This file exists because the original prompt assumed a 2024-era API surface. It planned a
`tracks` table with `energy`, `danceability`, `valence`, `tempo`, and `popularity`. **Every
one of those columns is unobtainable for a new app.**

---

## S6.1 — The November 27, 2024 deprecation

Sources: Spotify developer blog (Nov 2024); Music Ally trade press (2024-11-28);
sustained community reporting 2024–2026.

Endpoints removed for apps without pre-existing extended access:

- `GET /audio-features/{id}` and `/audio-features?ids=`
- `GET /audio-analysis/{id}`
- `GET /recommendations`
- `GET /artists/{id}/related-artists`
- `GET /browse/featured-playlists`
- `GET /browse/categories/{id}/playlists`
- 30-second `preview_url` values

Corroborated finding on eligibility:

> "Only apps that had a (pending) quota extension before November 27, 2024 can still use
> it. New apps got 403 the same day."

Status as of this research:

> "Eighteen months after Spotify deprecated audio_features and audio_analysis, there's
> still no official replacement. There's no waitlist, no path forward, and no public
> statement that this will change."

**Consequence:** any new app receives `403 Forbidden` on these endpoints. There is no
application process. This is permanent for practical planning purposes.

---

## S6.2 — The February 2026 Development Mode endpoint removals

URL: https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
First-party migration guide.

### Removed — batch fetches (entire class)

> `GET /tracks`, `/albums`, `/artists`, `/episodes`, `/shows`, `/audiobooks`, `/chapters`
> — all with the `ids` parameter

Guidance given:

> "Fetch items individually instead"

### Removed — browse and discovery

> `GET /browse/new-releases`, `GET /browse/categories`, `GET /browse/categories/{id}`,
> `GET /artists/{id}/top-tracks`

### Removed — other users' data

> `GET /users/{id}`, `GET /users/{id}/playlists`, `POST /users/{user_id}/playlists`,
> `GET /markets`

### Field removals from track objects

> "available_markets, external_ids, linked_from, popularity"

(`external_ids` was subsequently reverted in March 2026 per a footnote in the guide.)

### Search degraded

> `limit` maximum reduced from **50 → 10**; default from **20 → 5**

> "If your app relies on fetching more than 10 results per search request, you will need
> to paginate through results using the `offset` parameter."

### Library endpoints consolidated

Type-specific save/remove/follow endpoints replaced by generic
`PUT/DELETE /me/library` and `GET /me/library/contains` operating on Spotify URIs.
Playlist sub-resources renamed `/tracks` → `/items`.

---

## S6.3 — What survives (confirmed against the same first-party guide)

**All four endpoints this app depends on remain available in Development Mode:**

| Endpoint | Status |
|---|---|
| `GET /me` | ✅ Available (with field removals) |
| `GET /me/player/recently-played` | ✅ Available |
| `GET /me/top/tracks` | ✅ Available |
| `GET /me/top/artists` | ✅ Available |

Also surviving and useful:

| Endpoint | Status | Use here |
|---|---|---|
| `GET /tracks/{id}` (single) | ✅ Available | The **only** remaining way to obtain `duration_ms` for historical tracks |
| `GET /me/playlists` | ✅ Available | Not needed |
| `GET /me/library`, `/me/library/contains` | ✅ Available (new) | "Most liked" — see below |

**This is the finding that determines the project is viable at all.** Had
`recently-played` or `/me/top/*` been cut, the app would be dead. They were not.

---

## S6.4 — Consequences for the proposed schema and feature set

| Original prompt feature | Status | Resolution |
|---|---|---|
| `tracks.energy` / `danceability` / `valence` / `tempo` | ☠️ **Impossible** | Drop the columns. No replacement exists within Spotify's API |
| `tracks.popularity` | ☠️ **Impossible** | Field removed from track objects. Drop the column |
| Bulk-enrich N tracks with one call | ☠️ **Impossible** | Batch endpoint removed. Must fetch singly — this is a real cost driver |
| `tracks.duration_ms` | ⚠️ **Obtainable, expensively** | Free from `recently-played` responses going forward; requires one `GET /tracks/{id}` per distinct historical track otherwise |
| Completion rate (needs `duration_ms`) | ⚠️ **Degraded** | Computable only for tracks with a known duration. Must be presented as partial-coverage, not a whole-library stat |
| "Most liked" | ✅ **Achievable** | Via `GET /me/library` with `user-library-read`. The prompt listed the scope but never used it — this is the endpoint that makes the feature real |

### On the "most liked" dimension

The original prompt's DECISION 5 lists eight output stats, none of which is "most liked,"
despite the goal statement promising it and the scope string requesting
`user-library-read`. The library endpoints survive Feb 2026 in consolidated form, so the
feature is buildable — it just needs to be specified. Note that Spotify's library returns
*saved tracks with `added_at`*, not a play-derived metric, so "most liked" is a
**set membership + save date** dimension, not a ranking. Treat it as a filter to cross with
play data ("your most-played saved tracks", "saved tracks you never actually play") rather
than as a standalone leaderboard — that cross is more interesting than the raw list anyway.

---

## S6.5 — Forward-looking risk

The pattern across Nov 2024 → Feb 2026 → Jul 2026 is a **sustained, one-directional
contraction** of free-tier API surface: three restrictive changes in 21 months, none
reversed (excepting one field revert). Every one of them was announced with under a month
of lead time.

The design must therefore assume further contraction and be resilient to it. Concretely,
this argues for:

1. **Own your data.** Once a play is in your database it cannot be deprecated out from
   under you. This is the strongest argument for the local-database architecture — stronger
   than the rate-limit argument the original prompt used.
2. **Treat the GDPR export as the primary source, the API as the increment.** The export is
   a legal right under GDPR Article 15/20, not a product feature. It is far more durable
   than any endpoint.
3. **Degrade gracefully per-feature.** Each stat should independently detect missing inputs
   and disable itself rather than failing the sync.
