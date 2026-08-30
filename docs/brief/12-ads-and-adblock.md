# 12 — Ads, adblock, and the FAQ

Ads pay for the site. They must never make it feel cheap, and the adblock conversation
must never feel like a hostage negotiation.

**We have an unusually strong hand here** — most sites asking you to disable your
blocker are also harvesting your data. We aren't, and we can prove it. Lead with that.

---

## Ad placement

### Rules

| Rule | Why |
|---|---|
| **Never between upload and results** | The payoff moment. An interstitial there is the single most resented pattern |
| **Never inside the stats grid** | Ads adjacent to stats make the stats look sponsored — and they get screenshotted and shared |
| **Never over a result** | No pop-ups, no overlays, no sticky covering content |
| **Reserve the space** | Fixed dimensions, always. Ads that inject and shove content are the top layout complaint everywhere |
| **Label them** | "Advertisement." Honesty is the brand |
| **Cap density** | One per viewport, maximum |

### Where they can go

✅ Landing page, below the fold · between major result sections (sparingly) · footer ·
a tasteful unit on the "waiting for your export" page — that's a genuinely idle moment

❌ Results header · inside share images · between upload steps · anywhere on first paint

**On the share image:** never place ads in or around it. It's the growth engine — it must
look clean enough that people want to post it.

---

## Adblock handling

Realistic expectations from published data: polite prompts recover roughly **20%**;
aggressive walls convert **10–20%** and get the overlay itself added to filter lists.
Page-locking walls annoy users and stop working.

**So: ask once, politely, dismissible, and never block anything.**

### The approach

1. **Detect** — standard bait-element technique
2. **Ask once per session.** Store dismissal. Never re-ask in the same visit
3. **Dismissible** — visible X, click-outside closes, Esc closes
4. **Never gate.** Everything works whether or not they comply. **This is a values
   position, not a tactic** — the product is free, full stop
5. **Explain, don't demand.** Two developers, no investors, ads keep it free
6. **Tie it to the privacy story.** This is our unique argument — the ads can't be
   targeted with their data, because we never receive it

### Draft copy — Freddy, rewrite the words, keep the substance

> **We noticed an ad blocker — that's completely fine.**
>
> This site is free and always will be. No accounts, no subscriptions, nothing locked.
> Two developers build it, and ads are the only thing keeping it online.
>
> **The ads you see are never based on your listening.** Your data never reaches us —
> everything happens in your browser, on your device. We couldn't target you with it if
> we wanted to.
>
> If you'd like to help, allowlisting us keeps the lights on. If not, no hard feelings —
> everything still works.
>
> `[Allowlist this site]`   `[No thanks]`

**Why this works:** it opens by conceding, states the honest economics, and makes an
argument nobody else can make. The last line removes the coercion — which, per the
research, is what actually converts.

### Timing

Show it **after results render**, not on landing. They've received the value; the ask is
now reciprocal rather than a toll gate. Never during upload or parsing.

---

## The FAQ

Users will arrive with the same questions. Answering them well *is* the trust-building.

Suggested — dedicated page plus inline where relevant.

### Privacy

**Where does my data go?**
> Nowhere. Your browser reads the file on your device. We have no server that could
> receive it. Close the tab and it's gone.

**Do you store my listening history?**
> No. Nothing is uploaded, nothing is saved on our side. That's also why we can't lose it
> — unlike services that store years of history and occasionally lose it.

**Do you sell my data?**
> We never receive it, so there's nothing to sell. That isn't a policy promise — it's how
> the site is built.

**Do you use cookies?**
> We don't set any ourselves. Our ad provider may, and you can decline them. Your
> listening data is never part of advertising.

**How can I verify this?**
> Open your browser's developer tools, Network tab, and upload your file. You'll see no
> upload. *(If open-sourced — see file 08 — link the code here. Strongest possible answer.)*

### Data and limits

**Why can't I see what I played today?**
> Live data needs Spotify's API, which limits apps to **5 users total**. We'd rather show
> your full history to everyone than live data to five people. Your export has no such
> limit.

**Why do I need to download a file?**
> Same reason. The export is the only way to get your complete history without the API's
> user cap — and it's more accurate, because it records how long you actually listened.

**My stats look different from Spotify Wrapped?**
> Wrapped counts a specific window with its own rules. We use the raw data in your export,
> including how long each track actually played.

**Some albums have no cover.**
> Covers come from Deezer's public catalogue. Obscure releases, local files, and podcasts
> often aren't there. You can turn artwork off entirely in settings.

**How do I get newer data?**
> Request a fresh export from Spotify and upload again. There's no automatic updating —
> that would require the API.

**Is this affiliated with Spotify?**
> No. Independent, unaffiliated, not endorsed by Spotify.

### Practical

**Is it really free?**
> Yes. No accounts, no premium tier, no locked features. Ads pay for it.

**Do I need an account?**
> No. There's no sign-up at all.

**My file is huge / the page froze.**
> Very large histories need memory. Try a desktop browser if a phone struggles.

**I got the wrong file.**
> You likely requested "Account data" instead of "Extended streaming history." They're
> separate options on Spotify's privacy page. Here's how →

---

## Tone reminder

Emberfig's voice: direct, technical, unhyped. In the FAQ that means **answering the actual
question in the first sentence**, then explaining. No "Great question!", no marketing
padding.

The FAQ is where most trust is won or lost. A user checking "do you sell my data" is
already suspicious — the answer needs to be specific and verifiable, not reassuring.
