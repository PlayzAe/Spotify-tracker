# 03 — User flow and every state to design

The hardest UX problem here is **the wait**. Spotify takes hours to several days to
deliver the export. A user who lands, gets excited, and discovers they must request a
file and come back later is the main drop-off point in the funnel.

Treat that gap as a design problem to solve, not a disclaimer to write.

---

## The journey

```
   LANDING  ──▶  REQUEST EXPORT  ──▶  [ WAIT: hours to ~5 days ]  ──▶  UPLOAD  ──▶  RESULTS
      │                │                         │                       │           │
   explain          instructions            the drop-off             parse in     explore,
   in <10s          + which one!             risk zone               browser      export image
```

## Stage 1 — Landing

The visitor must understand in about ten seconds: what this is, that it's free, that there's
no login, and that their data stays on their device.

Must be immediately apparent:
- No "Log in with Spotify" button anywhere — **its absence is the message**
- Free, with no tier or pricing hint
- Data never leaves the browser
- Roughly what they'll get (show real examples — see open question in file 08)

Deliberately not here: signup, email capture, cookie wall before content, interstitial ad.

**Design note:** most visitors arrive without a zip file. The primary call to action is
probably *"Get your Spotify data"*, with *"I already have my file"* as a secondary path —
but validate that ordering yourself.

## Stage 2 — Request instructions

Users get this wrong constantly, and it's the top cause of failed imports.

Spotify's privacy page offers **two different downloads**:

| Option | Contains | Right one? |
|---|---|---|
| **Account data** | ~30 days of history | ❌ **No** — this is the trap |
| **Extended streaming history** | Entire account lifetime | ✅ **Yes** |

Users who pick the wrong one wait days for a file that's nearly useless. Some receive only
a ReadMe PDF and have no idea why.

**Requirements:**
- Name the exact option, with emphasis, impossible to skim past
- Show what the correct checkbox looks like — a screenshot or illustration beats prose
- Set expectations on timing honestly: **usually hours to a few days; Spotify's stated
  maximum is 30 days**
- Explain it arrives by email as a download link

**Suggested (your call):** something to bridge the wait — a copyable reminder, a calendar
link, or just a memorable URL. Avoid anything requiring an email address from us; that
would contradict the no-data-collection promise.

## Stage 3 — Upload

Drag-and-drop plus a file picker. Accept the whole `.zip` as downloaded — do not ask
users to unzip, hunt for JSON files, or rename anything. "Unzipping and finding the right
file" is a documented failure point for competitors.

Must handle:
- The zip, unmodified ✅
- Multiple zips (Spotify sometimes splits large exports across files) ✅
- Loose `.json` files, for the technical minority ✅

Reassurance belongs **at the drop zone**, at the moment of hesitation — not only in the
footer. Something to the effect of: *this file is read on your device and never uploaded.*

## Stage 4 — Parsing

A 10-year history can be 150 MB+ of JSON. This takes real time and must never look frozen.

**Requirements:**
- Progress must be **real**, not a fake spinner — files parsed, plays counted so far
- Must not block the UI (Web Worker — see file 07)
- Must work on mid-range mobile without crashing
- **Live counters are a delight opportunity** — watching "1,284,391 plays" tick upward is
  genuinely satisfying and covers the wait. Suggested, not required.

## Stage 5 — Results

Yours to design. Requirements in file 04. Two non-negotiables:

1. **The "data as of" date is always visible.** Not in a tooltip, not in a footer.
2. **Nothing is gated, blurred, teased, or locked.**

## Stage 6 — Return visits

The file is gone on refresh — nothing persists by default.

Options (see file 08, needs a decision):
- Re-upload each time (simplest, purest, mildly annoying)
- Offer opt-in local caching via IndexedDB — **stays on device**, still no server, with
  an obvious "clear my data" control

Either way: **never silently persist.** If anything is cached, say so and make deletion
one click.

---

## Every state you need to design

Competitors fail hardest here. Each of these needs a specific, actionable message —
never a generic error.

| State | Trigger | Message must convey |
|---|---|---|
| Empty | First landing | What this is, free, no login, private |
| Wrong export | Only ~30 days found, or account-data files | **"This looks like Account Data, not Extended Streaming History"** + how to request the right one. Highest-value error in the product |
| ReadMe only | Zip has no history JSON | Explain the request likely didn't include streaming history; link back to instructions |
| Wrong file type | Not a zip/json | What we accept |
| Parsing | Working | Real progress, plays counted |
| Partial success | Some files parsed, some malformed | **Show results anyway**, note what was skipped and why. Never discard good data over one bad file |
| Empty history | Valid file, no plays in range | Distinguish "new account" from "wrong export" |
| Too large / OOM | Memory exhausted | Suggest desktop, or offer chunked processing. Never just crash |
| Very small dataset | e.g. <50 plays | Some stats aren't meaningful yet — say which, don't show noise as insight |
| Old data | Export is months old | Gentle note that a fresh export shows recent listening |
| Success | Parsed | Results + snapshot date |

**On the "wrong export" state:** this is the single most valuable piece of UX in the
product. It's the most common failure, it costs the user days if unclear, and no
competitor handles it well. Worth disproportionate design attention.
