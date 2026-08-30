# Architecture — Spotify Stats Backend ($0/month infrastructure)

---

## System diagram

```
                    ┌──────────────────────────────────────────────┐
                    │           CLOUDFLARE (single platform)        │
                    │                                               │
   user's browser   │   ┌─────────────────────────────────────┐    │
        │           │   │  Worker: /auth/*                    │    │
        ├──login────┼──▶│   /auth/login    -> Spotify consent │    │
        │           │   │   /auth/callback <- code + state    │    │
        │           │   │   exchanges code, encrypts tokens   │    │
        │           │   └──────────────┬──────────────────────┘    │
        │           │                  │                            │
        │           │   ┌──────────────▼──────────────────────┐    │
        ├──stats────┼──▶│  Worker: /api/stats/*               │    │
        │           │   │  reads user_stats_cache ONLY        │    │
        │           │   │  never calls Spotify on a page load │    │
        │           │   └──────────────┬──────────────────────┘    │
        │           │                  │                            │
        │           │            ┌─────▼──────┐                     │
        │           │            │  D1 (SQL)  │◀────────┐           │
        │           │            └─────▲──────┘         │           │
        │           │                  │                │           │
        ├──zip──────┼──▶ R2 bucket ────┤                │           │
        │  (direct  │      │           │                │           │
        │  presigned│      ▼           │                │           │
        │   PUT)    │  ┌────────────────────────┐       │           │
                    │  │ Worker: zip ingest     │───────┘           │
                    │  │ streams, parses, dedups│                   │
                    │  └────────────────────────┘                   │
                    │                                               │
                    │  ┌────────────────────────────────────────┐  │
                    │  │  CRON TRIGGERS                          │  │
                    │  │   0 * * * *    -> ingest (hourly)      │──┼──▶ Spotify
                    │  │   0 * * * *    -> enrich (20 tracks)   │  │    Web API
                    │  │   0 3 */14 * * -> recompute stats      │  │
                    │  │   0 4 * * *    -> freshness watchdog   │  │
                    │  └────────────────────────────────────────┘  │
                    └──────────────────────────────────────────────┘

     ┌──────────────────────────┐        ┌──────────────────────────┐
     │  GDPR EXTENDED HISTORY   │        │  SPOTIFY WEB API         │
     │  account lifetime →      │        │  recently-played (50 max)│
     │  export date             │        │  measured watermark →now │
     │  TRUE ms_played          │        │  play events only        │
     │  PRIMARY SOURCE          │        │  INCREMENT               │
     └──────────────────────────┘        └──────────────────────────┘
```

---

## The two decisions that carry the design

### 1. Spotify is never called on a user request

Inherited unchanged from the original prompt — it was right, and it is the most important
decision in the document. Page loads read `user_stats_cache`. Only cron jobs talk to
Spotify.

This now protects against more than rate limiting: since July 2026 quota is pooled across
the entire **developer account**, so an unbounded call path would risk every app the owner
runs, not just this one.

### 2. The GDPR export is the primary source, not a bootstrap

This inverts the original prompt's model, and it follows from two independent findings:

- **The API cannot supply duration.** `recently-played` reports *that* a track played, not
  *how long*. Only the export has true `ms_played` — the input to MOST LISTENED, MOST
  SKIPPED and COMPLETION RATE.
- **The export is durable; endpoints are not.** GDPR Article 15/20 is a legal right.
  Endpoints have been withdrawn three times in 21 months with under a month's notice.

So: periodic re-export **upgrades** API-captured rows with true durations. The API's job is
to guarantee no play is *missed* between exports; the export's job is to make plays
*accurate*. Neither alone is sufficient — and the original prompt's "one-time import"
framing quietly loses the duration data forever.

---

## Component choices

