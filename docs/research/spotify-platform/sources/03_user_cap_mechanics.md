# Source 03 — Development Mode user cap mechanics

**Verdict: the original prompt's FACT 2 is out of date. The cap is 5, not 25.**

---

## S3.1 — Spotify, "Update on Developer Access and Platform Security" (2026-02-06)

First-party announcement blog. **Highest authority source in this file.**
URL: https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security

Verbatim:

> "Each Client ID will be limited to up to five authorized users"

> "Developers will be limited to one Development Mode Client ID"

> "Development Mode use will require a Spotify Premium account"

Stated rationale:

> "advances in automation and AI have fundamentally altered the usage patterns and risk
> profile of developer access"

Dates:
- **2026-02-11** — new Development Mode Client IDs subject to the restrictions
- **2026-03-09** — existing integrations must comply

---

## S3.2 — Spotify, Quota Modes documentation (current)

First-party reference documentation.
URL: https://developer.spotify.com/documentation/web-api/concepts/quota-modes

Verbatim:

> "Up to 5 authenticated Spotify users can use an app that is in development mode"

> "The app owner must have a Spotify Premium account for apps in development mode to
> function."

**Critical behavioural detail — refutes a claim in the original prompt:**

> "Users may be able to log into a development mode app without having been allowlisted
> by the developer. However, API requests with an access token associated to that user
> and app will receive a 403 status code error."

Allowlist management path:

> Developer Dashboard → select app → Settings → Users Management tab → "Add new user" →
> enter the user's name and Spotify email address.

Extended Quota Mode criteria:

> 1. "Established Business Entity (legally registered business or organisation)"
> 2. "Operating an active, and Launched Service"
> 3. "Maintaining a minimum of active users (at least 250k MAUs)"
> 4. "Being available in key Spotify markets"
> 5. "Commercial Viability"
> 6. "Adherence to Terms"

> As of May 15th, 2025: "Spotify only accepts applications from organizations (not
> individuals)."

---

## S3.3 — TechCrunch (2026-02-06)

Independent tier-1 press corroboration.
URL: https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/

Verbatim:

> "Spotify is now limiting each app to only five users"

> "requires devs to have a Premium subscription"

Corroborates S3.1 on both the number and the Premium requirement. Adds nothing on
grandfathering.

---

## S3.4 — Spotify, February 2026 Migration Guide

First-party.
URL: https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide

Verbatim:

> "All Development Mode apps require the app owner to have an active Spotify Premium
> subscription."

> "Users per app: 5"

> "Client IDs per developer: 1"

**Grandfathering — verbatim:**

> "If you already have multiple Client IDs or more than 5 users, you will retain them."

> "Extended Quota Mode apps are not affected by any changes"

---

## S3.5 — Spotify, "Web API quota updates for Development Mode" (2026-07-23)

First-party blog + changelog. **This is the most recent policy change found.**
URLs:
- https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates
- https://developer.spotify.com/documentation/web-api/references/changes/july-2026

Verbatim:

> "Client IDs per developer — Increased from 1 to **25**."

> "the quota for all of those apps is shared under a single budget"

> "When your quota is exceeded, the 429 Too Many Requests response now returns a
> structured JSON body with a `reason`: `QUOTA_EXCEEDED` field."

**Analysis — why this is not the escape hatch it appears to be:**

The July release raised Client IDs 1 → 25 *and simultaneously* moved quota accounting
from per-Client-ID to per-developer-account. These two changes are almost certainly
paired deliberately: the Client-ID increase is framed as organisational convenience
("to better help you organize your projects"), while the quota consolidation removes
the incentive to farm Client IDs for capacity.

The July changelog does **not** state that the 5-user allowlist is shared across Client
IDs. Read literally, 25 Client IDs × 5 users = 125 allowlist slots under one shared
request budget. **This is a gray area, not a documented allowance.**

Against relying on it:
- Spotify Developer Terms prohibit circumventing restrictions.
- The Feb 2026 announcement's stated purpose is *reducing* the risk profile of
  developer access; mass Client-ID farming runs directly against that intent.
- Enforcement is discretionary and the penalty (app disablement) lands on the whole
  developer account.

**Recommendation: treat 5 users as the real ceiling.** Marked
`[GRAY AREA — DO NOT BUILD ON]` in the synthesis.

---

## S3.6 — Community thread: can the 5-user cap be lifted independently?

URL: https://community.spotify.com/t5/Spotify-for-Developers/Can-the-5-user-OAuth-limit-be-lifted-independently-of-Extended/td-p/7394191

Direct fetch returned **HTTP 403** (community forum blocks automated fetch). Thread
title and search-index summary indicate the question was asked; no accessible official
answer was retrieved.

**Marked [INSUFFICIENT EVIDENCE].** No confirmed middle tier or personal-use exemption
was found in any accessible first-party source. The documented path from 5 users is
Extended Quota Mode, whose criteria (250k MAU + registered business + launched service)
are unreachable for a personal project. Absence of a middle tier is consistent across
all sources but is not positively confirmed by a Spotify statement.

---

## Answers to the original prompt's open questions

| Question | Answer | Confidence |
|---|---|---|
| What happens at user N+1? | OAuth login may still succeed; **API calls return 403** | High — first-party |
| Does the cap count ever-authorized or currently-active users? | Allowlist is a managed list of slots, not a historical counter | Medium — inferred from dashboard mechanics; removal process undocumented |
| Can you remove a user and add another? | Add path documented; **removal path is not documented** | Low — `[INSUFFICIENT EVIDENCE]` |
| Is multi-app circumvention allowed? | Not documented as allowed; Terms prohibit circumventing restrictions | Medium |
| Can a small app get Extended Quota? | No — 250k MAU and business-entity gate, individuals not accepted | High — first-party |
