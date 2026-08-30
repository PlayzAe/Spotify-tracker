# Source 05 — Zero-cost stack evaluation

**Verdict: H1 CONFIRMED — $0/month is genuinely achievable. But the prompt's recommended
stack (Render + Supabase + cron-job.org) is the wrong choice, for reasons that only
surface once the corrected sync cadence is applied.**

---

## S5.1 — Data volume (recomputed)

The prompt estimated 25 users × 12 months. Corrected to the real 5-user cap:

- 5 users × 365 days × ~50 plays/day ≈ **91,000 play rows/year**
- At ~250–500 bytes/row → **23–46 MB/year**, indexes included

Even at 10× the assumed listening rate this stays under 500 MB. **Storage is a non-issue
on every candidate.** The binding constraints are elsewhere: cron frequency, idle
suspension, and cold starts.

---

## S5.2 — Compute / cron layer

### Cloudflare Workers — **recommended**

> Free plan: **100,000 requests/day**, 10ms CPU time per request
> **Up to 3 cron triggers** on the free plan; **1-minute minimum cadence** as of 2026
> "scheduled invocations draw from your daily request allowance"

Decisive properties: **no cold start, no idle suspension, no spin-down, and a 1-minute
minimum cron interval on the free tier.** Nothing else evaluated has all four.

Constraint to respect: the 10ms CPU limit is per *request*, and is CPU time, not wall
time — time awaiting a Spotify HTTP response does not count against it. Sync work is
I/O-bound, so this fits, but heavy in-Worker JSON parsing of a large zip does not. The
architecture therefore splits zip ingestion from scheduled sync (see `architecture.md`).

### Vercel Hobby — **rejected for cron, viable for OAuth callback**

> "Cron jobs can only run once per day on the Hobby plan."
> Expressions like `0 * * * *` "will fail deployment with the error: Hobby accounts are
> limited to daily cron jobs."
> "Vercel cannot assure a timely cron job invocation... will trigger anywhere between
> 1:00 am and 1:59 am."

Once-daily was adequate for the prompt's (incorrect) bi-weekly design. It is **not**
adequate for the corrected cadence, which needs multiple runs per day. Rejected as the
scheduler.

Also relevant, and a real trap the prompt correctly flagged: Vercel's serverless body-size
limit (~4.5 MB) makes it unusable for direct zip upload.

### Render Free — **rejected**

> "Free web services spin down after 15 minutes of inactivity" with spin-up "taking about
> one minute"
> "750 free instance hours each calendar month"
> **"Cron jobs have no free tier and start at $1/mo"**

Two disqualifiers: Render's own cron product is **not free** (the prompt's §7.2 stack
assumes it is available; it is not — the prompt routes around this with cron-job.org, but
that adds an external dependency), and a ~60s cold start on a free web service is a poor
fit for an OAuth callback. The prompt's FAILURE 2 identifies the cold-start risk correctly
and proposes the right mitigation (put auth on an instant-start platform) — Cloudflare
makes the mitigation unnecessary by eliminating the problem.

### GitHub Actions — **rejected as primary, with a specific trap**

Free minutes are generous, but:

> "In a public repository, scheduled workflows are automatically disabled when no
> repository activity has occurred in 60 days."

> "'Activity' means a push, a release, a PR merge — anything that modifies the repository.
> Issue comments and stars don't count."

A finished, stable stats app is *exactly* the repo that goes 60 days without a commit. The
scheduler would silently disable itself precisely when the project succeeds. Sources
conflict on whether private repos are covered — GitHub's wording says "public," but
multiple reports claim broader application. **`[PARTIALLY VERIFIED]`** — and unattractive
regardless, since the failure is silent.

Usable as a **redundant backup trigger** if a keepalive commit workflow is added.

### cron-job.org — viable external fallback

Free, unlimited jobs, down to 60-second intervals. Retained as an optional independent
watchdog, not as the primary path.

---

## S5.3 — Database layer

### Cloudflare D1 — **recommended**

