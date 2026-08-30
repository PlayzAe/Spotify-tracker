# 11 — Design system: free tools, best practices

**Everything here is free for commercial use.** The only project cost is the domain.

Freddy — these are options and principles, not prescriptions. Pick what fits your
direction. The **licensing notes and accessibility rules are the parts to actually
follow**; the specific font and colour picks are just a starting shelf.

---

## Typography

### Where to get fonts (free, commercial-use)

| Source | Licence | Notes |
|---|---|---|
| **Google Fonts** | OFL / Apache 2.0 | 1,500+ families, no fees, self-hostable |
| **Fontshare** | Free commercial | Curated rather than endless — higher hit rate |
| **Velvetyne** | Open | Experimental/characterful — good for a distinctive display face |
| **The League of Moveable Type** | OFL | Small, solid classics |

**Self-host the files** rather than using Google's CDN. Two reasons: no third-party
request on load (consistent with the privacy story), and faster + no layout shift.

### Solid picks

**Interface/body:** Inter, Geist, Instrument Sans, Plus Jakarta Sans, DM Sans, Satoshi,
General Sans, Switzer
**Display/editorial:** Fraunces, Playfair Display, Clash Display, Instrument Serif
**Numerals:** anything with **tabular figures** — this page is mostly numbers, and
non-tabular digits make columns jitter

### Best practices

- **Prefer variable fonts** — one file, every weight, smaller payload
- **Two families maximum.** One display + one text. Three looks amateur
- `font-variant-numeric: tabular-nums` on every stat
- Body text ≥16px; don't go below 14px anywhere
- Line length 60–75 characters for readable prose

**A thought, not an instruction:** with cover art now available but imperfect, a strong
display face doing heavy lifting is what will make this look like *itself*. The most
memorable music sites are typographic, not image-grids.

---

## Colour

### Free tools

| Tool | For |
|---|---|
| **Radix Colors** | Accessible scales with dark mode built in — best starting point |
| **Tailwind palette** | Well-balanced defaults even without Tailwind |
| **Coolors** | Fast exploration |
| **APCA contrast checker** | More accurate than WCAG 2 for modern displays |
| **Leonardo** (Adobe, free) | Generates accessible scales from brand colours |

### Best practices

- **Design dark-first.** Music apps are used at night, and Spotify's own aesthetic sets
  the expectation. Support both, but lead dark
- **Both themes must ship.** Respect `prefers-color-scheme`, plus a manual toggle
- **Never encode meaning in colour alone** — always pair with text, icon, or position
- **Contrast: 4.5:1** body text, **3:1** large text and UI boundaries. Non-negotiable
- Test the generative palettes (file 09) against contrast rules — generated colours are
  where accessibility usually breaks

### On the Emberfig connection

The site should feel related to emberfig.com without being a clone. "Ember" suggests a
warm accent — worth exploring, but this product can have its own identity. Moses's call.

---

## Icons

All free, MIT/ISC licensed: **Lucide** (clean, huge, actively maintained — safe default),
**Phosphor** (multiple weights), **Radix Icons** (minimal, pairs with Radix Colors).

Pick **one set**. Mixed icon sets always look mixed.

---

## Logo

Free routes, roughly in order of quality:

1. **Typographic wordmark** — set the name in your display font, adjust the spacing. Costs
   nothing, looks intentional, scales perfectly. **Recommended.**
2. **Wordmark + simple geometric mark** — a shape that reads at 16px favicon size
3. Free generators (Hatchful, Looka free tier) — usually generic, fine as placeholder

Requirements: works at 16px, works in one colour, works on dark and light, SVG.

**Avoid:** anything resembling Spotify's mark or wordmark, and the Spotify green as a
primary brand colour. Beyond the legal risk, looking like an official Spotify product
undermines the "we're independent and we don't touch your account" message.

**Spotify attribution:** check their developer/brand guidelines for what's required when
displaying their data. We're not using the API, but naming and logo use still have rules.
Worth confirming before launch — see file 08.

---

## Layout and motion

- **Mobile-first.** Most traffic will be phones, and the share image gets made there
- Respect `prefers-reduced-motion` — no exceptions
- Motion should be fast and purposeful: 150–250ms. Nothing that delays reading a number
- **Skeleton states, not spinners**, for cover art loading
- Reveal animations on stat cards are worth it — but must never block interaction

## Performance

The parse is already heavy (file 07). Everything else should be light.

- No UI framework unless it earns its weight — vanilla or something small is plenty
- Zero third-party scripts beyond ads + consent
- Self-host fonts; subset them
- Lazy-load cover art
- Target: interactive in **under 2 seconds** on mid-range mobile over 4G

## Accessibility — non-negotiable

- Full keyboard navigation, visible focus states
- Real semantic HTML: `<button>` for buttons, headings in order
- Charts need text alternatives — a screen reader user should get the numbers
- File upload reachable by keyboard, not drag-only
- Test with a screen reader before launch

This isn't box-ticking. A stats site that only works with a mouse and perfect eyesight
excludes people from seeing their own listening history.
