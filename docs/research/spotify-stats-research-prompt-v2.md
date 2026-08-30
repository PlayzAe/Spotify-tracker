---
name: spotify-platform-research
version: 2.0
supersedes: spotify-stats-research-prompt.md (v1, 2026-08-16)
description: Backend-focused deep-research prompt for a fully free Spotify stats app.
  v2 corrects four factually-outdated premises in v1 (user cap, refresh-token lifetime,
  recently-played pagination, audio-features availability), adds intake/verification/
  loop-discipline gates per AR v1, and reframes the hybrid data model around durability
  rather than one-time bootstrap. Use with cs-deep-research. Adversarial pass required.
data_as_of: 2026-08-16
revalidate_by: 2026-11-14
---

# Research Prompt v2: Spotify Stats App — Backend Deep-Dive (Fully Free)

> **Skill:** cs-deep-research — rigor-first, triangulated, adversarial pass mandatory.
> **Scope:** Backend only. Auth, ingestion, storage, sync, categorization. No UI.
> **Goal:** Design a complete backend for a free Spotify stats app showing a user their
> streaming history from January 1 of the current year to today, categorized by most
> replayed / most listened / most skipped / most liked and other dimensions, at zero
> infrastructure cost.

---

## 0. Intake gate — refuse to run on fuzz

**Do not begin research until these are answered.** v1 accepted any input silently; this
is the AR1 fix. Recommended answers are given — accept them explicitly or override.

| # | Question | Recommended |
|---|---|---|
| 1 | How many humans will actually use this? | **≤5.** If >5, stop — the research conclusion is "not possible on the free tier," and the work is wasted |
| 2 | Does the app owner have Spotify **Premium**? | **Required.** Dev Mode apps do not function without it. If no, the project is blocked before line 1 |
| 3 | Is losing plays between syncs acceptable? | **No.** This drives the entire cadence decision |
| 4 | Is a one-time history import enough, or is ongoing accuracy required? | **Ongoing.** Determines whether re-export is part of the design |
| 5 | Postgres required, or is SQLite acceptable? | **SQLite/D1 acceptable** — changes the stack recommendation |

If Q1 > 5 or Q2 is "no", **halt and report the blocker**. Do not research around it.

---

## 1. Verified facts — build on these, do not re-open

Each carries a confidence level and a staleness date. **Facts marked ⚠️ were wrong in v1
and are corrected here.**

**FACT 1 — The Developer Dashboard is free.** Register at developer.spotify.com, create an
app, get a Client ID and Secret. No company required, no fee. You register *your* app and
your backend uses those credentials.
*Confidence: high. Unchanged from v1.*

**FACT 2 ⚠️ — The user cap is 5, not 25, and the owner must have Premium.**
Since February 11, 2026 (existing apps: March 9, 2026), Development Mode allows **5
authorized users per Client ID**, and "the app owner must have a Spotify Premium account
for apps in development mode to function." Non-allowlisted users may complete OAuth login
but receive **403 on API calls** — so a graceful error path exists and should be built.
Extended Quota Mode requires a registered business, a launched service, and **250k MAU**;
individuals have not been accepted since May 2025. There is no middle tier.
*Confidence: high — first-party docs + announcement blog + TechCrunch.*

**FACT 3 ⚠️ — `recently-played` holds 50 items TOTAL and cannot paginate past them.**
v1 assumed cursors could page back to the last sync timestamp. They cannot — the window is
a 50-item convenience buffer, not an archive. Once a 51st track plays, the oldest is gone
permanently. **This makes any polling interval longer than a few hours lossy.**
*Confidence: high — first-party reference + multiple independent corroborations.*

**FACT 4 — Historical data must come from the GDPR Extended Streaming History export.**
Unchanged from v1 and reinforced by FACT 3. Note there are **two different downloads** on
the Privacy page: "Account data" (~30 days) and "Extended streaming history" (account
lifetime). Request the latter. Typical delivery is **hours to ~5 days**; the "30 days"
figure is the GDPR statutory ceiling, not the expected wait.
*Confidence: high.*

**FACT 5 — Spotify publishes no numeric rate limits.** Enforcement is a **rolling 30-second
window**; 429 responses "normally" include `Retry-After`. Since July 23, 2026, a 429 may
carry `"reason": "QUOTA_EXCEEDED"`, which is **not retryable** and indicates the
developer-account-wide budget is exhausted. Quota is pooled across all of an account's
Client IDs.
*Confidence: high — first-party.*

**FACT 6 ⚠️ — Refresh tokens expire after 6 months.** Effective July 20, 2026 for existing
apps. The lifetime runs from **original authorization** and is **not extended by
refreshing**. Expiry returns `400` + `invalid_grant`. Tokens carry **no readable issuance
date**, so the backend must record `authorized_at` itself.
*Confidence: high — first-party blog + two independent project issue trackers.*

