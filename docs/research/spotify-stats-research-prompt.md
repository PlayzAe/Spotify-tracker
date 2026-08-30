---
name: spotify-stats-backend-research
description: Backend-focused deep-research prompt for a fully free Spotify stats app. Covers
  the OAuth 2.0 user cap problem, rate limiting / anti-spam strategy, bi-weekly sync
  architecture, hybrid data model (live API + GDPR zip file for Jan-to-date history),
  token management, database schema for stream categorization, and a zero-cost backend
  stack. Use with cs-deep-research skill. Adversarial pass required.
---

# Research Prompt: Spotify Stats App — Backend Deep-Dive (Fully Free)

> **Skill:** cs-deep-research — rigor-first, triangulated, adversarial pass required.
> **Model:** opus
> **Scope:** Backend only. No frontend. No UI. Pure data pipeline, auth, storage, sync.
> **Goal:** Design the complete backend for a free Spotify stats app that shows a user
> their full streaming history from January of the current year through today, updates
> every two weeks via the API, and categorizes streams by most replayed, most listened,
> most liked, and other dimensions — all at zero cost.

---

## 0. Clarifications Baked Into This Research (Read First)

These are resolved questions — do not re-open them. Research should build on these facts:

FACT 1 — The Spotify Developer Dashboard is free to access.
  Anyone with a Spotify account (free or Premium) can register at developer.spotify.com,
  create an app, and get a Client ID and Client Secret at no cost. No company required.
  You do NOT "put the API in your app." You register YOUR app on Spotify's dashboard,
  get credentials, and your backend uses those credentials to talk to Spotify's servers.

FACT 2 — The 25-user OAuth cap is REAL and is the central design constraint.
  In Spotify's Development Mode, only 25 Spotify accounts can authorize your app.
  If a 26th user tries to log in via OAuth, Spotify blocks them.
  There is no middle tier. Extended Quota Mode requires 250,000 MAU minimum.
  This is NOT about API call volume — it is about how many distinct users can authenticate.
  Design decisions must account for this hard wall.

FACT 3 — The Spotify API cannot return full streaming history.
  The recently-played endpoint returns a maximum of 50 tracks.
  There is no "get all streams since January" endpoint.
  Historical data (Jan to date) MUST come from the GDPR Extended Streaming History export
  (a zip file of JSON files the user downloads from their Spotify privacy settings).
  The app must combine: zip file data (historical) + API polling (ongoing, bi-weekly).

FACT 4 — Spotify does NOT publish exact rate limits.
  They enforce a "rate limit" (HTTP 429) but the threshold is not documented.
  Community research and reverse-engineering are the only sources.
  The research must surface the best available estimates and safe polling strategies.

---

## 1. Falsifiable Hypotheses

| # | Hypothesis | Refuted by |
|---|---|---|
| H1 | A zero-cost backend stack (Supabase free + Vercel/Render free + cron job) can run a bi-weekly Spotify sync for up to 25 users without hitting free-tier compute or storage limits | Evidence that free-tier limits are too low for the data volume |
| H2 | Bi-weekly polling of the Spotify API (every 14 days per user) stays safely within Spotify's undocumented rate limits and does not trigger throttling or bans | Evidence that even low-frequency polling at this cadence triggers 429s or ban |
| H3 | The GDPR Extended Streaming History zip file contains enough data (timestamps, ms_played, track name, artist) to reconstruct "Jan 1 to today" streaming stats with no gaps | Evidence that the export is incomplete, malformed, or missing fields needed for categorization |
| H4 | The 25-user OAuth cap can be worked around for personal/small-group use by pre-adding users to the Spotify app's allowlist in the developer dashboard | Evidence that allowlisting does not work or requires Spotify review |

---

## 2. Research Subtopics — Run as Parallel Sub-Agents

Do NOT run these sequentially. Dispatch all six at once.

