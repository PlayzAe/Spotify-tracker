# Longplay

Turns a Spotify data export into your complete listening history — every song,
artist, album and habit, going back to the day you joined. No account, no login,
no upload. The file is read in the browser and never leaves the device.

By **Emberfig**. Alpha 1.0.

---

## Start here

```bash
cd app
npm install
npm run dev
```

Opens on <http://localhost:5173>. Node 20.19+ (24 LTS is what it was built on).

To try it you need a real export. There is a walkthrough in the app itself at
`#/get`, but the short version: Spotify → Account → Privacy → tick **Extended
streaming history**, not "Account data". The email takes a few hours to a few days.

```bash
npm test        # 277 tests, ~1s
npm run build   # static output in app/dist — no server needed to host it
```

---

## Folder map

| Path | What it is |
|---|---|
| `app/` | The product. Everything that ships. |
| `app/src/engine/` | Parsing and querying. No DOM, no framework, no network. |
| `app/src/ui/` | Rendering, charts, routing, presence widgets. |
| `app/test/` | The suite. Run it before and after you change anything. |
| `docs/prd/` | What the product is and why. |
| `docs/brief/` | The frontend brief — constraints, copy register, design system. |
| `docs/research/` | Why the architecture is what it is, plus the source notes. |

---

## Before you change anything

**The engine is load-bearing and the UI is not.** `app/src/engine/` is the part
that took the longest to get right and has the most subtle failure modes — date
boundaries, integer overflow, skip detection, track-name normalisation. Every one
of those bugs was silent: wrong numbers, no error. That is what the tests are for.

Everything in `app/src/ui/` is fair game. Restyle it, restructure it, replace it.

**Run `npm test` before you start and after you finish.** If it was green and now
it is not, you changed behaviour, not appearance. A few of the tests read the CSS
and HTML as text — they are guardrails for things that regress silently:

- `transition: all`, and transitions on layout properties
- inputs under 16px (iOS Safari auto-zooms and never fully returns)
- untinted browser surfaces — selection, caret, scrollbars, focus rings
- duplicate attributes on one element (the browser drops the second, no error)
- the fonts, so nobody swaps in the ones every generated page uses

If one of those fires on a change you meant to make, the test is wrong and you
should change it. It is there to make the decision conscious, not to forbid it.

---

## Ground rules that are not style choices

1. **Nothing about a person's listening leaves the browser.** The privacy claim on
   the front page is load-bearing — it is why this product can exist without
   Spotify's API. The only outbound request in the whole app is album art, which
   sends an artist and album name to Deezer for what is on screen, and can be
   switched off.
2. **No API keys in the client.** The Discord presence uses Lanyard's public read
   endpoint. There is a test asserting no key string ever reaches the DOM.
3. **Animate `transform` and `opacity` only.** Lists here run to thousands of rows.
4. **Mobile is not a smaller desktop.** Check every change at 393×852 (iPhone 15
   Pro). Entrance animations are deliberately disabled under 700px.

---

## Known gaps

- Filters and the active tab are not in the URL, so they do not survive a refresh
  or a share. This was deliberate — a refresh is supposed to start clean — but if
  you want deep-linking, that is the trade to reopen.
- Mobile memory has not been measured on a real device, only in a desktop browser.
- The ad-blocker notice has only been tested in its negative case.