| Layer | Choice | Free-tier headroom | Why not the alternative |
|---|---|---|---|
| Compute + API | **Cloudflare Workers** | 100K req/day vs ~200 used | Render free: 15-min spin-down, ~60s cold start on OAuth callback |
| Scheduler | **Workers Cron Triggers** | 3 triggers, 1-min min | Vercel Hobby: daily only. Render Cron: **not free**. GH Actions: auto-disables at 60 days idle |
| Database | **Cloudflare D1** | 5 GB / 100K writes-day vs ~46 MB / ~18K peak | Supabase free: **pauses after 7 days idle**, and internal `pg_cron` can't self-rescue |
| Zip storage | **R2** (or Supabase Storage) | 10 GB vs ~200 MB | Function body limits (Vercel ~4.5 MB) make direct upload impossible |
| Auth | **Own OAuth** (Auth Code + secret) | — | No third-party auth service needed or wanted |
| Keepalive | **none required** | — | Nothing in this stack idle-suspends |

**Postgres variant:** swap D1 → **Neon** (scale-to-zero, stays reachable), keep everything
else. Worth it if the richer SQL matters — `FILTER`, `DATE_TRUNC`, and the gap-and-islands
streak query are all cleaner. `schema.sql` ships both dialects.

The prompt's Render + Supabase + cron-job.org stack also costs $0 and does work. The
substitution is justified narrowly: it **eliminates** the prompt's FAILURE 2 (cold start
breaking OAuth) and FAILURE 6 (database pausing) by construction rather than mitigating
them with keepalives, and it supplies the sub-daily cron the corrected cadence requires.

---

## OAuth flow (corrected)

Standard **Authorization Code flow with client secret** — not PKCE. PKCE exists for clients
that cannot hold a secret; a confidential backend can, so PKCE adds ceremony without
addressing a real threat here.

```
1. Register app at developer.spotify.com/dashboard  (free; owner needs Premium)
   Redirect URI: https://<worker>.workers.dev/auth/callback
   Add up to 5 users: Settings -> User Management -> Add new user (name + email)

2. GET /auth/login
   state = crypto.randomUUID()   -> store server-side, short TTL
   redirect to https://accounts.spotify.com/authorize?
     client_id, response_type=code, redirect_uri, state,
     scope = user-read-recently-played user-top-read user-read-private user-library-read

3. GET /auth/callback?code&state
   verify state matches  -> else reject (CSRF)
   POST https://accounts.spotify.com/api/token
     Authorization: Basic base64(CLIENT_ID:CLIENT_SECRET)
     grant_type=authorization_code & code & redirect_uri

4. Persist: encrypted tokens, token_expires_at = now()+3600,
            authorized_at = now()          <-- starts the 6-month clock
```

**Scope note:** `user-read-email` was in the prompt's scope string but nothing in the
design uses email except allowlist matching, which happens in Spotify's dashboard, not the
API. Dropped — request the minimum.

**On the 403:** a non-allowlisted user may complete login but gets 403 on API calls. Catch
it at first `GET /me` and show a real message ("this app is limited to 5 authorized
testers") instead of a blank failure.

---

## Data flow, end to end

```
Day 0    User authorizes                 -> tokens stored, authorized_at set
Day 0    User requests Extended History  -> Spotify emails link (hours-5 days typical)
Day 0+   Hourly poll starts immediately  -> captures plays from authorization forward
Day ~2   User uploads zip                -> R2 -> stream-parse -> plays (source=zip_import)
                                          -> history_covered_to = MAX(ts) [MEASURED]
Ongoing  Hourly poll                     -> fills forward, never >50 behind
Ongoing  Hourly enrich (20/run)          -> duration_ms backfill
Bi-weekly Stats recompute                -> user_stats_cache
Day ~165 Proactive re-auth notice        -> before the 6-month token death
Periodic Fresh export re-import          -> upgrades API rows with true ms_played
```

Starting the hourly poll **at authorization**, before the zip arrives, is deliberate: it
covers the days between authorization and export delivery, which would otherwise be the
one gap the design cannot backfill.

---

## What this architecture explicitly does not solve

- **The 5-user ceiling.** No architecture defeats it. Not a scaling problem — a policy wall.
- **Missing audio features.** No Spotify replacement exists. Cut the feature.
- **The owner's Premium requirement.** Infrastructure is $0; the app still requires a
  Premium subscription to function. **Zero infra cost ≠ zero cost.**
- **Pre-authorization history beyond the export's reach.** Bounded by what Spotify chooses
  to include in the export.
