# Frontend Brief — Spotify Stats (Emberfig)

**For:** Freddy (frontend)
**From:** Moses / Emberfig
**Status:** brief, not spec. **Design decisions are yours.**

---

## What this folder is

Requirements and constraints, not a design. It tells you **what must be true** and **what
must never happen**. The visual and interaction design is yours, and you should do your
own research on top of this.

Where this says "must," it's because breaking it breaks the product's core promise or
ships a bug we already know competitors have. Where it says "suggested," override it
freely if you have something better. Files **05** and **07** are the binding ones;
everything else is a starting point.

## Read in this order

| File | What it's for |
|---|---|
| [01-mission-and-constraints.md](01-mission-and-constraints.md) | The mission and the hard constraints. **Read first** |
| [02-what-users-hate.md](02-what-users-hate.md) | stats.fm / last.fm complaint research → requirements |
| [03-user-flow.md](03-user-flow.md) | The journey and all 11 states to design |
| [04-what-to-show.md](04-what-to-show.md) | Every stat we can compute, and what we can't |
| [05-what-not-to-do.md](05-what-not-to-do.md) | Hard NOs + ship-blockers ⚠️ **binding** |
| [06-honest-copy.md](06-honest-copy.md) | Draft copy — rewrite the words, keep the honesty |
| [07-technical-contract.md](07-technical-contract.md) | Data shape + the 4 traps ⚠️ **binding** |
| [08-open-questions.md](08-open-questions.md) | Undecided — split between you and Moses |
| [09-cover-art.md](09-cover-art.md) | **Album art: solved, free, no server** |
| [10-freshness-system.md](10-freshness-system.md) | **Wrapped that never gets stale** |
| [11-design-system.md](11-design-system.md) | Free fonts, colour, icons, logo, a11y |
| [12-ads-and-adblock.md](12-ads-and-adblock.md) | Ad placement, adblock approach, full FAQ |

## The 30-second version

Users upload their Spotify data export (a zip). We parse it **entirely in their browser**,
show them beautiful stats, and never send their data anywhere. No login. No account. No
server. No paywall. Free forever, ad-supported.

**We do not use the Spotify API** — it caps apps at **5 users total**, which would end the
product. Everything comes from the user's own file. File 01 explains why this is the
enabling decision, not a compromise.

## Why this beats what exists

Almost every top complaint about stats.fm is caused by the Spotify API — the thing we're
not using:

- *"counts skipped tracks as fully listened"* → the API never reports how long a track played
- *"days of data constantly missing"* → its recent-plays window holds only 50 items
- *"too much access to my Spotify account"* → we ask for none

The export has the **real millisecond durations and the reason playback ended**. Those
bugs are structurally impossible for us. Add stats.fm's paywall on full history and
last.fm's data-loss stories, and the position is:

> **We can't lose your history because we never keep it. We can't be wrong about your
> skips because we read the real numbers. We can't start charging you because there's no
> server to pay for.**

Your design should make someone feel all three without reading a FAQ.

## The three things that need the most design thought

1. **Visual identity** (file 09 + 11) — cover art is available now, but a cover grid is
   what every music site looks like. What makes this one *ours*?
2. **The freshness system** (file 10) — the same data must feel different on every visit.
   This is the entire retention strategy, since there's no login or email list.
3. **The wrong-export error state** (file 03) — the most common failure, costs users days
   if unclear, and no competitor handles it well.

## Two things that are free and stay free

Hosting is a static site on Cloudflare Pages / GitHub Pages — **$0 at any traffic level**.
Cover art hotlinks Deezer's CDN — **$0, no key, no server**. The only cost in this project
is the domain.
