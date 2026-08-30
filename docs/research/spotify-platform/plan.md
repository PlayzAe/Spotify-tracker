# Research Plan — Spotify Stats App, Backend (Fully Free)

**Run date:** 2026-08-16
**Method:** cs-deep-research (rigor-first, triangulated, adversarial pass mandatory)
**Scope:** Backend only — auth, ingestion, storage, sync, categorization. No frontend.

---

## Decision this research feeds

> "Can I build and run a personal Spotify stats app — full listening history from
> Jan 1 of the current year to today, refreshed every two weeks, categorized by
> most replayed / most listened / most skipped / etc. — at **$0/month**, and if so,
> exactly what do I build?"

The answer must be actionable to the point of a schema and a sync algorithm, or it
has failed.

---

## Deviation from the original prompt's method

The source prompt specified six parallel sub-agents. This run executed the same six
work-streams as **batched parallel web calls inside a single context** rather than
spawned sub-agents. Rationale: the harness restricts agent spawning absent an explicit
request, and — more importantly — the six streams turned out to be *strongly coupled*
(the user-cap finding invalidates the rate-limit math; the endpoint-deprecation finding
invalidates the schema). Keeping them in one context surfaced those contradictions
immediately instead of burying them in six independent reports that would each have
been internally consistent and collectively wrong.

Parallelism was preserved: 20 web calls issued across 6 batched rounds.

---

## Falsifiable hypotheses and verdicts

| # | Hypothesis | Verdict | Basis |
|---|---|---|---|
| **H1** | A zero-cost stack (free DB + free host + free cron) runs a bi-weekly sync for the allowed user count without breaching free-tier limits | **CONFIRMED** | Data volume ~2–25 MB; every component has a free tier that covers it. Stack choice changed from the prompt's proposal — see `05_free_tier_limits.md` |
| **H2** | Bi-weekly polling stays safely within Spotify's undocumented rate limits | **CONFIRMED** | Rolling 30-second window; design peaks at ~0.2 req/s. New caveat: quota is now shared per *developer account*, not per Client ID |
| **H3** | The GDPR export contains enough data to reconstruct Jan 1 → today with no gaps | **PARTIALLY REFUTED** | Fields are sufficient for most stats, but `skipped` is unreliable, track URIs duplicate across releases, `duration_ms` is absent (breaks completion rate), and there is a real recency lag |
| **H4** | The 25-user cap can be worked around by pre-adding users to the allowlist | **REFUTED AS STATED** | The cap is **5**, not 25, since Feb 2026. Allowlisting is the right mechanism but the number and the surrounding rules are all different |

**Two hypotheses the original prompt did not think to ask**, both of which turned out
to matter more than H1–H4:

| # | Emergent hypothesis | Verdict |
|---|---|---|
| **H5** | The endpoints the app depends on still exist | **PARTIALLY REFUTED** — audio-features, audio-analysis and batch fetches are gone; user-scoped endpoints survive |
| **H6** | Refresh tokens persist indefinitely, so a cron can sync forever unattended | **REFUTED** — refresh tokens expire after 6 months as of July 20, 2026 |

---

## Sourcing strategy

Priority order applied:

1. **Spotify first-party** — developer.spotify.com docs, changelog, and engineering blog.
   Treated as authoritative for policy and limits.
2. **First-hand primary accounts** — developers who actually exported and parsed their
   own data (Ortham). Treated as authoritative for data-quality claims that Spotify
   does not document.
3. **Tier-1 press** — TechCrunch. Used for dates and corroboration, not for technical detail.
4. **Vendor/SEO blogs** — used only as *leads to chase*, never as terminal evidence.
   Several proved wrong (see below) and were discarded.

## Sources rejected during triangulation

- A commercial blog claimed extended streaming history "covers only the past year."
  **Rejected** — conflates Spotify's two distinct exports (Account Data ≈ 30 days vs
  Extended Streaming History = account lifetime). Contradicted by a first-hand export
  spanning 2014→2024 and by Spotify's own privacy documentation.
- A vendor page asserted "25 client IDs per developer" as if it raised the user ceiling.
  **Partially rejected** — the Client-ID count is real and first-party-confirmed, but the
  implication is false: Spotify moved quota accounting to the account level in the same
  release, specifically neutralising this as a scaling path.

## Stop criteria

Research stops when each of the following has ≥3 independent, differently-typed sources
or an unambiguous first-party statement:

- [x] Development Mode user cap and Premium requirement — *first-party + press + docs*
- [x] Rate limit mechanics and 429 semantics — *first-party docs + community + secondary*
- [x] Refresh token lifetime — *first-party blog + two independent library issue trackers*
- [x] Endpoint availability after Feb 2026 — *first-party migration guide (direct)*
- [x] GDPR export schema and data-quality defects — *first-hand parse + community + guides*
- [x] Free-tier limits for every proposed component — *vendor docs + independent comparisons*

All six met. Research closed.
