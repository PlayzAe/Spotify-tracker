# 10 — The freshness system: Wrapped that never gets stale

**The problem Moses identified, and it's the sharpest product insight in this brief:**

Spotify Wrapped is thrilling once a year because it's rare. A site that shows the *same
six cards every visit* becomes wallpaper within a week. If we want people returning — and
returning is the whole growth model when there's no login and no email list — **the same
data must feel different each time.**

This file proposes a system for that. Freddy: the mechanism matters more than my specific
card ideas. Replace the cards freely; keep the engine.

---

## The core idea: a deck, not a page

Don't design *the* results view. Design **a deck of many cards** and a rule for which ones
surface today.

```
   40-60 possible cards   ──▶   selection engine   ──▶   8-12 shown this visit
   (built once)                 (seeded, varies)         (feels curated)
```

Same underlying data. Different story every time. The user's history isn't changing —
**the lens on it is.**

---

## Three mechanisms

### 1. Seeded rotation — deterministic, not random

Seed a shuffle with `hash(dataset fingerprint + today's date)`.

- **Same day, same file → same result.** Refreshing doesn't reshuffle, so nothing feels
  arbitrary and a shared link matches what they saw
- **Next week → a genuinely different set**
- Reproducible, debuggable, no server

Weight the selection so headline stats (top song, top artist, total time) appear often,
and deep cuts rotate underneath. People still want their favourites — they just don't want
*only* their favourites.

### 2. Conditional cards — surface only when the data is interesting

The real magic. Most cards should have an **eligibility rule**, so they fire only when a
pattern actually exists. That's what makes it feel personal rather than templated.

Examples — Freddy, invent better ones:

| Card | Fires when |
|---|---|
| "Your 4am song" | ≥10 plays between 3–5am |
| "The one-hit obsession" | A track with ≥50 plays inside 7 days, then near-silence |
| "You gave up on this artist" | Heavy listening, then 90+ days of nothing |
| "The comeback" | Artist dormant 6+ months, then heavy again |
| "Nearly skipped it" | High skip rate early, high completion later |
| "Your commute soundtrack" | Strong offline + weekday-hour concentration |
| "Season shift" | Top artist differs sharply summer vs winter |
| "The night you didn't sleep" | 5+ consecutive listening hours past midnight |
| "Loyal to one album" | One album >20% of a month's plays |
| "The skip you always make" | Same track skipped 20+ times but never removed |

A user with unusual patterns gets unusual cards. Two friends comparing see *different card
types*, not the same template with different numbers. **That's the shareable moment.**

### 3. Reframing — same number, new angle

The same statistic can be presented many ways. Rotate the framing:

- "Your most played song: 247 plays"
- "You played *Blinding Lights* every 1.4 days this year"
- "14 hours with one song — that's a workday and a half"
- "In March, this was 1 in every 9 songs you heard"

Identical data. Four different feelings. **Cheap to build, disproportionate payoff.**

---

## Time-based variation

| Trigger | Behaviour |
|---|---|
| Time of day | Late-night visit → lead with night-listening cards |
| Season | Summer/winter comparisons in season |
| December | Full year-in-review mode — meet Wrapped expectations head-on |
| Anniversary of first play | "You joined Spotify 7 years ago today" |
| Return visit | "Since you last looked" — the *selection* changed, not the data |

The December one matters: people will arrive expecting Wrapped. Give them a better version
— all years, real listening times, no paywall.

---

## Progressive depth

First visit shouldn't dump 60 cards. Suggested shape:

1. **Hook** — 3-4 big cards, instantly shareable
2. **Explore** — the rotating deck
3. **Dig** — full leaderboards, filters, per-year breakdowns for people who want them

Depth stays available; it just doesn't ambush a first-time visitor.

---

## Guardrails

- ⚠️ **Never fabricate a pattern.** If eligibility isn't met, don't show the card. A
  forced "your 4am song: 2 plays" destroys trust in every other card
- ⚠️ **Never randomise within a session.** Reshuffling on refresh feels broken
- ⚠️ **Never hide a stat people came for.** Top songs/artists must always be reachable,
  even when not featured today
- ⚠️ **Sparse histories need a floor.** A user with 200 plays should get a good small
  experience, not empty slots
- ⚠️ **Keep the tone warm.** "You gave up on this artist" is playful; make sure it never
  reads as judgement

---

## Why this is the right investment

There's no login, no email list, no notifications. **The only reasons anyone returns are:
they re-exported their data, or the site itself is worth revisiting.** The freshness system
is the entire retention strategy — and it's the one feature stats.fm and last.fm can't
easily copy, because their value proposition is a live-updating feed rather than a
beautifully re-framed archive.

It's also the best answer to "why isn't this live?" — the data doesn't change, but the
story does.
