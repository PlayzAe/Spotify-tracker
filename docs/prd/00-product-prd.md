# Product Requirements Document — Spotify Stats (Emberfig)

**Version:** 1.0 · **Date:** 2026-08-17 · **Owner:** Moses
**Status:** Draft for build
**Related:** [Frontend PRD](01-frontend-prd.md) · [Data Engine PRD](02-data-engine-prd.md) ·
[Research](../research/spotify-platform/) · [Design brief](../brief/)

---

## 1. Summary

A free web app that turns a user's Spotify data export into rich, beautiful listening
statistics — processed entirely in their browser, with no account, no server, and no
paywall.

**One line:** *Upload your Spotify export, see your whole listening life, and nobody
else ever sees it.*

---

## 2. Problem

People want to see their listening history more than once a year. Two products serve this
today, and both frustrate users in ways we can structurally avoid.

**stats.fm** — its top complaints all trace to the Spotify API:
- Skipped tracks counted as fully listened (the API never reports play duration)
- Days of history missing (the API's recent-plays window holds only 50 items)
- Full history locked behind a ~$4.99 subscription — users pay, then hit the bugs
- Users uncomfortable with the account access requested

**last.fm** — scrobbles lost permanently on failed submissions (one reported account went
from 15,582 to 207), outages, and misattributed artists corrupting stats.

**The insight:** the Spotify data export contains true millisecond play durations and the
reason playback ended. It is *more accurate* than the API, has no user cap, and is a legal
right under GDPR rather than a revocable product feature.

---

## 3. Goals and non-goals

### Goals

| # | Goal | Measure |
|---|---|---|
| G1 | Accurate stats — no guessing at listening time or skips | Real `ms_played` used throughout |
| G2 | Genuinely free at any scale | $0 infrastructure; domain is the only cost |
| G3 | Provable privacy | Zero user data reaches any server we control |
| G4 | Unlimited users | No API dependency, so no 5-user cap |
| G5 | Worth revisiting | Same data feels different across visits |

### Non-goals

| # | Not doing | Why |
|---|---|---|
| N1 | Live / now-playing / recent tracks | Requires the API → 5-user cap |
| N2 | Spotify login | Same |
| N3 | Accounts, profiles, social, leaderboards | Requires a server → cost + privacy loss |
| N4 | Any paid tier | Free is the position |
| N5 | Genres, audio features (energy, tempo) | Spotify deprecated these Nov 2024 |
| N6 | Track completion % | Export has no track duration |
| N7 | Mobile apps (v1) | Web first |

---

## 4. The constraint that defines the product

**Spotify's API allows 5 authorized users per app.** Lifting it requires a registered
business with 250,000 monthly active users already, and individuals have not been accepted
since May 2025.

| With the API | Without it |
|---|---|
| 5 users, forever | **Unlimited** |
| Server, OAuth, token storage | Static site |
| Revocable (3 cuts in 21 months) | GDPR right — cannot be revoked |
| Costs money at scale | **$0 at any scale** |

**Decision: no Spotify API, ever.** Every other requirement follows from this.

---

## 5. Users

| Persona | Need | Success looks like |
|---|---|---|
| **The Wrapped fan** (primary) | Wrapped, but any time and deeper | Gets a shareable image in <5 min from upload |
| **The data nerd** | Real numbers, full history, no rounding | Reaches raw leaderboards and per-year breakdowns |
| **The privacy-conscious** | Stats without surrendering account access | Verifies in DevTools that nothing uploads |
| **The ex-stats.fm user** | The thing they paid for, working and free | Sees accurate skips and complete history |

---

## 6. Architecture (one page)

```
  User's browser                                      Static CDN
  ┌──────────────────────────────────┐               ┌─────────────┐
  │  ZIP file ──▶ Web Worker         │◀── HTML/JS ───│ Cloudflare  │
  │               ├ unzip (streamed) │               │   Pages     │
  │               ├ parse JSON       │               │  (free)     │
  │               ├ normalize        │               └─────────────┘
  │               └ aggregate        │
  │                      │           │               ┌─────────────┐
  │                      ▼           │──── art ─────▶│   Deezer    │
  │               Stats UI + share   │   (JSONP)     │  (free CDN) │
  └──────────────────────────────────┘               └─────────────┘

  NO SERVER. NO DATABASE. NO UPLOAD. NO LOGIN.
```

The only outbound request carrying anything user-derived is a **cover-art lookup**
(artist/album name only, for on-screen albums only, user-disableable).

---

## 7. Scope

### v1.0 — Launch

- Zip upload + client-side parse (incl. multi-zip, malformed-file tolerance)
- Core stats: top tracks, artists, albums; listening time; skips; time patterns; streaks
- Behavioural stats: platform, shuffle, offline, country, podcast split
- Cover art via Deezer, with off switch
- Freshness system (rotating card deck)
- Shareable image export
- Full error-state handling (11 states)
- FAQ + privacy pages
- Ads + consent + polite adblock prompt
- Light/dark, mobile-first, accessible

### v1.1 — Fast follow

- Opt-in local caching (IndexedDB)
- Expanded card deck
- Per-year deep dives, filters
- Open-source the client (privacy verifiability)

### Later

- Apple Music / YouTube Music exports (same architecture, new parser)
- Multi-export merge (combine old and new exports)

---

## 8. Success metrics

Measured with **Cloudflare Web Analytics** — free, cookieless, no personal data, no
individual tracking. Compatible with the privacy promise.

| Metric | Target | Why |
|---|---|---|
| Parse success rate | >95% of uploads | Core function works |
| Wrong-export error rate | <10% of uploads | Instructions land |
| Upload → results (median) | <60s | Performance holds |
| Share image generation | >20% of successful parses | Growth engine works |
| Return visits (30d) | >15% | Freshness system works |
| Adblock prompt acceptance | >15% | Funding viable |
| Infrastructure cost | **$0/month** | Non-negotiable |

**Not measured:** anything about what users listen to. We don't have it and won't collect it.

---

## 9. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Spotify changes export format | High | Defensive parsing; log unknown fields; version-detect |
| R2 | AdSense rejects a single-page utility site | **High** | **Verify before build** — else rethink funding |
| R3 | Large files crash mobile | Medium | Streamed parsing; early size warning; desktop fallback |
| R4 | Deezer match rate too low | Medium | Test with real exports; strong generative fallback |
| R5 | Export request friction kills funnel | Medium | Excellent instructions; demo mode on landing |
| R6 | Deezer changes/removes JSONP | Low | Art degrades to fallback tiles; product still works |
| R7 | Users expect live data | Medium | Never imply live; snapshot date always visible |

**R2 is the only one that can invalidate the business model. Resolve it first.**

---

## 10. Release criteria

Ship-blockers — any failure blocks launch:

- [ ] No network request contains user listening data (verified in DevTools)
- [ ] No feature requires Spotify login
- [ ] Nothing gated behind payment, email, or disabling an ad blocker
- [ ] Snapshot date visible on results
- [ ] Wrong-export upload produces the specific guiding error
- [ ] 150 MB export parses on mid-range mobile without crashing
- [ ] Skip stat uses derived logic (not the unreliable raw field)
- [ ] Leaderboards group by normalized key (not track URI)
- [ ] Works with ads declined and with a content blocker active
- [ ] WCAG AA: contrast, keyboard nav, screen-reader labels

---

## 11. Open questions

Tracked in [../brief/08-open-questions.md](../brief/08-open-questions.md).

Blocking: **AdSense approval (R2)**, Spotify brand/attribution rules, product name.
