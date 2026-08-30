# Source 07 — Adversarial pass

Mandatory under cs-deep-research for a medium/deep investigation. Each of the prompt's six
stated failure modes is re-graded against evidence, then failures the prompt did not
anticipate are added. Steel-manned throughout — the goal is to find what kills this
project, not to reassure.

---

## Part 1 — Re-grading the prompt's six failure modes

### FAILURE 1 — "The GDPR zip file lags by 3 months" → **OVERSTATED**

Evidence (`04`, S4.4) puts real delivery at hours-to-days, with the 30-day figure being
the GDPR statutory ceiling rather than the typical case. The feared multi-month hole does
not materialise in the reported data.

**Downgraded to: minor recency lag of days.** The mitigation is better than the prompt's
("document the gap to the user"): *measure* the boundary via `MAX(ts)` at import and fill
forward from the measured point. Self-correcting, no estimate required.

### FAILURE 2 — "Render cold starts break the OAuth callback" → **VALID, NOW ELIMINATED**

The concern is real and well-reasoned — Render free spins down after 15 min with ~60s
spin-up. The prompt's own mitigation (move auth to an instant-start platform) is correct.

**Resolution: adopt Cloudflare Workers for everything.** No cold start exists, so the
failure mode is deleted rather than mitigated.

One unverifiable sub-claim: the prompt asks whether Spotify's callback has a timeout. No
first-party documentation of a callback timeout was found. **`[INSUFFICIENT EVIDENCE]`** —
but moot on a platform with no cold start. Note the real risk was always the *user*
abandoning a 60-second redirect, not Spotify timing out.

### FAILURE 3 — "Refresh token revoked by the user" → **VALID, AND FAR WORSE THAN STATED**

The prompt anticipates user-initiated revocation. Correct, but it misses that **all
refresh tokens now expire after 6 months regardless of user action** (`02`, S2.1).

This converts a rare, user-triggered edge case into a **guaranteed scheduled outage for
every user, twice a year**. The prompt's mitigation (detect 401 → mark needs-reauth →
notify) is the right shape but reactive; it discovers the problem only after the sync has
already failed.

**Upgraded mitigation:** store `authorized_at`, compute the deadline, and notify
*proactively* at ~day 165 — before the break, not after. Also note the correct error is
`400` + `invalid_grant` on the token endpoint, not the `401` the prompt expects.

### FAILURE 4 — "Spotify changes the GDPR export format" → **VALID, AND ALREADY HAPPENING**

The prompt treats this as hypothetical. It is not: the `offline_timestamp` unit changed
from seconds to milliseconds mid-history, and `skipped` was effectively non-functional
for a seven-year span (`04`, S4.3). **The format has already drifted within existing
exports.**

The prompt's mitigation (defensive parsing, log unknown fields) is correct and should be
strengthened: also **validate on ingest** — assert expected field presence, record a
per-import quality report, and surface a coverage/confidence figure to the user rather
than silently ingesting garbage.

### FAILURE 5 — "Multiple apps to bypass the cap" → **VALID, AND SHARPENED**

The prompt asks whether policy documents this. Findings (`03`, S3.5): Spotify raised
Client IDs 1 → 25 in July 2026 **while simultaneously** consolidating quota to the
developer-account level — pairing that reads as pre-emptively closing exactly this path.
Developer Terms prohibit circumventing restrictions.

**Verdict: gray area with account-level downside. Do not build on it.** The 5-user cap
should be treated as the product's real ceiling.

### FAILURE 6 — "Supabase pauses after inactivity" → **VALID, ELIMINATED BY STACK CHOICE**

Confirmed verbatim (`05`, S5.3): 7-day pause, `pg_cron` stops, manual unpause required.
The prompt's keepalive mitigation works.

**Sharper point the prompt misses:** an *internal* `pg_cron` keepalive cannot work — if
the DB pauses, the scheduler inside it is also offline. The keepalive must be external.
Adopting D1 (no idle suspension) removes the failure entirely.

---

## Part 2 — Failure modes the prompt did not anticipate

### NEW FAILURE 7 — The 50-item recently-played window vs a 14-day cadence ☠️ **PROJECT-CRITICAL**

The single most damaging finding. `recently-played` holds **50 items, total**, and cursors
cannot reach beyond it (`04`, S4.5). At a typical 50–70 plays/day, a 14-day gap loses
**well over 90% of plays, permanently and unrecoverably** — they exist nowhere the app can
reach, and no future export fixes a play the app never captured.

The prompt's "Usually 1-3 calls per 2 weeks" reflects a mental model of a paginated
history archive. That model is wrong.

**Mitigation: reject the bi-weekly cadence for ingestion.** Poll at least every 6 hours;
hourly recommended. *Present* refreshed stats bi-weekly if that is the desired product
rhythm — but decouple that from ingestion frequency. Cost at hourly polling: 5 users × 24
× 30 ≈ 3,600 calls/month, still negligible against any plausible limit and against
Workers' 100K requests/day.

