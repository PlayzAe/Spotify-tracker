# 04 — What we can show, and what we can't

Two lists. The first is what the export gives us — it's richer than stats.fm's API-based
stats. The second is what's genuinely impossible, and must be communicated rather than
faked.

---

## ✅ Available — every one of these is computable offline

### Core

| Stat | Notes |
|---|---|
| Total plays / total listening time | Real millisecond durations, not estimates |
| Most replayed | By play count (plays ≥30s only — Spotify's own threshold for a counted stream) |
| **Most listened** | By total time. **Different from most-replayed**, and the difference is interesting — long tracks vs. short ones |
| **Most skipped** | Derived — see file 07. Competitors get this wrong; we won't |
| Top artists / albums | By time and by count |
| First played / discovery date | "You found this on 3 March" — strong emotional hook |

### Time

| Stat | Notes |
|---|---|
| By hour of day | Are you a morning or 2am listener |
| By weekday | Weekend vs weekday personality |
| Monthly / yearly breakdown | **Full lifetime** — years of it |
| Longest streak | Consecutive days with a play |
| Year-over-year | How taste shifted. stats.fm charges for this |

### Behavioural — the export-only differentiators

These come from fields the API simply doesn't expose. **This is where the product feels
different from everything else.**

| Stat | Field | Why it's good |
|---|---|---|
| **Platform breakdown** | `platform` | Phone vs desktop vs console vs car |
| **Shuffle vs deliberate** | `shuffle` | Do you choose, or let it choose |
| **Offline listening** | `offline` | Commuter/flight patterns |
| **How tracks end** | `reason_end` | Finished, skipped forward, back-buttoned |
| **How tracks start** | `reason_start` | Clicked, autoplay, radio |
| **Country** | `conn_country` | Travel history in music |
| **Podcasts vs music** | `episode_name` | Full split |
| **Incognito plays** | `incognito_mode` | Handle with care — see file 05 |

### Fun

- Skip rate per artist — "artists you keep starting and abandoning"
- Songs played once and never again
- Longest single listening session
- Biggest single day
- Time-of-day personality summary
- "Your top 10 that year" for each year in the file

---

## ❌ Not possible — do not design toward these

### Completion rate / "% of track listened"

The export has `ms_played` but **not track duration**. Duration requires the API. Cannot
be computed. Do not show a percentage bar implying it.

**Alternative:** share of plays under 30 seconds — a true, computable skip signal.

### ~~Album artwork~~ → **SOLVED — see [09-cover-art.md](09-cover-art.md)**

Superseded. Artwork is **available, free, with no server**, via Deezer's public catalogue
using JSONP (which sidesteps the CORS problem that rules out iTunes and Cover Art Archive).

There's no artwork inside the export itself, so it's fetched per displayed album at
render time. Full rules, rate limits, and the privacy disclosure are in file 09.

**Still design a strong fallback.** Misses are normal — local files, obscure releases,
podcasts, and users who switch artwork off. Deterministic generative tiles derived from
the track name make those look intentional rather than broken.

### Genres

Spotify's audio-features and genre endpoints were deprecated in November 2024 with no
replacement. Not available at any price.

### Anything live

No now-playing, no recent tracks, no "since your last visit," no auto-refresh. The file
is a snapshot. Users must re-export to update.

The user's own framing: *"seeing recent songs and stuff needs API."* Correct — and that's
the trade for serving unlimited users free.

### Social features

No leaderboards, friend comparisons, "soulmates," or shared profiles. All require a
server and accounts, which would end both the privacy promise and the $0 cost.

**Possible alternative:** an exported **image** the user shares themselves — comparison
without infrastructure. See below.

---

## Shareable image — worth prioritizing

Rendered client-side (canvas), downloaded by the user. No upload, no hosting, no cost.

Why it matters: it's the entire growth mechanism. There's no login, no email list, no
referral system — a shareable "here are my stats" image is how this spreads. Wrapped
season proves the appetite.

Design it as a **first-class feature**, not an afterthought. Must not include personal
identifiers beyond what the user chooses to show.

---

## Data availability summary

Give the user a way to see this. Being upfront about limits builds more trust than
quietly omitting them.

| | Available | Source |
|---|---|---|
| Play counts, listening time | ✅ | Export |
| Skips, shuffle, platform, country | ✅ | Export |
| Full lifetime history | ✅ | Export |
| Track duration / completion % | ❌ | API only |
| **Album art** | ✅ | **Deezer public catalogue — file 09** |
| Genres | ❌ | Deprecated by Spotify |
| Live / recent plays | ❌ | API only |
| Friends, leaderboards | ❌ | Needs a server |
