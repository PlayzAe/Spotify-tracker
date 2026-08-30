# Synthesis — Spotify Stats App Backend, Fully Free

**Date:** 2026-08-16 · **Scope:** backend only · **Every claim traces to `sources/`**

---

## The headline

**The project is viable at $0/month infrastructure cost — but four of the original
prompt's foundational assumptions are now factually wrong, and one of them would have
caused a faithful implementation to silently capture under 10% of the data while
appearing to work correctly.**

| # | Original prompt asserts | Reality (Aug 2026) | Impact |
|---|---|---|---|
| 1 | 25 users can authorize the app | **5 users**, and the owner needs Premium | Scope halves-and-then-some |
| 2 | Refresh tokens never expire | **Expire at 6 months**, non-extendable | Guaranteed biannual outage per user |
| 3 | Poll bi-weekly, paginate back to last sync | **50-item window, no pagination past it** | ☠️ >90% permanent data loss |
| 4 | Enrich tracks with audio-features | **Deprecated for all new apps since Nov 2024** | 5 schema columns unbuildable |

Items 1, 2 and 4 are policy changes that post-date the prompt's assumptions. **Item 3 was
never true** — it is a misreading of what `recently-played` is, and it is the one that
matters most.

---

## §1 — What the constraints actually are

**5 authenticated users. Owner must hold Spotify Premium. One developer account's quota,
shared across all its Client IDs.** (`03`)

Non-allowlisted users get a **403 on API calls** — OAuth login itself may still succeed
(`03`, S3.2). This is *better* than the prompt's assumption that the callback never fires:
you can catch the 403 and render a real error message rather than leaving users at a dead
end. Build that handler.

There is no middle tier. Extended Quota Mode requires a registered business, a launched
service, and **250k MAU**; individuals have not been accepted since May 2025. The
chicken-and-egg is unresolvable and widely complained about. **Treat 5 as permanent.**

The 25-Client-ID allowance (July 2026) does *not* unlock 125 users in any way worth
relying on — Spotify consolidated quota to the account level in the same release, and the
Developer Terms prohibit circumventing restrictions (`03`, S3.5). Marked
**[GRAY AREA — DO NOT BUILD ON]**.

## §2 — Rate limiting is a non-problem; quota is a new one

Rolling 30-second window, no published numbers, `Retry-After` on 429 (`01`). At 5 users the
design runs ~0.2 req/s — orders of magnitude of headroom even under the most pessimistic
community estimate. **H2 confirmed.**

The prompt's central architectural insight is correct and retained: **never call Spotify on
a user page load; serve everything from your own database.** It matters more now that quota
is account-wide.

One new branch is required: a 429 carrying `"reason": "QUOTA_EXCEEDED"` is **not**
retryable. Retrying burns a shared budget. Branch on it (`01`, S1.3).

## §3 — The cadence correction ☠️

**This is the most important finding in the research.**

`GET /me/player/recently-played` returns a maximum of 50 items and **cursors cannot page
beyond that window** (`04`, S4.5). It is a convenience buffer, not a history archive. Once
a 51st track plays, the oldest is gone from the API permanently.

The prompt's plan — *"Fetch until you reach the timestamp of your last sync. Usually 1-3
calls per 2 weeks"* — assumes an archive that does not exist. At ~50–70 plays/day, a
14-day interval loses **well over 90% of plays, unrecoverably**. No later GDPR export
recovers a play the app failed to capture in its window, because the app's own database is
the only place that history was being accumulated.

**Correction:**

| | Original | Corrected |
|---|---|---|
| Ingestion poll | every 14 days | **every 1–6 hours** (hourly recommended) |
| Justification | "safe for rate limits" | 50-item window forces it |
| Stats recompute | after each sync | **bi-weekly** (or on demand) |

Ingestion frequency and presentation frequency are **different concerns**. The bi-weekly
rhythm the prompt wants is a perfectly good *product* decision — keep it for stats
refresh. It is fatal as an *ingestion* decision. At hourly polling a user would need to
play >50 tracks in one hour to lose data; at 6-hourly, >50 in six hours. Hourly costs
~3,600 calls/month across all users — trivial.

## §4 — Hybrid data model, corrected

The prompt's two-source model (GDPR zip = history, API = ongoing) is **fundamentally
sound** and is retained. Three refinements:

1. **Measure the boundary, don't estimate it.** Compute `MAX(ts)` from the import and
   store it as the coverage watermark; fill forward from there. Self-correcting if
   Spotify's lag changes (`04`, S4.4).
2. **Export lag is days, not months.** The prompt's FAILURE 1 is overstated — real
   delivery is hours-to-days; 30 days is the GDPR statutory ceiling (`04`, S4.4).
3. **Request the right export.** "Extended streaming history" (account lifetime), not
   "Account data" (~30 days). Two separate requests on the same page; users get this wrong
   (`04`, S4.1).

## §5 — Data quality: four defects that corrupt three statistics

From a first-hand parse of a 227K-record export (`04`, S4.3):