**FACT 7 ⚠️ — Audio features are permanently unavailable.** `audio-features`,
`audio-analysis`, `recommendations`, `related-artists` and 30-second previews were
deprecated 2024-11-27 for all apps without prior extended access. No replacement exists 21
months later. February 2026 additionally removed **all batch `?ids=` fetches** (single-ID
GETs survive), browse endpoints, and the `popularity` field; search `limit` dropped 50→10.
**Surviving and sufficient: `/me`, `/me/player/recently-played`, `/me/top/tracks`,
`/me/top/artists`, `GET /tracks/{id}`, `/me/library`.**
*Confidence: high — first-party migration guide.*

---

## 2. Falsifiable hypotheses

| # | Hypothesis | Refuted by |
|---|---|---|
| H1 | A zero-cost stack runs continuous sync for ≤5 users without breaching free-tier limits | Any component's free tier proving insufficient for the data volume or cron frequency |
| H2 | Sub-daily polling stays within Spotify's undocumented rate limits | Evidence that hourly polling at this volume triggers 429s |
| H3 | The GDPR export supports every proposed statistic without API enrichment | Missing fields, unreliable fields, or absent `duration_ms` |
| H4 | Ingestion cadence can be decoupled from stats-presentation cadence | Evidence that stats must recompute per-poll |
| H5 | Every endpoint the design depends on still exists in Development Mode | Any of the six surviving endpoints being withdrawn |
| H6 | The design survives a 6-month unattended run | Token expiry, quota, or Premium lapse breaking it silently |

**H5 is the kill switch — test it first.** If a user-scoped endpoint is gone, the project
is dead and the remaining research is wasted.

---

## 3. Research subtopics — dispatch in parallel

| Agent | Topic | Primary sources |
|---|---|---|
| A | Rate limits + the new QUOTA_EXCEEDED semantics; safe polling intervals | First-party rate-limit docs, July 2026 changelog, community threads |
| B | OAuth lifecycle: 6-month refresh expiry, rotation, re-auth UX, encryption at rest | First-party auth docs + refresh-token blog, RFC 6749, RFC 9700 |
| C | Dev Mode caps: 5-user allowlist, Premium requirement, removal mechanics, Client-ID rules | First-party quota-modes docs, Feb + Jul 2026 blogs |
| D | GDPR export: schema, **data-quality defects**, delivery lag, Account-data vs Extended | First-hand parse write-ups, community reports, Spotify privacy docs |
| E | Sync architecture given the 50-item window: cadence, dedup, watermarking, schema | Open-source trackers, first-party endpoint reference |
| F | Zero-cost stack: cron frequency, idle suspension, cold starts, storage | Vendor limit pages, independent 2026 comparisons |

**Agent D must specifically hunt for data-quality defects, not just the field list.** v1
asked only "what fields exist" and consequently missed every defect that corrupts the
output. Ask instead: *which fields lie?*

---

## 4. Questions each stream must answer

### A — Rate limits and quota
- Distinguish plain 429 from `QUOTA_EXCEEDED`. What is the correct action for each?
- Is quota per Client ID or per developer account post-July-2026?
- What is the safe sustained request rate given no published threshold?
  *(Expect `[INSUFFICIENT EVIDENCE]` on numbers — design to `Retry-After`, not to a figure.)*

### B — OAuth and tokens
- Confirm the 6-month window, what resets it, and what does not.
- Which flow for a confidential server-side backend — Auth Code with secret, or PKCE?
  *(v1 assumed PKCE adds meaningful hardening. Verify: PKCE targets clients that cannot
  hold a secret.)*
- How should the backend detect impending expiry given tokens carry no issue date?
- Proactive vs reactive re-auth notification — which fails less badly?

### C — User cap
- Exact behaviour at user N+1: does OAuth fail, or do API calls 403?
- Can an allowlisted user be **removed** and the slot reused?
- Does the 25-Client-ID allowance (July 2026) provide 125 user slots in practice, and is
  relying on it consistent with the Developer Terms? *(Assess as risk, not as a feature.)*

### D — GDPR export
- Full field schema, including which fields are **absent** (notably `duration_ms`).
- **Which fields are unreliable, and over which date ranges?**
- How should skips be derived if the `skipped` field cannot be trusted?
- Do multiple `spotify_track_uri` values map to the same recording? What breaks if so?
- Actual delivery lag, and how recent the included data is.
- What distinguishes "Account data" from "Extended streaming history"?

### E — Sync architecture
- Given FACT 3, what is the maximum safe polling interval? Show the arithmetic against
  realistic listening rates.
- Can ingestion cadence and stats-refresh cadence be decoupled? (H4)
- Does the API return `ms_played`? **If not, what statistics become uncomputable from
  API-sourced rows, and what is the remedy?**
- How should the boundary between export data and API data be established — estimated or
  measured?
- Deduplication key: which columns, and why not `spotify_uri`?

