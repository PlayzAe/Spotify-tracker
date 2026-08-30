# 09 — Cover art: solved, free, no server

**Update: album artwork IS possible.** This supersedes the "no images" constraint in the
earlier draft of file 04.

The catch was never money — it's that a browser can't call most APIs directly because of
CORS. One free music API works around it. Here's the research.

---

## The options, tested against our constraints

Requirements: free forever · no API key · **works from the browser with no server** ·
no legal problem.

| Source | Free? | Key? | Browser-direct? | Verdict |
|---|---|---|---|---|
| **Deezer** | ✅ | ✅ none | ✅ **yes, via JSONP** | ✅ **USE THIS** |
| iTunes Search | ✅ | ✅ none | ❌ no CORS headers | Needs a server — rejected |
| Cover Art Archive | ✅ | ✅ none | ❌ no CORS headers | Rejected (details below) |
| Last.fm API | ✅ | ❌ key needed | partial | Artwork often placeholder now |
| Spotify | — | — | — | 5-user cap. Never |

### Why Cover Art Archive fails despite being the "right" answer philosophically

It's a MusicBrainz/Internet Archive project — genuinely open, no rate limits at all. But:

1. **No CORS headers.** ListenBrainz — MusicBrainz's own sister project — hits exactly
   this error in production: requests to `coverartarchive.org` blocked with *"No
   'Access-Control-Allow-Origin' header is present."*
2. **Requires an MBID first**, meaning a MusicBrainz lookup — which requires a custom
   `User-Agent` header. **Browsers forbid scripts from setting `User-Agent`.**

Two independent blockers. Not viable client-side. Worth documenting so nobody re-proposes it.

### Why Deezer works

Deezer's public catalogue API needs no key and supports **JSONP** — the pre-CORS technique
of loading a response via a `<script>` tag, which browsers permit cross-origin. Old
fashioned, still works, and requires zero backend.

```
https://api.deezer.com/search/album?q=<query>&output=jsonp&callback=<fn>
```

Returns `cover_small`, `cover_medium`, `cover_big`, `cover_xl` — CDN image URLs.

---

## Rules for using it

**Rate limit: ~50 requests per 5 seconds per IP.** Comfortable, but not unlimited.

1. **Only look up what's on screen.** Never the whole library. Top ~50 albums covers
   nearly all visible surface. A 200,000-play history still means ~50 lookups.
2. **Throttle** — a few per second, never a burst of 50.
3. **Cache in `localStorage`** keyed by `artist|album`. Repeat visits and re-renders cost
   nothing. Cache the *URL*, not the image.
4. **Hotlink from Deezer's CDN. Do not download, store, or re-host the images** —
   Deezer's terms prohibit storing them. Hotlinking is the intended use and costs us
   nothing.
5. **Always design for the miss.** Obscure tracks, local files, and podcasts return
   nothing. The fallback isn't an edge case — it's a normal state. See below.
6. **Lazy-load.** Only fetch when a card scrolls into view.
7. **Degrade silently.** If Deezer is down or blocked, the page must look intentional, not
   broken.

---

## The privacy question — read carefully

This is the one real trade, and the wording has to be exact.

**What happens:** the user's browser asks Deezer *"what's the cover for this album?"*
Deezer sees an IP address and an album name.

**What does not happen:** their listening history, play counts, timestamps, and file
never go anywhere. **We still have no server and still receive nothing.**

So this claim stays literally true:

> Your data never leaves your device. We have no server to receive it.

But this claim would now be false:

> ~~Your browser never contacts any third party.~~

**Requirements:**
- Disclose it plainly in the privacy section and FAQ — see file 06
- **Provide a toggle to turn artwork off.** Some users will want zero third-party
  requests, and honouring that costs us nothing
- Never send play counts, timestamps, or anything beyond the artist/album string
- Only look up displayed items — that's a privacy measure, not just a performance one

**Recommendation: on by default, clearly disclosed, one click to disable.** The lookups
carry no personal data and reveal far less than an ordinary web search. But the choice must
be real and easy to find.

Suggested wording:

> **Album artwork** — your browser fetches covers directly from Deezer's public music
> catalogue. Only the album name is sent, and only for albums shown on screen. Your
> listening history is never included. [Turn artwork off]

---

## Fallback design still matters

Even with Deezer, expect misses: local files, obscure releases, podcasts, regional gaps,
and users who disable artwork.

**So the generative/typographic fallback from file 04 is still needed** — not as the whole
design language now, but as a first-class state that must look deliberate.

Strong approach: make the fallback **deterministic from the track name** — same song, same
colours, every time. A grid mixing real covers and generated tiles then reads as a
consistent system rather than as loading failures.

Freddy: this is arguably more interesting than a plain cover grid, and it's what will make
the site look like itself rather than like every other music-stats page.