| Agent | Topic | Primary sources |
|---|---|---|
| A | Spotify rate limits — undocumented thresholds, 429 behavior, community findings, safe polling intervals | Spotify developer forum, GitHub issues on spotify libraries, HN threads, Stack Overflow 2023-2025 |
| B | OAuth 2.0 Authorization Code Flow + PKCE — exact token lifecycle, refresh token longevity, server-side storage best practices | Spotify official auth docs, RFC 6749, OAuth 2.0 security best practices RFC 9700 |
| C | The 25-user Development Mode cap — exact behavior, workarounds, allowlist mechanics, what happens at user 26 | Spotify developer docs, community forum threads, GitHub issues |
| D | GDPR Extended Streaming History export — file format, fields, completeness, how to parse, known issues | Spotify privacy docs, Reddit r/spotify, GitHub projects that parse the export |
| E | Bi-weekly sync architecture — cron job design, storing incremental plays, deduplication, database schema for stream categorization | Open-source Spotify trackers (your_spotify, SYSH source code), database design articles |
| F | Zero-cost backend stack evaluation — Supabase free tier limits, Vercel/Render free cron jobs, SQLite vs Postgres for this use case | Official pricing pages, community benchmarks, free-tier limit documentation |

---

## 3. Section A — The Rate Limit Problem (Anti-Spam Strategy)

This is the biggest operational risk. Research must answer every sub-question.

### 3.1 What are Spotify's actual rate limits?

Spotify's official docs say only: "If you send too many requests in a short period of time,
we might start returning 429 Too Many Requests responses."
They do not publish numbers.

Research must find:
  - Best community estimates for requests-per-second or requests-per-minute per access token
  - Whether rate limits are per access_token, per Client ID, or per IP
  - How long a 429 lock lasts (Retry-After header value in practice)
  - Whether background server-side polling is treated differently than interactive user requests

Expected findings to verify (triangulate each against 3 sources):
  - Rate limit is approximately 10-30 requests per second per access token [VERIFY]
  - The Retry-After header tells you exactly how long to wait [VERIFY]
  - Rate limits reset on a rolling window, not a fixed clock [VERIFY]
  - Polling recently-played more than once per 30 seconds is considered aggressive [VERIFY]

### 3.2 Anti-spam architecture for bi-weekly sync

The app must NOT poll on every user request. Design:

  WRONG approach (causes 429):
    User opens app → backend immediately calls Spotify API → rate limit risk at scale

  CORRECT approach (safe):
    Background cron job runs every 14 days per user
    → Fetches only what has changed since last sync
    → Stores results in YOUR database
    → User's app reads from YOUR database, never directly from Spotify API
    → Spotify API is only called by the cron job, not by user page loads

Research the exact cron job design:
  - How to stagger 25 users' sync jobs so they don't all run simultaneously
  - How to use cursor-based pagination on recently-played to get only new tracks since last fetch
  - How to detect if an access token has expired and refresh it before the cron runs
  - How to handle a 429 response in the cron: exponential backoff algorithm

### 3.3 Spotify API call budget per bi-weekly sync (per user)

Map out exactly how many API calls a single user's sync costs:

  Call 1:  GET /v1/me — user profile (1 call)
  Call 2:  GET /v1/me/top/tracks?time_range=long_term&limit=50 (1 call)
  Call 3:  GET /v1/me/top/tracks?time_range=medium_term&limit=50 (1 call)
  Call 4:  GET /v1/me/top/tracks?time_range=short_term&limit=50 (1 call)
  Call 5:  GET /v1/me/top/artists?time_range=long_term&limit=50 (1 call)
  Call 6:  GET /v1/me/top/artists?time_range=medium_term&limit=50 (1 call)
  Call 7:  GET /v1/me/top/artists?time_range=short_term&limit=50 (1 call)
  Calls 8+: GET /v1/me/player/recently-played?limit=50&after={cursor} (N calls, paginated)
            Fetch until you reach the timestamp of your last sync. Usually 1-3 calls per 2 weeks.

  Total per user per sync: approximately 10-15 API calls.
  Total for 25 users: approximately 250-375 API calls per bi-weekly run.
  Spread over 30 minutes with 5-second delays between users = ~0.14 calls/second.
  This is well within any reasonable rate limit estimate. VERIFY this math.

---

## 4. Section B — OAuth 2.0 Backend Flow (Complete, Secure)

Research must produce a complete, step-by-step backend implementation guide.
This is a backend document — no frontend JavaScript. Server-side only.

### 4.1 The Authorization Code Flow (with PKCE recommended)