| Defect | Corrupts | Fix |
|---|---|---|
| `skipped` unpopulated 2015-04→2022-10 | MOST SKIPPED → returns empty | Derive: `skipped OR reason_end IN ('backbtn','unknown','endplay','fwdbtn')` |
| Duplicate URIs per recording | **MOST REPLAYED** → counts fragmented across releases | Group on normalised `(track_name, artist_name)` |
| No `duration_ms` in export | COMPLETION RATE → no denominator | Capture from `recently-played`; backfill via `GET /tracks/{id}` |
| 2.6% timestamp overlap | Total-minutes slightly inflated | Accept; don't present as exact |

All three corrupted statistics fail **silently and plausibly**. That is the danger: a
fragmented MOST REPLAYED still returns a ranked list of real songs. Nothing looks broken.

Also confirmed: **30,000 ms is the threshold for a counted stream** (Spotify's own royalty
rule) — the prompt's guess was right. Use it to separate real plays from skips.

## §6 — The endpoint surface (`06`)

**Survives:** `GET /me`, `/me/player/recently-played`, `/me/top/tracks`, `/me/top/artists`,
`GET /tracks/{id}` (single), `/me/library`. **The app is buildable.**

**Gone:** all audio-features/audio-analysis, recommendations, related-artists, all batch
`?ids=` fetches, browse endpoints, and the `popularity` field. Search `limit` cut 50→10.

Net schema effect: **drop `energy`, `danceability`, `valence`, `tempo`, `popularity`.**
Keep `duration_ms`. Enrichment is now one call per track — a real cost that argues for
lazy, low-priority backfill rather than eager enrichment.

**Bonus:** `user-library-read` + `/me/library` makes "most liked" buildable — a dimension
the prompt's goal statement promises and its output spec then forgets. The interesting
form is the *cross* with play data ("saved but never played") rather than a raw list.

## §7 — Stack (`05`)

Recommended: **Cloudflare Workers + D1 + R2 + Workers Cron Triggers.** All free, all one
platform.

This substitutes for the prompt's Render + Supabase + cron-job.org stack, which works but
carries two avoidable failure modes: Render free spins down after 15 min (~60s cold start,
bad for OAuth) and Supabase free pauses after 7 days idle. The prompt catches both and
mitigates with keepalives. **Cloudflare deletes both by construction** — no cold start, no
idle suspension — and Workers Cron supports 1-minute intervals free, which the corrected
cadence now requires.

Also corrected: Render's own cron product is **not free** ($1/mo); Vercel Hobby cron is
**once-daily only** (insufficient post-correction); PlanetScale **removed its free tier**;
Turso's cited limits reflect a superseded plan. GitHub Actions **auto-disables scheduled
workflows after 60 days of repo inactivity** — a silent trap for a finished project.

Storage is never binding: ~23–46 MB/year for 5 users against a 5 GB free allowance.

If Postgres is preferred (nicer SQL for streaks and `FILTER` aggregates), swap D1 → **Neon**
(scale-to-zero, stays reachable) and keep Workers. Schema ships in both dialects.

## §8 — Token lifecycle (`02`)

Access tokens: 1 hour, unchanged. **Refresh tokens: 6 months from original authorization,
non-extendable by refreshing, and they carry no readable issue date** — so the backend must
record `authorized_at` itself. Expiry returns `400` + `invalid_grant` (not the `401` the
prompt expects).

**Consequence:** an unattended cron has a hard 6-month life per user. Notify at ~day 165,
proactively. Reactive detection means the user finds out via stale data.

Also corrected: PKCE is for clients that *cannot* hold a secret. A confidential server-side
backend should use standard Authorization Code flow with the client secret. Adding PKCE
isn't harmful but solves a problem this architecture doesn't have — the prompt's `state`
validation and encrypted-at-rest storage are the protections that actually carry weight.

---

## Hypothesis verdicts

| | Verdict | Note |
|---|---|---|
| **H1** — zero-cost stack sufficient | **CONFIRMED** | Different stack than proposed; storage never close to binding |
| **H2** — bi-weekly polling within rate limits | **CONFIRMED** | True but irrelevant — bi-weekly fails for a different reason (§3) |
| **H3** — export sufficient to reconstruct Jan→today | **PARTIALLY REFUTED** | Sufficient for most stats after defect handling; completion rate needs API |
| **H4** — 25-user cap workable via allowlist | **REFUTED AS STATED** | Cap is 5; mechanism right, numbers and rules all changed |
| **H5** — required endpoints still exist | **PARTIALLY REFUTED** | Core survives; enrichment layer dead |
| **H6** — tokens persist indefinitely | **REFUTED** | 6-month expiry |

## Marked [INSUFFICIENT EVIDENCE]

Stated explicitly rather than papered over:

- **Numeric rate-limit thresholds.** No reliable triangulated figure exists. Design to
  `Retry-After`, never to a number.
- **Allowlist removal process.** Adding is documented; removing is not. Whether a freed
  slot is reusable is unconfirmed.
- **Whether 5 users is per Client ID or per developer account** after July 2026. Feb's
  wording says per Client ID; July's quota consolidation muddies it. Assume the
  conservative reading.
- **Spotify OAuth callback timeout.** No first-party documentation found. Moot on a
  no-cold-start platform.
- **Whether `ms_played` can exceed `duration_ms`.** Clamp completion ratio to 100%
  defensively.
- **GitHub Actions 60-day auto-disable on private repos.** GitHub's wording says "public";
  reports conflict. Avoided in the recommendation regardless.
