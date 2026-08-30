# Sync Algorithm — corrected cadence, with backoff and re-auth handling

The prompt specified a bi-weekly cron. **That interval is unsafe** — `recently-played`
holds only 50 items with no pagination past them, so a 14-day gap loses >90% of plays
permanently (`sources/04`, S4.5). Ingestion runs **hourly**; stats recompute bi-weekly.

---

## Job 1 — INGEST (hourly, all users)

Cloudflare Workers Cron Trigger: `0 * * * *`

```
FOR EACH user IN users WHERE reauth_required = FALSE:

  run = sync_runs.begin(user)

  # ---- 1. Refresh-token lifetime check (BEFORE any API call) -------------
  # Refresh tokens die 6 months from ORIGINAL authorization and expose no
  # issuance date, so we check our own recorded authorized_at.
  days_authorized = now() - user.authorized_at
  IF days_authorized >= 180 days:
      user.reauth_required = TRUE
      run.finish(status='auth_expired'); CONTINUE
  IF days_authorized >= 165 days AND user.reauth_notified_at IS NULL:
      notify_user_to_reauthorize(user)          # PROACTIVE, before the break
      user.reauth_notified_at = now()

  # ---- 2. Access token refresh ------------------------------------------
  IF now() >= user.token_expires_at - 60s:
      resp = POST https://accounts.spotify.com/api/token
             Authorization: Basic base64(CLIENT_ID:CLIENT_SECRET)
             grant_type=refresh_token & refresh_token=<decrypted>

      IF resp.status == 400 AND resp.body.error == 'invalid_grant':
          # Expired (6mo) OR user revoked access. Same remedy: full re-auth.
          # DO NOT RETRY — retrying cannot succeed.
          user.reauth_required = TRUE
          notify_user_to_reauthorize(user)
          run.finish(status='auth_expired'); CONTINUE

      user.access_token = resp.access_token
      user.token_expires_at = now() + resp.expires_in
      IF resp.refresh_token PRESENT:            # rotation happens sometimes
          user.refresh_token = resp.refresh_token
          # NOTE: rotation does NOT reset authorized_at. The 6-month clock
          # runs from the ORIGINAL authorization. Do not touch authorized_at here.

  # ---- 3. Poll recently-played ------------------------------------------
  after = user.last_played_cursor        # ms epoch; NULL on first run
  resp = GET /v1/me/player/recently-played?limit=50[&after=<after>]

  HANDLE resp:
      403 -> user not allowlisted (or scope missing).
             run.finish(status='error', detail='not_allowlisted'); CONTINUE
      429 -> IF resp.body.reason == 'QUOTA_EXCEEDED':
                 # Account-wide budget exhausted. Retrying burns shared quota
                 # and can affect every app on this developer account.
                 ABORT THE ENTIRE JOB (not just this user); alert.
                 run.finish(status='quota_exceeded')
             ELSE:
                 wait = resp.headers['Retry-After'] OR 5s      # header is
                 sleep(wait); retry up to 3 times               # "normally" present
                 IF still 429: run.finish(status='rate_limited'); CONTINUE

  # ---- 4. Window-saturation check (data-loss canary) --------------------
  # A full 50 items means the window MAY have overflowed and plays may have
  # been lost forever. Surface it; shorten the interval if it recurs.
  IF len(resp.items) == 50:
      run.window_saturated = TRUE

  # ---- 5. Transform and insert -----------------------------------------
  FOR EACH item IN resp.items:
      track_key = normalize(item.track.name, item.track.artists[0].name)
      INSERT INTO plays (
          user_id, spotify_uri, track_name, artist_name, album_name,
          track_key, played_at, ms_played, reason_end,
          is_skipped_derived, source
      ) VALUES (
          user.id, item.track.uri, ..., track_key,
          item.played_at,
          item.track.duration_ms,   -- API gives no ms_played; see caveat below
          NULL,
          FALSE,
          'api_poll'
      )
      ON CONFLICT (user_id, track_key, played_at) DO NOTHING

      # duration_ms arrives free here — capture it for completion rate.
      UPSERT INTO tracks (spotify_uri, track_key, duration_ms, fetched_at)

  user.last_played_cursor = max(item.played_at) as ms epoch
  user.last_successful_sync_at = now()
  user.history_covered_to = GREATEST(user.history_covered_to, max(played_at))
  run.finish(status='ok')

  sleep(1s)      # stagger users; keeps sustained rate ~0.2 req/s
```

### Caveat the implementer must handle

`recently-played` reports **that** a track was played, not **how long** it was played.
There is no `ms_played` equivalent in the API response. Only the GDPR export carries real
play duration.

Consequences, and they are not small:
- API-sourced rows cannot support MOST LISTENED, MOST SKIPPED, or COMPLETION RATE with
  the same fidelity as export-sourced rows.
- Options: (a) store `ms_played = NULL` and exclude API rows from duration-based stats;
  (b) approximate with `duration_ms` and flag the row as approximate.

