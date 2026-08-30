# Refresh targets — re-verify before building, and every 90 days

Spotify changed its free API terms **three times in 21 months** (Nov 2024, Feb 2026, Jul
2026), each with under a month's notice and none reversed. Treat every policy fact in this
research as perishable.

**Next scheduled review: 2026-11-14.**

---

## Tier 1 — verify before writing code (highest volatility)

| # | Claim to re-check | Source of truth | Breaks what if changed |
|---|---|---|---|
| 1 | Dev Mode = **5 users**; owner needs Premium | developer.spotify.com/documentation/web-api/concepts/quota-modes | Entire scope |
| 2 | `recently-played` still capped at **50, no pagination past it** | .../reference/get-recently-played | The hourly cadence — if a real history endpoint appears, revert to infrequent polling |
| 3 | Refresh token **6-month** expiry | developer.spotify.com/blog/2026-06-18-refresh-token-expiration | Re-auth logic, `authorized_at` |
| 4 | `/me`, `/me/player/recently-played`, `/me/top/*` **still available in Dev Mode** | .../tutorials/february-2026-migration-guide | Project viability — check this first |
| 5 | Postponed Feb-2026 endpoint changes for **existing** integrations still postponed | developer.spotify.com/blog + changelog | Could remove endpoints already assumed safe |

**Item 4 is the kill switch.** If a user-scoped endpoint is withdrawn, re-run the research
rather than patching around it.

---

## Tier 2 — verify quarterly

| # | Claim | Source |
|---|---|---|
| 6 | Extended Quota still gated at 250k MAU / business entity | .../concepts/quota-modes |
| 7 | 25 Client IDs per developer, quota pooled per account | developer.spotify.com/blog/2026-07-23-web-api-quota-updates |
| 8 | `QUOTA_EXCEEDED` reason field semantics unchanged | .../references/changes/ |
| 9 | GDPR export field schema stable; `Streaming_History_Audio_*.json` naming | Own re-export — **the only reliable check** |
| 10 | Audio-features still deprecated with no replacement | developer.spotify.com/blog |

**Item 9 has no documentation to check against** — the export is not an API contract.
The `import_batches.unknown_fields` column is the monitoring mechanism: if it starts
recording new keys, the format drifted. This has already happened once
(`offline_timestamp` changed units mid-history).

---

## Tier 3 — free-tier terms (verify before relying, then quarterly)

| # | Claim | Source |
|---|---|---|
| 11 | Workers free: 100K req/day, 3 cron triggers, 1-min minimum | developers.cloudflare.com/workers/platform/limits |
| 12 | D1 free: 5 GB, 5M reads/day, 100K writes/day | developers.cloudflare.com/d1/platform/limits |
| 13 | R2 free tier storage allowance | developers.cloudflare.com/r2/pricing |
| 14 | Neon free: scale-to-zero, stays reachable (fallback path) | neon.tech/pricing |
| 15 | Supabase free still pauses at 7 days idle (if that path is chosen) | supabase.com/pricing |

Free tiers have been withdrawn without warning before — PlanetScale removed its free tier
in April 2024, and Turso deprecated scale-to-zero for new signups in early 2025. Both were
cited as viable in the original prompt. **Any free-tier figure older than 90 days should be
assumed stale.**

---

## Open items marked [INSUFFICIENT EVIDENCE] — resolve if they become load-bearing

| # | Question | Why unresolved | How to settle it |
|---|---|---|---|
| A | Numeric rate-limit thresholds | Spotify publishes none; community estimates unreliable | Don't. Design to `Retry-After`, never to a number |
| B | Can an allowlist user be **removed** and the slot reused? | Add path documented; removal path is not | Test empirically in the dashboard |
| C | Is the 5-user cap per Client ID or per developer account post-July-2026? | Feb wording says per Client ID; July quota pooling muddies it | Assume conservative (per account); don't build on the gap either way |
| D | Does Spotify's OAuth callback have a timeout? | No first-party documentation found | Moot on a no-cold-start platform |
| E | Can `ms_played` exceed `duration_ms`? | Not directly evidenced; 2.6% timestamp overlap suggests approximate timing | Clamp completion ratio to 100% |
| F | GitHub Actions 60-day auto-disable on **private** repos? | GitHub's wording says "public"; reports conflict | Avoided in the recommendation |

---

## How to re-run this research

The six work-streams and their stop criteria are in [plan.md](plan.md). The fastest
meaningful check is Tier 1 items 1–4 against first-party docs only — roughly 15 minutes,
and it catches any change that would invalidate the build.
