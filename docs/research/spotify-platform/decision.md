# Decision — build this, exactly

One page. What to build, what changed, and what to accept.

---

## Verdict: **BUILD IT** — as a personal tool for ≤5 people, at $0/month infrastructure.

The project is viable. Four assumptions in the original plan were wrong and are corrected
below. One of them — the sync cadence — would have produced an app that looked like it
worked while losing over 90% of the data.

---

## The five corrections that matter

| # | Original plan | Build this instead | Consequence if ignored |
|---|---|---|---|
| 1 | Poll every 14 days | **Poll hourly.** Recompute stats bi-weekly | ☠️ >90% of plays lost forever — silently |
| 2 | 25 users | **5 users.** Owner needs Spotify Premium | Design for a scope that doesn't exist |
| 3 | Refresh tokens never expire | **6-month expiry.** Store `authorized_at`, notify at day 165 | Every user silently breaks twice a year |
| 4 | `tracks` has energy/valence/tempo/popularity | **Delete those columns.** Keep `duration_ms` | Columns that can never be populated |
| 5 | `GROUP BY spotify_uri`, filter `skipped = true` | **Group by normalized `track_key`; derive skips from `reason_end`** | Headline stats wrong, but plausible-looking |

---

## Answers to the five questions the prompt set out to settle

**1 — Do I need to sign up for the API?**
Yes, free, ~5 minutes at developer.spotify.com/dashboard. You get a Client ID and Secret
for *your* backend. **New in 2026: the app owner must hold an active Spotify Premium
subscription or the app stops working.** That is the one unavoidable cost.

**2 — Can anyone sign in with a normal Spotify account?**
Only **5 accounts**, each added manually by email in Settings → User Management. Not 25 —
that changed in February 2026. Users can be free or Premium; only the *owner* needs
Premium. A non-allowlisted user may complete login but gets **403** on API calls, so build
that error message. There is no middle tier: Extended Quota needs a registered business and
250k MAU, and individuals haven't been accepted since May 2025.

**3 — How do I get Jan-to-today data?**
Hybrid, as planned — with the roles reversed:
- **Extended streaming history export** (not "Account data" — two different downloads on
  the same page) is the **primary** source. Arrives in hours to ~5 days typically; the
  "30 days" is the GDPR legal ceiling, not the norm. It has true `ms_played`.
- **Hourly API polling** fills forward from the export's measured boundary
  (`MAX(ts)`, not an estimate) and guarantees nothing is missed.
- **Re-import a fresh export periodically** to upgrade API rows with real durations — the
  API never tells you how long a track was played.

**4 — How do I avoid spamming Spotify?**
Never call Spotify on a page load; serve everything from your database. That original
insight was correct and matters more now, because since July 2026 quota is pooled across
your whole developer account. Hourly polling for 5 users is ~0.2 req/s — negligible.
Handle two distinct 429s: plain (honour `Retry-After`, retry) and `QUOTA_EXCEEDED`
(**abort, never retry**).

**5 — What does the app show?**
All computed from your database:
- Most replayed (play count, ≥30s streams only)
- Most listened (total ms, export-sourced rows)
- Most skipped (**derived** skip flag)
- Top artists by listening time
- Monthly breakdown · listening by hour · longest streak
- Completion rate — *labelled with coverage %*, since it needs durations
- **Saved-but-never-played** — the "most liked" cross the original spec promised but never
  specified. More interesting than a plain saved-tracks list.

---

## Build order

1. **Worker + D1 + schema** — `schema.sql` as written
2. **OAuth** — Auth Code + secret (not PKCE), `state` validated, tokens encrypted,
   `authorized_at` recorded
3. **Hourly ingest** — with `Retry-After` backoff and the `QUOTA_EXCEEDED` branch
4. **Zip import** — presigned direct-to-R2, stream-parse, derived skip flag, measured watermark
5. **Stats recompute** + read API
6. **Watchdog + re-auth notice** — do not skip; this is what prevents silent staleness

Steps 1–3 give a working incremental tracker. Step 4 backfills history.

---

## Accept these

- **5 users, permanently.** No engineering defeats a policy wall. The 25-Client-ID
  allowance is a gray area that Spotify pre-emptively neutralised by pooling quota — don't
  build on it.
- **No audio features, ever.** Deprecated Nov 2024, no replacement in 21 months.
- **Premium is a real cost.** $0 infrastructure, not $0 total.
- **Spotify's free API has contracted three times in 21 months, always with under a
  month's notice.** Assume it continues. The hedge is that every play in your database is
  permanently yours — which is the real reason to own the data, more than rate limiting.

**Judged as a personal tool for you and a handful of friends: fully viable, genuinely
free, buildable this week. Judged as a product: blocked by a wall that no architecture
climbs.** Build it as the former.