### NEW FAILURE 8 — Audio-features columns are unbuildable ☠️

The prompt's `tracks` table specifies `energy`, `danceability`, `valence`, `tempo`,
`popularity`. All are unobtainable for a new app (`06`). An implementer following the
schema literally writes columns that can never be populated.

**Mitigation: drop them.** No replacement exists inside Spotify's API.

### NEW FAILURE 9 — Duplicate track URIs corrupt the headline stat ☠️

`GROUP BY spotify_uri` splits one song across single/album/reissue URIs (`04`, Defect 2),
fragmenting play counts. **MOST REPLAYED — the app's flagship statistic — silently returns
wrong answers.** Wrong-but-plausible output is worse than an error, because nothing
signals the defect.

**Mitigation:** group on normalised `(track_name, artist_name)` for leaderboards; keep the
URI for linking only.

### NEW FAILURE 10 — `skipped = false` makes MOST SKIPPED return nothing

The prompt's query filters `skipped = true`, but the field is unpopulated across a
multi-year span (`04`, Defect 1). The query returns empty or wildly understated results,
and looks like "you never skip anything" rather than like a bug.

**Mitigation:** derive at ingest —
`skipped OR reason_end IN ('backbtn','unknown','endplay','fwdbtn')`.

### NEW FAILURE 11 — Completion rate has no denominator

Requires `duration_ms`, which the export omits entirely (`04`, S4.2) and which can now
only be fetched **one track at a time** (`06`, S6.2).

**Mitigation:** capture `duration_ms` free from `recently-played` responses going forward;
slow-backfill history via `GET /tracks/{id}`; compute the stat only over tracks with a
known duration and label its coverage honestly.

### NEW FAILURE 12 — 429 ambiguity causes retry storms

A 429 now means either transient rate-limiting or a hard `QUOTA_EXCEEDED` (`01`, S1.3).
Uniform retry-with-backoff against a quota exhaustion burns the shared account-level
budget and can affect every app under the developer account.

**Mitigation:** branch on `reason`. `QUOTA_EXCEEDED` → abort the run, do not retry, alert.

### NEW FAILURE 13 — The owner's Premium lapse kills the app

"The app owner must have a Spotify Premium account for apps in development mode to
function" (`03`, S3.2). A lapsed subscription — expired card, cancelled trial — takes the
entire app down for all users, with a cause that presents as a generic auth failure.

**Mitigation:** none technical. Document it prominently as an operating requirement, and
treat sustained blanket auth failures as a "check Premium status" signal in the runbook.
Worth stating plainly: **this app has a real cost — the owner's Premium subscription.**
Zero *infrastructure* cost is not zero cost.

### NEW FAILURE 14 — Silent staleness

The compound risk. Refresh token expiry (F3), quota exhaustion (F12), and Premium lapse
(F13) all fail **silently**: the API stops returning data, but the database still holds
old rows and the app keeps rendering confident-looking stats. Users trust stale numbers.

**Mitigation — treat as a first-class product requirement, not an ops detail:** persist
`last_successful_sync_at` per user, surface data freshness in every response, and alert
when any user exceeds ~2× the expected sync interval. A stats app that lies quietly is
worse than one that is visibly down.

---

## Part 3 — Steel-manning the strongest case against the project

**"Spotify has restricted its free API three times in 21 months, always with under a
month's notice, and the direction is one-way. Building on it is building on sand."**

This is the most serious objection and it is substantially correct. Nov 2024 removed
audio features; Feb 2026 cut users 25→5, added a Premium requirement, and removed endpoint
classes; Jul 2026 consolidated quota. Nothing was reversed. There is no reason to expect
the contraction to stop, and a 5-user ceiling means this can never become a public product.

**The honest response is not to dismiss this but to design for it:**

1. **The GDPR export is a legal right (Article 15/20), not a product feature.** It cannot
   be deprecated the way an endpoint can. Making it the *primary* source — rather than
   the one-time bootstrap the prompt envisages — is the durability play.
2. **Once ingested, data is permanently yours.** Every sync is a hedge against the next
   policy change. This is a stronger argument for the local-database design than the
   rate-limiting rationale the prompt gives.
3. **Scope honestly.** This is a personal/small-group tool for ≤5 people. It is not a
   startup. Judged as a personal tool it is fully viable; judged as a product it is
   blocked by a wall no engineering can climb.

**Conclusion of the adversarial pass:** the project is viable *as scoped*, but only after
the cadence correction (F7) and the schema corrections (F8–F11). Without F7 in particular,
a faithful implementation of the original design would capture a small fraction of plays
while appearing to work — the worst possible outcome, and one that would take months to
notice.