> Free tier: **5 GB storage, 5M rows read/day, 100K rows written/day**

Sizing against the corrected workload: ~91K rows/year total, and a sync writes at most a
few hundred rows. The single heaviest event is the initial zip import — one year of
history for one user is roughly 18K rows, comfortably inside the 100K/day write budget
even if several users import on the same day.

Decisive property: **D1 does not idle-suspend.** Co-located with Workers, so no egress or
connection-pooling concerns, and no separate service to keep alive.

### Supabase — **viable, with a self-inflicted wound**

> Free tier: 500 MB database, 1 GB file storage, 5 GB egress, 500K Edge Function
> invocations/month

> **"Free projects pause after 7 days of inactivity."** "any free tier project that
> receives no database requests for 7 consecutive days is automatically paused"

> When paused: "your database goes offline, **pg_cron jobs stop running**, and Edge
> Functions become unreachable"

> Unpausing requires logging into the dashboard **manually**

The prompt's FAILURE 6 catches this and proposes a keepalive ping. That works — but note
the sharper problem the prompt doesn't state: **`pg_cron` cannot self-rescue.** If the
scheduler lives inside the database, and the database pauses, the scheduler that would
have prevented the pause is itself offline. The keepalive must come from **outside**.
This makes Supabase's `pg_cron` (the prompt's §7.1 Option C) structurally unsuitable as
the primary scheduler.

Supabase remains a strong choice if Postgres is wanted, provided the scheduler is external
and a keepalive runs every ≤5 days. Its **Storage** product (1 GB free) is genuinely useful
for zip uploads — better than any alternative evaluated.

### Neon — **viable**

> "100 CU-hours/month per project, 0.5 GB storage per project, up to 100 projects"
> "compute scales to zero after 5 minutes of inactivity, so an idle prototype uses zero
> compute-hours"
> "Neon scales compute to zero but keeps the project reachable"

Better idle behaviour than Supabase — scale-to-zero without project suspension. Real
Postgres. The trade is a cold-start on first query after idle. Good fallback if Postgres
is required.

### Turso — **rejected**

> "Turso deprecated scale-to-zero for new users in early 2025. Existing users on legacy
> plans keep it, but new signups get always-on instances."

The prompt's §7.1 Option C cites Turso's "9 GB storage, 1 billion row reads/month." Those
figures reflect the older plan; terms have changed for new signups. **The prompt's Turso
numbers should not be relied on.**

### PlanetScale — **rejected**

The prompt flags this correctly with "VERIFY if still free as of 2025." PlanetScale
**removed its free tier in April 2024**. No longer a zero-cost option.

---

## S5.4 — Recommended stack vs the prompt's

| Layer | Prompt's choice | Recommended | Why changed |
|---|---|---|---|
| API + OAuth | Render free | **Cloudflare Workers** | No cold start (kills FAILURE 2 outright); no spin-down |
| Scheduler | cron-job.org → Render | **Workers Cron Triggers** | Free, 1-min minimum, same platform, no external dependency |
| Database | Supabase free | **Cloudflare D1** | No 7-day pause (kills FAILURE 6 outright); co-located |
| Zip upload | Supabase Storage | **Cloudflare R2** *or* Supabase Storage | R2 keeps one platform; Supabase Storage is fine if preferred |
| Keepalive ping | Required | **Not required** | Nothing in the stack idle-suspends |
| **Cost** | $0 | **$0** | — |

The prompt's stack *works*. The recommended stack works with **two fewer failure modes** —
it deletes FAILURE 2 (cold-start breaking OAuth) and FAILURE 6 (database pausing) by
construction rather than mitigating them with keepalives. Removing a failure mode beats
monitoring one.

**Migration note:** if Postgres is strongly preferred (richer SQL — `DATE_TRUNC`,
`FILTER`, window functions, and the gap-and-islands streak query are all more pleasant),
substitute Neon for D1 and keep Workers. The schema ships in both dialects for this
reason.
