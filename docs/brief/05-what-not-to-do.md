# 05 — What not to do

Hard NOs with reasons. If one of these seems wrong for a good reason, raise it — but none
should be broken quietly.

---

## Never — breaks the mission

### ❌ Never add "Log in with Spotify"

Caps the product at **5 users**, requires a server, and destroys the privacy story. Its
absence is a feature. Don't add it "just for artwork" or "just for recent tracks" — the
cap applies to any API use.

### ❌ Never upload the user's file

No server, no analytics beacon carrying music data, no error reporter attaching file
contents, no "anonymous" stats about their listening. The file stays in the browser.

Watch for accidental leaks: a crash reporter that serializes app state can exfiltrate
data without anyone intending it.

**The one permitted exception, and its exact boundary:** cover-art lookups send an
artist/album *name* to Deezer for albums currently on screen (file 09). That is metadata,
not history. **Never send play counts, timestamps, totals, rankings, or anything derived
from how the user listened** — and never look up the whole library, only what's displayed.
If a lookup would reveal *how much* someone played something, it's over the line.

### ❌ Never paywall, gate, tease, or blur

No Plus tier, no locked stats, no "upgrade to see your full history," no blurred previews.
This is stats.fm's angriest complaint cluster — users paying to see their own data, then
hitting bugs.

**Also no soft versions:** no email-for-access, no share-to-unlock, no watermark removal fee.

### ❌ Never imply the data is live

No "updating…", no relative timestamps that suggest currency, no "last synced." It's a
snapshot. Say so.

### ❌ Never claim "no cookies" if ads are running

The claim is "we never collect or sell **your music data**" — which is structurally true.
Don't overreach into claims the ad script contradicts. One provably false privacy claim
costs more trust than the ads earn.

Same applies to cover art: don't claim "your browser contacts nobody" while Deezer
lookups are on. Say what actually happens — it's still a far stronger claim than any
competitor can make.

### ❌ Never gate anything behind disabling an ad blocker

Ask once, politely, dismissibly (file 12). Everything must keep working either way. A
paywall and an adblock wall are the same thing wearing different clothes.

---

## Never — poor craft

### ❌ Never show a generic error

Every failure names what happened and what to do. Especially the wrong-export case, which
costs the user days if unclear.

### ❌ Never discard everything over one bad file

Partial parse → show what worked, note what didn't. Competitors fail whole imports on one
malformed record.

### ❌ Never fake progress

A spinner with no real signal, on a 150 MB parse, reads as frozen. Show actual counts.

### ❌ Never make users unzip or find files

Accept the zip as downloaded. "Unzipping and locating the right JSON" is a documented
competitor failure point.

### ❌ Never require desktop without saying so

If mobile can't handle very large files, detect and explain before the user waits five
minutes for a crash.

### ❌ Never over-merge artist names

last.fm's misattribution complaints come from aggressive matching. When unsure, keep
separate. Under-merging is a cosmetic flaw; over-merging is wrong data.

---

## Handle with care

### ⚠️ Incognito-mode plays

The export includes `incognito_mode`. These are plays the user deliberately hid.

Surfacing them prominently — or worse, in a shareable image — could expose something
personal on a shared screen. Suggested: exclude from headline stats and share images by
default; make inclusion an explicit opt-in.

### ⚠️ Location data

`conn_country` is a travel history. Interesting, but think before putting it in a
share image by default.

### ⚠️ "You skipped this artist 400 times"

Fun framing can land as judgemental. Keep the tone warm. The user's listening is not a
performance to be graded.

### ⚠️ Ad placement

Never between upload and results. Never inside the stats grid where it could read as
sponsored. Never an interstitial over a result. Ads live in stable, labelled slots.

---

## Ship-blockers

If any of these is true, it doesn't ship:

- [ ] Any network request carries user music data
- [ ] Any feature requires Spotify login
- [ ] Any stat is locked behind payment or email
- [ ] The snapshot date isn't visible on results
- [ ] A wrong-export upload produces a generic error
- [ ] A privacy claim is made that the ad script contradicts