Why PKCE for a server-side app?
  Even server-side apps benefit from PKCE as an extra layer against authorization code interception.
  Research whether Spotify's implementation supports PKCE for server-side apps.

Complete backend flow:

  STEP 1 — App registration (one-time, developer does this manually):
    Go to developer.spotify.com/dashboard
    Create a new app — fill in app name, description
    Set Redirect URI to: https://your-backend.com/auth/callback
    Copy Client ID and Client Secret into your backend's environment variables
    NEVER commit Client ID or Client Secret to git

  STEP 2 — Generate authorization URL (backend generates, sends to user):
    state = crypto.randomUUID()           <- store in session/DB to verify later
    url = "https://accounts.spotify.com/authorize?" + params({
      client_id:     CLIENT_ID,
      response_type: "code",
      redirect_uri:  REDIRECT_URI,
      scope:         "user-top-read user-read-recently-played user-read-private user-read-email user-library-read",
      state:         state,
      show_dialog:   false                <- set true only if you want to force re-consent
    })
    Return this URL to the client (client clicks it, gets redirected to Spotify)

  STEP 3 — Handle the callback (backend receives from Spotify):
    GET /auth/callback?code=AUTH_CODE&state=STATE
    Verify: state matches what you stored in step 2 (CSRF protection)
    If state mismatch: reject the request immediately

  STEP 4 — Exchange code for tokens (backend to Spotify, server-side only):
    POST https://accounts.spotify.com/api/token
    Headers:
      Content-Type: application/x-www-form-urlencoded
      Authorization: Basic base64encode(CLIENT_ID + ":" + CLIENT_SECRET)
    Body:
      grant_type=authorization_code
      code=AUTH_CODE
      redirect_uri=REDIRECT_URI

    Response:
      {
        "access_token":  "BQC...",   <- valid for 3600 seconds (1 hour)
        "token_type":    "Bearer",
        "scope":         "user-top-read ...",
        "expires_in":    3600,
        "refresh_token": "AQD..."    <- does NOT expire (unless user revokes app access)
      }

  STEP 5 — Store tokens in your database:
    users table row:
      spotify_id:            from GET /v1/me response
      email:                 from GET /v1/me response
      access_token:          encrypted at rest
      refresh_token:         encrypted at rest (AES-256 minimum)
      token_expires_at:      now() + 3600 seconds
      last_synced_at:        null (first sync pending)
      last_played_cursor:    null (for pagination on recently-played)

  STEP 6 — Token refresh (before every cron sync):
    IF now() >= token_expires_at THEN:
      POST https://accounts.spotify.com/api/token
      Headers: Authorization: Basic base64encode(CLIENT_ID + ":" + CLIENT_SECRET)
      Body:
        grant_type=refresh_token
        refresh_token=STORED_REFRESH_TOKEN
      Response: new access_token (and sometimes a new refresh_token)
      Update database with new tokens and new token_expires_at

### 4.2 The 25-user cap — exact mechanics

