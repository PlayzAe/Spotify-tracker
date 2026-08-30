# Docs

Background, in the order it is worth reading.

## If you are picking up the frontend

1. **[brief/11-design-system.md](brief/11-design-system.md)** — palette, type, spacing.
   `app/src/style.css` is the implementation of this.
2. **[brief/05-what-not-to-do.md](brief/05-what-not-to-do.md)** — the shortest path
   to not repeating a mistake already made once.
3. **[brief/06-honest-copy.md](brief/06-honest-copy.md)** — the copy register. The
   product's whole position is that it tells the truth plainly, and the wording
   carries that as much as the architecture does.
4. **[brief/03-user-flow.md](brief/03-user-flow.md)** — every screen and state,
   including the error screens.

## If you want to know why it works this way

- **[prd/](prd/)** — what the product is. Start at `00-product-prd.md`.
- **[research/spotify-platform/decision.md](research/spotify-platform/decision.md)** —
  why this reads an export file instead of using Spotify's API. Short version: the
  API caps a non-approved app at 5 users, which makes a public product impossible.
- **[research/spotify-platform/sources/](research/spotify-platform/sources/)** — the
  evidence behind that, including the export format itself (`04_gdpr_zip_format.md`).

## A note on these documents

They were written before the app was built, and parts have been overtaken by it.
Where a document and the code disagree, **the code is right** — it was checked
against a real 616,988-record export and these were not. Two known drifts:

- The PRD contains an early version of the track-key regex that destroys the artist
  name. `app/src/engine/normalize.js` has the corrected version, and a test for it.
- DE-18 in the data-engine PRD says arbitrary date ranges are out of scope. They
  were built anyway; see `rangeBoundSec` in `normalize.js`.

`reference/` holds screenshots of competing apps, kept as evidence for what the
brief says not to do.
