# 08 — Open questions

Not yet decided. Some are Freddy's call, some are Moses's.

---

## ✅ Resolved since the first draft

| Was | Now |
|---|---|
| "No album art is possible" | **Solved** — free, client-side, via Deezer JSONP. See [09](09-cover-art.md) |
| "Should we use a third-party art source?" | **Yes** — on by default, disclosed, with an off switch |
| "How do we keep it from getting boring?" | **The freshness system** — [10](10-freshness-system.md) |

---

## For Freddy

### Q1 — The visual identity ⭐ *still the big one*

Cover art is available now, but a grid of album covers is what every music-stats site
looks like. What makes this one recognisable at a glance?

Worth considering: covers as *texture* rather than as the main subject; a strong display
typeface carrying the design; the generative fallback tiles as a deliberate visual motif
mixed with real covers. See [11](11-design-system.md) for free type and colour resources.

**Entirely your call. This is the most creative decision in the project.**

### Q2 — Results layout: scroll, dashboard, or story?

Interacts heavily with the freshness system ([10](10-freshness-system.md)).

- **Story-first** suits the rotating deck and shares well
- **Dashboard** suits repeat/power use
- Possibly story on first visit, dashboard after

### Q3 — What's on the shareable image?

The entire growth mechanism. Contents, aspect ratio, how many variants? Should reflect
today's rotating cards so shares vary too. Exclude incognito plays and location by default.

### Q4 — Landing page without a live demo

Most visitors can't try it for days (they need to request the export first). Sample data?
A demo on a fictional history? This drives the whole funnel.

### Q5 — Mobile large-file strategy

If 150 MB won't parse on a low-end phone: warn early, process a subset, or send to
desktop? Decide before users discover it.

### Q11 — How many cards, and how deep does the deck go at launch?

[10](10-freshness-system.md) proposes 40–60 possible cards. That's a lot to build. What's
the minimum viable deck that still feels fresh across, say, five visits? My guess is
~15–20 with strong conditional rules beats 50 generic ones — but you'll have a better
sense once you're building them.

---

## For Moses

### Q6 — Local caching on return visits?

Refresh currently loses everything. Opt-in IndexedDB (stays on device, still no server) or
strictly ephemeral? **Recommend opt-in, default off, one-click clear.**

Note this interacts with [10](10-freshness-system.md): return visits are much more
appealing if the file is still loaded.

### Q7 — Ads on the results page, or only around it?

Results are the screenshot surface. See [12](12-ads-and-adblock.md) for the rules — my
recommendation is landing + between-sections + the waiting page, keeping results and the
share image clean.

### Q12 — Spotify brand/attribution rules

We don't use the API, but we do display their data and will inevitably use the word
"Spotify." Their developer and brand guidelines set rules on naming, logo use, and
required attribution. **Worth confirming before launch** — cheap to check, annoying to
retrofit.

Also settle the product name. It should not imply an official relationship.

### Q13 — Deezer attribution?

We hotlink their CDN images under their public API. Check whether their guidelines require
visible attribution, and add it if so. Low effort, avoids a takedown.

### Q9 — Apple Music / YouTube Music later?

Both offer exports. Same architecture, different parser. Worth knowing now so the parsing
layer isn't hard-wired to Spotify field names.

### Q10 — Open-source the client?

Makes the privacy claim **verifiable** rather than promised — the single strongest trust
signal available, and it fits Emberfig's transparency posture. Referenced in the FAQ
([12](12-ads-and-adblock.md)).

---

## Known unknowns

| # | Unknown | Impact |
|---|---|---|
| U1 | Real-world zip size distribution | Drives mobile strategy (Q5) |
| U2 | Whether Spotify's export format changes | Parser must log unknown fields; it has drifted before |
| U3 | How many users request the wrong export | If high, that instruction needs even more weight |
| U4 | **Whether AdSense approves a single-page utility site** | Affects the funding model — **check early** |
| U5 | Mid-range mobile parse performance | Unmeasured. Test before committing to mobile-first |
| U6 | Deezer match rate against real Spotify libraries | If low, fallback tiles matter more than expected. Test with a real export |

**U4 and U6 are both worth resolving before serious build.** U4 decides whether the
funding model works at all; U6 decides how much design weight the fallback needs.

---

## Settled — don't reopen

- No Spotify API, ever (5-user cap)
- No server, no file upload
- No paywall, no accounts, no adblock gating
- Snapshot data, never live
- Free forever

From `../research/spotify-platform/`. These aren't preferences — they're what makes
the product possible.
