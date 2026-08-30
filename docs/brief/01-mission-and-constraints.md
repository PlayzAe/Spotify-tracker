# 01 — Mission and hard constraints

## The Emberfig method, applied

Emberfig's stated approach:

> "We find Android apps people rely on and are quietly frustrated by, read every complaint
> we can find, then build the version that answers them."

> "One person's annoyance is an opinion. Forty is a defect."

That's exactly what this is. The complaints have been read (file 02). This product is the
answer to them.

Emberfig's commitments that constrain this build:

> "Two developers. No investors. Everything we ship is free and paid for by advertising."

> "You never pay us and we never sell your data."

---

## Constraint 1 — No Spotify API. At all. Ever.

**This is not a preference. It is the reason the product can exist.**

Spotify's API allows **5 authorized users per app**. Not 5,000 — five. Lifting that cap
requires a registered business with **250,000 monthly active users** already, and Spotify
stopped accepting individual developers in May 2025.

So the choice is binary:

| With the API | Without the API |
|---|---|
| 5 users, total, forever | **Unlimited users** |
| Needs a server, OAuth, token storage | Needs nothing but a static site |
| Spotify can revoke it (they've cut access 3× in 21 months) | GDPR is a legal right — cannot be revoked |
| Costs money at scale | **$0 at any scale** |

The data export path has **no cap and no gatekeeper**. That's the whole product.

**What this means for you:** if a feature requires calling Spotify, it is out of scope —
not "later," not "v2." That includes the obvious ones (login, now-playing, recent tracks)
and the non-obvious one everybody forgets: **album artwork**. See file 04.

If a design idea would need the API, flag it and we'll find another way. Don't build
toward it.

## Constraint 2 — The file never leaves the browser

All parsing happens client-side in JavaScript. The zip is never uploaded. There is no
backend to upload it *to*.

This isn't just a privacy stance, it's the architecture: a static site on a free CDN
serves 100,000 users for the same $0 as it serves five. The moment we process files
server-side, we have storage costs, bandwidth costs, a security surface, a breach
liability, and a GDPR data-controller obligation.

**For you:** everything is client-side. Web Workers, in-memory parsing, no fetch calls
carrying user data. If you find yourself wanting to "just POST this small bit" — don't.
Bring it up instead.

## Constraint 3 — Free, with ads, no data selling

Emberfig is ad-funded. This site will likely carry AdSense.

**The honest tension, stated plainly so you can design around it:** "we never sell your
data" is true and stays true. But ad networks set cookies and collect their own signals.
Those are two different things, and users conflate them constantly.

So:

- **Their music data is never involved in advertising.** It never leaves the browser, so
  it structurally *cannot* be. Say so explicitly.
- Ads need a **consent banner (CMP)** for EEA/UK visitors. Design it as a first-class part
  of the UI, not a bolted-on dark-pattern strip.
- Ads must never sit inside the results view in a way that makes stats look sponsored, and
  must never be interstitials between upload and results.
- Never imply "no cookies at all" if AdSense is running. That's the one claim that would
  make the privacy promise a lie.

Getting this right is a differentiator — most free apps are sloppy here.

## Constraint 4 — Honesty about staleness is a feature

The export is a **snapshot**, frozen at the moment Spotify generated it. It does not
update. There is no live sync, and there cannot be one without the API.

stats.fm's single most damaging complaint pattern is users believing their stats are live
and finding gaps. We avoid that by never implying live in the first place.

**Design implication:** the "as of" date isn't fine print. It belongs **on the results
screen, visible, always**. See file 06.

---

## The one-sentence test

Every design decision should survive this question:

> **"Does this require the Spotify API, a server, or a payment?"**

If yes to any — it's out. If no to all three — it's fair game, and you have complete
freedom.