In Development Mode, Spotify maintains an allowlist of Spotify user accounts
that are permitted to authorize your app.

  How to add users to the allowlist:
    Spotify Developer Dashboard → Your App → Settings → User Management
    Add up to 25 Spotify email addresses
    Users NOT on this list will see an error when they try to log in

  What happens at user 26:
    Spotify shows: "This app is not available" or a similar error
    The user cannot complete OAuth. Your callback never fires.
    No graceful error message is passed to your app.

  Workaround options to research:
    Option A: Accept the 25-user limit. For personal/small-group use this is fine.
    Option B: Self-host — run the app locally. The 25-user cap still applies to the Spotify app,
              but you control who you add to the allowlist.
    Option C: Each user registers their own Spotify Developer app and provides their own
              Client ID/Secret to your backend. Each person is the owner of their own app
              (0 users capped, since you're always the owner). Research if this pattern is
              viable and what the UX looks like.
    Option D: Apply for Extended Quota Mode. Research the actual requirements and whether
              a small app can qualify by applying early.

  Research must determine: does the 25-user cap apply to the total number of users who have
  EVER authorized, or the number currently active? Can you remove a user and add a new one?

---

## 5. Section C — Historical Data: The GDPR Zip File + Hybrid Model

### 5.1 What the zip file contains

When a user requests their Extended Streaming History from Spotify privacy settings,
they receive a zip file containing JSON files named:
  Streaming_History_Audio_2024.json
  Streaming_History_Audio_2025.json
  etc.

Each file is a JSON array of objects. Each object represents one play event:

  {
    "ts":                    "2025-01-15T14:23:10Z",   <- timestamp (UTC)
    "ms_played":             234567,                   <- milliseconds played
    "master_metadata_track_name":  "Blinding Lights",
    "master_metadata_album_artist_name": "The Weeknd",
    "master_metadata_album_album_name": "After Hours",
    "spotify_track_uri":     "spotify:track:0VjIjW4GlUZAMYd2vXMi3b",
    "reason_start":          "fwdbtn",                 <- how playback started
    "reason_end":            "trackdone",              <- how playback ended
    "shuffle":               false,
    "skipped":               null
  }

Research must verify:
  - Is ms_played always present? What value means "skipped before counted"?
  - Is spotify_track_uri always present? What about podcast episodes or local files?
  - Does "skipped" field reliably indicate a skip, or is it often null?
  - What is the minimum ms_played that Spotify counts as a legitimate play vs. a skip?
    (Community consensus appears to be: 30,000 ms = 30 seconds = counted play. VERIFY.)

### 5.2 Parsing and ingestion pipeline

Backend must:

  1. Accept a zip file upload from the user (multipart/form-data)
  2. Unzip in memory (do not write unzipped files to disk)
  3. Parse only files matching: Streaming_History_Audio_*.json
  4. Filter to current year (2025 or whatever year the app targets):
       WHERE ts >= "2025-01-01T00:00:00Z"
       AND ts <= now()
  5. For each play event, insert into plays table:
       user_id, spotify_track_uri, track_name, artist_name, album_name,
       played_at (from ts), ms_played, reason_end, skipped
  6. Deduplicate: if a play with the same (user_id, spotify_track_uri, played_at) already
     exists in the database, skip insertion (upsert on conflict)
  7. After ingestion, trigger categorization computation (see Section D)

Research must find:
  - What is the maximum size of the zip file? (For free-tier upload limits)
  - Does Spotify deliver the current year's data, or only up to a few months ago?
    (Known issue: the export may lag by 1-3 months. VERIFY.)
  - How to handle tracks that appear in the zip but have no spotify_track_uri (local files)?

### 5.3 The hybrid data model: zip file + ongoing API polling

             ┌──────────────────────────────────────────────────────┐
             │                  YOUR DATABASE                        │
             │                                                        │
             │  plays table                                           │
             │    user_id | spotify_uri | played_at | ms_played | ... │
             │                                                        │
             │  ▲                              ▲                      │
             │  │                              │                      │
             └──┼──────────────────────────────┼──────────────────────┘
                │                              │
    ┌───────────┴──────────┐      ┌────────────┴───────────────┐
    │  GDPR ZIP FILE       │      │  SPOTIFY API (bi-weekly)   │
    │  (one-time import)   │      │  /me/player/recently-played│
    │  Jan 1 → export date │      │  export_date → today       │
    └──────────────────────┘      └────────────────────────────┘

The two sources together = complete Jan 1 to today coverage.
Gap risk: if the zip export lags by 2 months (e.g. covers Jan–June) and the API only
returns the last 50 plays (covering the last few days), there is a gap for July.
Research must find: does the recently-played cursor allow fetching back further than 50 tracks?
(Likely answer: no — but verify with community sources.)

---

## 6. Section D — Database Schema and Stream Categorization

### 6.1 Core tables (backend must design these)

Research the optimal schema for the following query patterns:

  plays table:
    id              SERIAL PRIMARY KEY
    user_id         UUID REFERENCES users(id)
    spotify_uri     TEXT          <- "spotify:track:0VjI..."
    track_name      TEXT
    artist_name     TEXT
    album_name      TEXT
    played_at       TIMESTAMPTZ
    ms_played       INTEGER
    source          TEXT          <- "zip_import" or "api_poll"
    skipped         BOOLEAN
    created_at      TIMESTAMPTZ DEFAULT now()
    UNIQUE (user_id, spotify_uri, played_at)   <- deduplication constraint

  tracks table (enriched metadata fetched once from Spotify API):
    spotify_uri     TEXT PRIMARY KEY
    track_name      TEXT
    artist_name     TEXT
    album_name      TEXT
    duration_ms     INTEGER
    popularity      INTEGER       <- Spotify's 0-100 popularity score
    energy          FLOAT         <- from audio-features endpoint
    danceability    FLOAT
    valence         FLOAT         <- "musical positiveness"
    tempo           FLOAT         <- BPM
    fetched_at      TIMESTAMPTZ

  user_stats_cache table (precomputed, refreshed after each sync):
    user_id         UUID
    stat_key        TEXT          <- e.g. "top_tracks_by_plays", "most_replayed", etc.
    stat_period     TEXT          <- "ytd", "last_30d", "last_6m", "all_time"
    computed_at     TIMESTAMPTZ
    result_json     JSONB         <- the precomputed result

### 6.2 Categorization queries (what the backend must compute)

After each sync, compute and cache these statistics:

  MOST REPLAYED (highest play count):
    SELECT spotify_uri, track_name, artist_name, COUNT(*) as play_count
    FROM plays
    WHERE user_id = ? AND played_at >= '2025-01-01'
    GROUP BY spotify_uri, track_name, artist_name
    ORDER BY play_count DESC
    LIMIT 50

  MOST LISTENED (highest total ms_played — different from play count because long songs):
    SELECT spotify_uri, track_name, artist_name,
           SUM(ms_played) as total_ms,
           COUNT(*) as play_count
    FROM plays
    WHERE user_id = ? AND played_at >= '2025-01-01' AND skipped = false
    GROUP BY spotify_uri, track_name, artist_name
    ORDER BY total_ms DESC
    LIMIT 50

  MOST SKIPPED (tracks started but rarely finished):
    SELECT spotify_uri, track_name, artist_name,
           COUNT(*) FILTER (WHERE skipped = true) as skip_count,
           COUNT(*) as total_starts,
           ROUND(COUNT(*) FILTER (WHERE skipped = true)::numeric / COUNT(*) * 100) as skip_pct
    FROM plays
    WHERE user_id = ? AND played_at >= '2025-01-01'
    GROUP BY spotify_uri, track_name, artist_name
    HAVING COUNT(*) >= 5                  <- minimum plays to be statistically meaningful
    ORDER BY skip_pct DESC
    LIMIT 50

  TOP ARTISTS (by total listening time):
    SELECT artist_name, SUM(ms_played) as total_ms, COUNT(*) as play_count
    FROM plays
    WHERE user_id = ? AND played_at >= '2025-01-01'
    GROUP BY artist_name
    ORDER BY total_ms DESC
    LIMIT 50

  LISTENING STREAKS (days with at least one play — longest consecutive streak):
    Research the SQL pattern for this. It requires date-series gap detection.

  LISTENING BY TIME OF DAY (morning vs evening listener):
    SELECT EXTRACT(HOUR FROM played_at AT TIME ZONE user_timezone) as hour,
           COUNT(*) as play_count
    FROM plays
    WHERE user_id = ?
    GROUP BY hour
    ORDER BY hour

  MONTHLY BREAKDOWN (plays per month, Jan through current month):
    SELECT DATE_TRUNC('month', played_at) as month,
           COUNT(*) as play_count,
           SUM(ms_played) as total_ms
    FROM plays
    WHERE user_id = ? AND played_at >= '2025-01-01'
    GROUP BY month
    ORDER BY month

  COMPLETION RATE (how often user listens to a full track):
    Requires joining with tracks.duration_ms:
    completion_pct = (ms_played / duration_ms) * 100
    A track is "fully listened" if completion_pct >= 90

Research must verify: does the GDPR zip file's ms_played field allow computing completion
rate? Or does it sometimes cap at the track's duration_ms?

---

## 7. Section E — Zero-Cost Backend Stack

Research must evaluate each component for the free tier and confirm it handles the load.

### 7.1 Stack options (all free tier)

  DATABASE:
    Option A: Supabase free tier
      - 500 MB storage, 2 GB egress/month, Postgres
      - Estimated data size for 25 users × 12 months × ~5 plays/day:
        25 × 365 × 5 = 45,625 play rows × ~500 bytes = ~22 MB. Well within 500 MB.
      - Supabase free tier: does it support pg_cron for scheduled jobs? RESEARCH.

    Option B: PlanetScale free tier (MySQL)
      - 5 GB storage, branching. VERIFY if still free as of 2025.

    Option C: SQLite via Turso (libSQL) free tier
      - 9 GB storage, 1 billion row reads/month on free tier.
      - Suitable for low-traffic personal apps.

  BACKEND / API SERVER:
    Option A: Vercel free tier (serverless functions)
      - 100 GB bandwidth/month, 6,000 function invocations/day
      - No persistent background processes — cron jobs need external trigger
      - Free tier cron: Vercel Cron (limited to 1 invocation/day on free plan). VERIFY.

    Option B: Render free tier (web service)
      - Free web services spin down after 15 min of inactivity (cold start ~30s)
      - Background workers: free tier available? RESEARCH.
      - Better for long-running cron jobs than Vercel

    Option C: Railway free tier
      - $5 free credit/month, ~$0.000231/vCPU-second
      - Estimate cost for bi-weekly cron: 2 runs/month × 25 users × ~30 seconds each
        = 1,500 vCPU-seconds/month × $0.000231 = $0.35/month. Within $5 credit.

  CRON JOB SCHEDULER (for bi-weekly sync):
    Option A: GitHub Actions (free tier — 2,000 minutes/month on public repos)
      - schedule: cron: '0 9 */14 * *'   <- every 14 days at 9am
      - Calls your backend's /api/sync endpoint
      - Free, reliable, no server needed
      - RESEARCH: does GitHub Actions free tier allow this for private repos?

    Option B: cron-job.org — free external cron service
      - Sends HTTP GET/POST to your endpoint on a schedule
      - Free, unlimited jobs, up to 60-second intervals

    Option C: Supabase pg_cron extension — runs SQL on a schedule inside the DB itself
      - Can trigger a stored procedure that calls an external HTTP endpoint (pg_net)
      - RESEARCH if pg_net is available on Supabase free tier

  FILE UPLOAD (for GDPR zip):
    Zip files can be large (100 MB+). Process in streaming mode.
    Option: Vercel has a 4.5 MB body limit on serverless functions.
    Solution: Use Supabase Storage (free tier: 1 GB) or presigned S3-compatible upload.
    RESEARCH: what is the practical maximum size of a Spotify Extended Streaming History zip?

### 7.2 Recommended zero-cost stack (to validate)

  Backend API:   Render free tier (Node.js or Python/FastAPI)
  Database:      Supabase free tier (Postgres + auth + storage)
  Cron trigger:  cron-job.org → calls /api/cron/sync on Render
  File upload:   Supabase Storage (zip file) → Render processes it
  Auth:          Spotify OAuth 2.0 via your own backend (no third-party auth service needed)
  Domain:        Render gives free .onrender.com subdomain
  Total cost:    $0/month

Research must confirm free tier limits are not exceeded for 25 users with bi-weekly syncs.

---

## 8. Section F — Adversarial Pass (What Could Break This?)

Steel-man every failure mode. Do not skip any of these.

FAILURE 1 — The GDPR zip file lags by 3 months
  If Spotify's export only covers Jan–May and the API only gives last 50 plays (last 2 days),
  June and July are completely missing. No workaround exists via the official API.
  Mitigation: Document this gap clearly to the user. Show what coverage dates are available.
  The bi-weekly polling fills the gap going forward from the import date.
  Research: what is the actual typical lag? Is it days, weeks, or months?

FAILURE 2 — Render free tier cold starts break the OAuth callback
  If the Render server has been idle for 15 minutes, the first request takes 30+ seconds.
  If the OAuth callback takes >30 seconds, Spotify may reject it (timeout on their end).
  Research: does Spotify's callback have a timeout? What is it?
  Mitigation: Use Vercel for the auth callback (instant cold start) and Render for everything else.

FAILURE 3 — Refresh token is revoked by the user
  If the user goes to their Spotify account settings and revokes your app's access,
  the refresh token becomes invalid. Your backend will get a 401 on the next sync.
  Mitigation: Detect 401 on token refresh → mark user as "needs reauth" → notify user.

FAILURE 4 — Spotify changes the GDPR export format
  The zip file format is not officially documented by Spotify as an API contract.
  Fields could be renamed or removed without notice.
  Mitigation: Write the parser defensively — use optional chaining, never crash on missing fields.
  Log unrecognized fields for debugging.

FAILURE 5 — The 25-user allowlist is per-app, not per-developer-account
  If you hit 25 users and want more, you CANNOT just create a second Spotify app with
  another 25 slots under the same developer account. Spotify may flag this as circumvention.
  Research: is there any documented policy on creating multiple apps to bypass the cap?

FAILURE 6 — Supabase free tier is paused after inactivity
  Supabase pauses projects that have no activity for 7 days (on free tier).
  If no user logs in for a week, the database goes offline and the cron job fails.
  Mitigation: Use cron-job.org to send a keepalive ping to the DB every 5 days.

---

## 9. Output Required

Emit this folder after all sub-agents complete:

  research/spotify-stats-backend/
  |-- plan.md                        <- hypotheses, agents, stop criteria
  |-- synthesis.md                   <- all answers, source-anchored, per section
  |-- architecture.md                <- final backend architecture diagram + tech decisions
  |-- schema.sql                     <- final recommended database schema
  |-- sync_algorithm.md              <- step-by-step bi-weekly cron sync pseudocode
  |-- sources/
  |   |-- 01_spotify_rate_limits.md
  |   |-- 02_oauth_token_lifecycle.md
  |   |-- 03_user_cap_mechanics.md
  |   |-- 04_gdpr_zip_format.md
  |   |-- 05_free_tier_limits.md
  |   `-- 06_adversarial_failures.md
  |-- refresh_targets.md             <- re-verify in 90 days: rate limits, free tier limits, policy
  `-- decision.md                    <- one page: here is exactly what to build and why

Every claim must cite a source file with verbatim quote.
Claims with fewer than 3 independent sources are marked [INSUFFICIENT EVIDENCE].

---

## 10. Final Decisions the Research Must Deliver

DECISION 1 — Do I need to sign up to get the API?
  Yes, but it is free and takes 5 minutes.
  Go to developer.spotify.com, create an app, copy your Client ID and Client Secret.
  That is all you put "in your app." There is no monthly fee, no company required.

DECISION 2 — Can any user sign in with their normal Spotify account?
  Yes — via OAuth 2.0, users click "Login with Spotify," approve permissions on Spotify's
  official page, and are redirected back to your app. They never give your app their password.
  BUT: in Development Mode, you must manually add each user's email to your allowlist
  (developer dashboard → User Management). Maximum 25 users total. This is the hard cap.

DECISION 3 — How do I get Jan-to-August data?
  Two-step hybrid approach:
    Step 1 (one-time): User requests their Extended Streaming History from Spotify privacy
            settings. Spotify emails a download link (takes up to 30 days, often 5-7 days).
            User uploads the zip to your app. Your backend parses it and loads Jan–export_date.
    Step 2 (ongoing): Your backend cron job polls the API every 14 days for new plays,
            storing them in your database starting from export_date forward.
    Result: Full coverage from January 1 through today, with a potential gap if the export
            lags. Document this gap for the user.

DECISION 4 — How do I avoid spamming Spotify?
  Never call the Spotify API on user page loads. Store everything in your own database.
  Run the sync cron job every 14 days, per user, staggered across the day.
  Total API calls: ~250-375 per two-week run for 25 users, spread over 30 minutes.
  This is safe. Use exponential backoff on any 429 response.

DECISION 5 — What does the app show the user?
  All of this is computed from YOUR database, not from Spotify in real time:
  - Most replayed tracks (highest play count, Jan 1 to today)
  - Most listened tracks (highest total ms played, excluding skips)
  - Most skipped tracks (highest skip percentage, minimum 5 plays)
  - Top artists by total listening time (ms played)
  - Monthly breakdown (plays and minutes per month, Jan through current month)
  - Listening by time of day (peak listening hours)
  - Completion rate per track (how often they finish it vs. skip it)
  - Longest listening streak (consecutive days with at least 1 play)
  Data refreshes every 14 days via cron. No real-time updates.

---

*Generated: 2026-08-16*
*Skill: cs-deep-research | Rubric: AR v1 | Scope: Backend only*
*Adversarial pass mandatory. Triangulation required. No fabricated citations.*
