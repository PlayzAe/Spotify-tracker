# PRD Set — Spotify Stats (Emberfig)

**Version 1.0 · 2026-08-17**

| Document | Owner | Covers |
|---|---|---|
| [00-product-prd.md](00-product-prd.md) | Moses | Vision, problem, scope, metrics, risks, release criteria |
| [01-frontend-prd.md](01-frontend-prd.md) | Freddy | UI, states, stats presentation, freshness, share, ads, a11y — **FE-1…FE-69** |
| [02-data-engine-prd.md](02-data-engine-prd.md) | — | Parse/normalize/aggregate pipeline + hosting — **DE-1…DE-29, PL-1…PL-10** |

Supporting material: [../research/spotify-platform/](../research/spotify-platform/)
(evidence) · [../brief/](../brief/) (design guidance and rationale).

---

## A note on "backend"

There isn't one, and that's the product's core architectural decision — not an omission.

No server, no database, no API. The work that would normally be backend splits into:

- **The data engine** — a real ETL pipeline over 200k+ records with genuine data-quality
  problems, which happens to run in a Web Worker instead of on a server
- **The platform** — static hosting, headers, deploy

Both are specified in [02-data-engine-prd.md](02-data-engine-prd.md).

**Why it matters:** having no server is what makes the product free at any scale, provably
private, and unlimited in users. A single server component would break all three at once.
Any proposal to add one is a scope change, not an implementation detail.

---

## The three constraints everything derives from

1. **Spotify's API caps apps at 5 users.** Lifting it needs 250k MAU and a registered
   business. So: no API — which also means no login, no live data, no genres, no
   completion %.
2. **No server.** So: no accounts, no social features, no stored history — and $0 cost
   whether 5 or 500,000 people use it.
3. **Free, ad-supported, no data selling.** So: nothing gated, and precise privacy claims
   rather than convenient ones.

## Requirement priorities

**P0** — ship-blocking · **P1** — v1.0 target, deferrable if needed · **P2** — v1.1+

## Before build starts

Two questions can invalidate work already done:

1. **Will AdSense approve a single-page utility site?** (Risk R2) — if not, the funding
   model needs rethinking. Cheapest thing to check, highest consequence.
2. **What's Deezer's cover match rate against a real Spotify export?** (U6) — determines
   how much design weight the generative fallback needs.

Both are hours of work now and weeks of rework later.