**Recommended: option (a)** — store NULL, exclude from duration stats, and count API rows
only toward play-count stats. Then periodically re-import a fresh GDPR export to
*upgrade* those rows with true durations. Option (b) inflates listening time by assuming
every track was played to completion, which is exactly the bias a skip-tracking app must
not introduce.

This makes the periodic re-export a **first-class part of the design**, not a one-time
bootstrap — reinforcing the durability argument in `sources/06`, S6.5.

---

## Job 2 — ENRICH (hourly, low priority, strictly budgeted)

Batch `?ids=` fetches were removed in Feb 2026, so enrichment is one call per track.

```
tracks_needing = SELECT spotify_uri FROM tracks
                 WHERE duration_ms IS NULL AND fetch_failed = FALSE
                 LIMIT 20                     -- hard cap per run

FOR EACH uri IN tracks_needing:
    resp = GET /v1/tracks/{id}
    ON 429: honour Retry-After (or abort on QUOTA_EXCEEDED); stop the batch
    ON 404: mark fetch_failed = TRUE          -- local file / regional removal
    ON 200: UPDATE tracks SET duration_ms = resp.duration_ms, fetched_at = now()
    sleep(1s)
```

20/hour = ~480/day, so a few thousand distinct historical tracks backfill within days.
Deliberately slow: this is the lowest-value, highest-call-count work in the system, and it
must never crowd out ingestion or risk the shared quota.

---

## Job 3 — IMPORT GDPR ZIP (on demand, user-triggered)

```
1. User uploads zip -> presigned PUT direct to R2/Storage.
   Do NOT route through a serverless function body (Vercel caps ~4.5 MB;
   Workers have their own CPU ceiling). Direct-to-storage sidesteps both.

2. Queue-triggered worker streams the object:
   - Parse ONLY files matching Streaming_History_Audio_*.json
     (Streaming_History_Video_* and Marquee/Inference files are irrelevant)
   - Stream-parse; never fully materialise a 155 MB document in memory
   - Each file is ~12 MB, so process file-by-file

3. FOR EACH event:
     SKIP IF master_metadata_track_name IS NULL   -- podcast episode or local file
     SKIP IF ts < target_start (e.g. Jan 1 of current year)

     track_key = normalize(master_metadata_track_name,
                           master_metadata_album_artist_name)

     is_skipped_derived = (skipped == TRUE)
                          OR reason_end IN ('backbtn','unknown','endplay','fwdbtn')
     # The raw `skipped` field was unpopulated 2015-04-13 -> 2022-10-16.
     # Trusting it alone makes MOST SKIPPED return nothing.

     INSERT ... ON CONFLICT (user_id, track_key, played_at) DO NOTHING

     Record any unrecognised JSON keys into import_batches.unknown_fields
     (early warning for format drift — which has already occurred once)

4. AFTER ingest:
     batch.latest_ts = MAX(ts)
     user.history_covered_from = MIN(ts)
     user.history_covered_to   = MAX(ts)      -- MEASURED watermark, not estimated
     user.last_played_cursor   = MAX(ts) as ms epoch
     # The hourly poll now fills forward from the real boundary automatically.

5. Trigger stats recompute.
```

**Normalisation function** (used identically in all three jobs — any divergence
reintroduces the duplicate-URI bug):

```
normalize(title, artist):
    s = lowercase(title + '|' + artist)
    strip diacritics
    remove bracketed suffixes: (remastered...), (feat...), - YYYY remaster, etc.
    collapse whitespace
    return s
```

---

## Job 4 — RECOMPUTE STATS (bi-weekly — the product rhythm the prompt wanted)

Cron: `0 3 */14 * *`. Runs the queries in `schema.sql` and writes `user_stats_cache`,
including `coverage_pct` per stat (e.g. share of plays with a known `duration_ms`).

This is where "updates every two weeks" lives. Ingestion stays hourly; only the
*presentation* refreshes bi-weekly.

---

## Job 5 — FRESHNESS WATCHDOG (daily)

The compound failure — expired tokens, quota exhaustion, or a lapsed owner Premium — all
fail **silently** while the app keeps serving confident-looking stale numbers.

```
FOR EACH user:
    IF now() - user.last_successful_sync_at > 6 hours: flag STALE
    IF user.reauth_required: flag NEEDS_REAUTH
IF ALL users failing simultaneously:
    -> suspect owner's Spotify Premium lapsed, or account-level quota block
```

Every API response should carry `data_as_of = last_successful_sync_at` so the client can
show freshness rather than implying live data.

---

## Failure-handling summary

| Signal | Meaning | Action |
|---|---|---|
| `400` + `invalid_grant` | Refresh token expired (6mo) or revoked | Mark `reauth_required`, notify. **Never retry** |
| `403` on API call | User not allowlisted, or missing scope | Surface a real message; do not retry |
| `429` + `QUOTA_EXCEEDED` | Account-wide budget exhausted | **Abort whole job**, alert. Never retry |
| `429` plain | Rolling-window rate limit | Honour `Retry-After`; max 3 retries |
| 50 items returned | Window possibly overflowed | Log `window_saturated`; shorten interval |
| All users failing at once | Owner Premium lapsed / account action | Alert owner — no code fix exists |
