# 02 — What users hate about stats.fm and last.fm

Sourced from Trustpilot, app-store reviews, Reddit, the Spotify community forums, and
stats.fm's own public feedback board. Themes are summarized, not quoted at length.

**The headline finding:** almost every top complaint about stats.fm is a *direct
consequence of using the Spotify API*. We don't use the API. **These bugs are
structurally impossible for us** — and that's the marketing story, not just the
engineering one.

---

## stats.fm — the complaint clusters

### A. Wrong numbers (the biggest cluster)

- Skipped tracks counted as fully listened
- Days of data missing; sometimes only one or two songs logged from an entire day
- Lifetime totals lower than the user's own Spotify Wrapped
- Trends and minutes described as incomplete or inaccurate

**Root cause:** Spotify's API tells you *that* a track played, never *how long*. And its
recent-plays window holds only 50 items — poll too slowly and plays vanish permanently.
So the app has to guess at listening time, and it drops data during gaps.

**Why we're immune:** the export contains the true millisecond play duration for every
play, plus why playback ended. We don't guess and we can't miss plays — it's a complete
historical record, not a sampled feed.

> **This is the single strongest thing we have. Design should lead with it.**

### B. Import is painful and opaque

- Uploads that get stuck with no feedback
- Users unsure whether it worked
- Users receiving only a ReadMe PDF and not realizing they requested the wrong export
- Chunks of history missing after import with no explanation

**Requirement:** the import flow is *the* product surface. It must show live progress,
say exactly what it found, and name the specific problem when something's wrong. See
file 03.

### C. Paywall resentment

stats.fm Plus is roughly $4.99, and **full listening history is behind it** — users pay to
see their own data, then hit the accuracy bugs in cluster A. That combination generates
the angriest reviews: paying for a broken core feature.

**Requirement:** everything free. No tiers, no "Plus," no locked stats, no teaser blur.
Nothing gated. See file 05.

### D. Permissions and trust

- Users uncomfortable with the level of Spotify account access requested, including write
  access
- Concern about what happens to that access in a breach
- Reports of users being banned from the community Discord after raising concerns

**Requirement:** we ask for **zero** account access — there's no login at all. That's a
bigger trust win than any privacy-policy wording, and the UI should make it obvious
immediately. And however feedback gets handled, it doesn't get suppressed.

### E. Neglect

Long-standing bugs unfixed, feature requests ignored, users feeling unheard while new
subscribers keep arriving.

**Requirement:** ship a visible, low-friction feedback path. Emberfig's framing —
*"One specific failure, not a general feeling"* — should shape the form: ask for the
specific thing that broke.

---

## last.fm — the complaint clusters

### F. Data loss (catastrophic and unforgiven)

- Scrobbles lost permanently when submission fails
- One reported account dropping from 15,582 scrobbles to 207
- Random outages, double-counted scrobbles, skipped songs

**Why we're immune:** we don't store anything, so there's nothing to lose. The user's own
zip is the backup, and it's on their machine. Worth stating plainly — "we can't lose your
history because we never keep it" is a real, checkable claim.

### G. Wrong metadata

Artists misattributed when names collide, corrupting statistics.

**Requirement:** be careful with name normalization (file 07). Over-merging creates
exactly this bug. When unsure, keep entries separate.

### H. Poor communication

Outages without explanation, no meaningful updates, opaque support.

**Requirement:** every error state in the UI explains what happened and what to do next.
No generic "something went wrong."

---

## Requirements this generates

| # | Requirement | From |
|---|---|---|
| R1 | Lead with accuracy — real listening time and real skips, stated as a differentiator | A, F |
| R2 | Import flow is the core UX: live progress, explicit findings, specific errors | B |
| R3 | Zero paywall, zero gating, zero teasers | C |
| R4 | Zero login, zero permissions — make this visible instantly | D |
| R5 | Visible feedback path asking for specific failures | E |
| R6 | "We never store it, so we can't lose it" as an explicit promise | F |
| R7 | Conservative name matching; don't over-merge artists | G |
| R8 | Every error explains cause and next step | B, H |
| R9 | Never imply live data; show the snapshot date always | A, B |

---

## The positioning in one line

> **stats.fm guesses at your listening from a feed that drops data, then charges you for
> the full picture. We read the real numbers from your own file, show you everything, and
> never see it.**

Design should communicate that without a comparison table — through the absence of a
login button, the absence of a price, and the presence of an honest "data as of" date.
