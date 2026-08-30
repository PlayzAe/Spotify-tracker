# 06 — Honest copy (drafts)

**Rewrite the wording freely. Keep the honesty.** These drafts exist so nothing important
gets accidentally softened into a claim we can't back.

---

## Privacy — the core promise

> **Your data never leaves your device.**
> The file you upload is read by your own browser. It isn't sent to us, stored by us, or
> seen by us — we don't run a server that could receive it. Close the tab and it's gone.

Supporting line if needed:

> We don't have accounts, so there's nothing to hack. We don't store your history, so we
> can't lose it. We don't sell your data — we never receive it in the first place.

**Do not weaken to:** "we take your privacy seriously," "industry-standard encryption,"
"we may share with trusted partners." Every one of those is what a company says when the
data *does* leave. Ours doesn't. Say the specific thing.

## Ads — the honest version

> This site is free and paid for by ads. Ads may set cookies, and you can decline them
> below. **Your listening data is never part of that** — it never leaves your browser, so
> advertisers can't see it even if they wanted to.

Distinguishes the two things users conflate. Don't claim "no tracking" while running
AdSense.

## Cover art disclosure — required if artwork is on

> **Album artwork** — your browser fetches covers directly from Deezer's public music
> catalogue. Only the album name is sent, and only for albums shown on screen. Your
> listening history, play counts, and timestamps are never included — and never reach us
> either. [Turn artwork off]

Precise about what is and isn't sent. Do **not** shorten this to "we fetch artwork" — the
value is in the specificity.

## No login

> **No account. No password. No Spotify permissions.**
> We never ask to connect to your Spotify account, so we can't post, change, or read
> anything in it.

## Data freshness — always visible on results

> **Showing your listening through {DATE}.**
> This is a snapshot from the file you uploaded. It won't update on its own — request a
> fresh export from Spotify whenever you want newer numbers.

Persistent element on the results screen. Not a tooltip.

## Why there's no "recent songs"

Users will ask. Answer directly:

> **Why can't I see what I played today?**
> Live data needs Spotify's API, and Spotify limits API apps to **5 users total** — which
> would mean this site couldn't exist for everyone else. Your data export has no such
> limit, so we use that instead. The trade: your full history, forever, free — but as a
> snapshot rather than live.

Turns a limitation into a reason to trust the product.

## Why some covers are missing

> **Why doesn't this album have a cover?**
> Covers come from Deezer's public music catalogue, not from Spotify. Most albums are
> there — but local files, very obscure releases, and podcasts often aren't. You can turn
> artwork off completely in settings.

## Requesting the right export — the critical instruction

> **Choose "Extended streaming history" — not "Account data."**
> They're separate checkboxes on the same page. Account data only covers about the last
> month. Extended streaming history goes back to the day you joined Spotify — that's the
> one we need.
>
> Spotify emails a download link. **Usually a few hours to a few days**; they're allowed
> up to 30 days.

Emphasize the distinction visually. This is the top failure point.

## Error states

**Wrong export:**
> This looks like your **Account data**, which only holds about a month of history. You'll
> want **Extended streaming history** instead — it's a separate request on the same
> Spotify page. Here's how →

**ReadMe only:**
> This zip doesn't contain any streaming history — just Spotify's information PDF. That
> usually means "Extended streaming history" wasn't selected when the data was requested.

**Partial parse:**
> Read {N} of {M} files. {X} plays loaded. One file couldn't be read and was skipped —
> your stats below cover everything else.

**Too large:**
> This file is {SIZE}, which is more than this device can handle in one go. Try a
> computer, or {chunked option}.

**Sparse data:**
> There are only {N} plays here — some stats need more history to mean anything, so
> they're hidden for now.

## Feedback — per Emberfig's framing

> **Something wrong?** Tell us the specific thing that broke — what you did, what you
> expected, what happened instead. One specific failure is worth more than a general
> feeling.

---

## Tone

Emberfig's voice is technical but conversational, direct, no marketing inflation. Match it:

- **Plain and specific** — "never leaves your device," not "privacy-first architecture"
- **Confident, not boastful** — state facts; the facts are good enough
- **Never defensive about limits** — every limitation has an honest reason; give it
- **Warm about their music** — this is someone's listening life, not a dataset

Avoid: "revolutionary," "powerful analytics," "unlock," "premium," "seamless." Especially
"unlock" and "premium" — they imply a paywall that doesn't exist.