### F — Stack
For each candidate, establish: **minimum cron interval on the free tier**, idle-suspension
behaviour, cold-start latency, request-body size limits, and storage/write quotas.
Candidates: Cloudflare Workers + D1 + R2; Supabase; Neon; Vercel; Render; GitHub Actions;
cron-job.org.
Flag any free tier that has **changed or been withdrawn** since 2024 — several cited in v1
had.

---

## 5. Verification gates — research does not proceed past these

The AR4 fix. v1 described checks without making them binding.

| Gate | Assertion | On failure |
|---|---|---|
| **G1** | Every one of the six required endpoints confirmed available in Dev Mode, from a **first-party** source | **Halt.** Report project non-viable |
| **G2** | User cap and Premium requirement confirmed by ≥2 independent sources incl. first-party | Halt; re-run stream C |
| **G3** | Max safe polling interval derived from arithmetic, not assumed | Re-run stream E |
| **G4** | Every proposed schema column traced to an obtainable field | Remove the column |
| **G5** | Every statistic traced to fields that exist **and are reliable** | Mark the stat degraded, state coverage |
| **G6** | Every free-tier figure sourced from a page dated within 90 days | Re-verify or mark `[STALE]` |
| **G7** | Adversarial pass covers all six v1 failures **plus** newly discovered ones | Research incomplete |

---

## 6. Loop discipline

The AR5 fix. v1 had no retry or stop rules.

> For any unresolved question: search → triangulate → if <3 independent sources after **3
> rounds**, mark `[INSUFFICIENT EVIDENCE]` and move on. Do not loop further. A repeated
> failure to source the same claim after 2 attempts means the information is not public —
> record that as the finding.

- **Max 3 search rounds per open question.**
- **Never fabricate a citation to close a gap.** Empty fetch = empty claim.
- Community forum pages frequently return **403 to automated fetch** — treat that as a
  retrieval failure, not as absence of evidence, and note it explicitly.
- Where first-party and secondary sources conflict, **first-party wins**; record the
  conflict rather than silently dropping it.

---

## 7. Adversarial pass — mandatory

Steel-man each. Do not skip.

1. Export lag creates a coverage gap → *quantify the real lag; don't assume*
2. Cold starts break the OAuth callback → *or choose a platform without them*
3. Refresh token revoked → *and now: expires on a schedule regardless*
4. Export format drifts → *has it already drifted within existing exports?*
5. Multi-app circumvention → *what does the quota-pooling change imply about intent?*
6. Database pauses on inactivity → *can an in-database scheduler rescue itself?*
7. **Polling interval vs the 50-item window** → *the highest-severity failure; quantify loss*
8. **Silent staleness** → *every auth/quota failure leaves stale data rendering as current.
   How does the user find out?*

**Then ask: what did this list miss?** v1's six failures were all real, but the two most
severe failure modes were absent from it entirely.

---

## 8. Required output

```
research/spotify-platform/
├── plan.md              hypotheses, verdicts, sourcing strategy, rejected sources
├── synthesis.md         all findings, source-anchored, per section
├── architecture.md      final architecture + component justification
├── schema.sql           schema in both dialects, with per-column rationale
├── sync_algorithm.md    pseudocode incl. backoff, re-auth, failure branches
├── sources/             one file per stream, verbatim quotes only
├── refresh_targets.md   tiered re-verification schedule with dates
└── decision.md          one page: build this, exactly
```

**Close-out contract (AR6) — the research is not done until:**
- [ ] Every hypothesis has an explicit verdict, including refutations
- [ ] Every `[INSUFFICIENT EVIDENCE]` item is listed in one place, not scattered
- [ ] Every correction to v1 is stated *as a correction*, with what breaks if ignored
- [ ] `decision.md` is actionable without reading anything else
- [ ] `refresh_targets.md` carries a dated next review

---

## 9. Anti-patterns

- ❌ **Assuming any 2024-era API fact still holds.** Three restrictive changes in 21
  months. Verify everything, especially anything that "obviously" works.
- ❌ **Designing to an undocumented number.** No published rate limit exists. Design to
  `Retry-After`.
- ❌ **Accepting a vendor/SEO blog as terminal evidence.** Use them as leads; confirm
  first-party. Several such sources proved wrong during v1's revision.
- ❌ **Treating the GDPR export as an API contract.** It is not documented or versioned.
  Parse defensively and log unknown fields.
- ❌ **Letting a statistic ship without knowing its input coverage.** A plausible-looking
  wrong answer is worse than an error.
- ❌ **Conflating ingestion cadence with presentation cadence.** These are independent.
  v1's central error came from fusing them.

---

*v2 generated 2026-08-16 · supersedes v1 of the same date*
*Corrections in v2 trace to `research/spotify-platform/sources/`*
*Skill: cs-deep-research | Rubric: AR v1 | Scope: backend only*
