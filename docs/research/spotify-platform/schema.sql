-- ============================================================================
-- Spotify Stats App — Backend Schema (PostgreSQL dialect)
-- Derived from research/spotify-platform/. Every design choice traced.
--
-- ⚠️ SUPERSEDED: this schema was designed for the OAuth + server architecture that the
-- research went on to reject (5-user API cap). The shipping product has no server and no
-- database. Kept for the reasoning; see prd/02-data-engine-prd.md for what is being built.
--
-- Changes vs the original research prompt's schema:
--   REMOVED  tracks.energy / danceability / valence / tempo  (API deprecated 2024-11-27)
--   REMOVED  tracks.popularity                               (field removed 2026-02)
--   ADDED    plays.is_skipped_derived                        (raw `skipped` unreliable)
--   ADDED    plays.track_key / tracks.track_key              (duplicate-URI defect)
--   ADDED    users.authorized_at                             (6-month refresh expiry)
--   ADDED    users.last_successful_sync_at                   (silent-staleness guard)
--   ADDED    import_batches, sync_runs                       (observability)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- users — one row per allowlisted Spotify account (max 5 in Development Mode)
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spotify_id             TEXT        NOT NULL UNIQUE,
    email                  TEXT,
    display_name           TEXT,

    -- Tokens. Encrypt at rest (AES-256-GCM); never log these.
    access_token_enc       BYTEA       NOT NULL,
    refresh_token_enc      BYTEA       NOT NULL,
    token_expires_at       TIMESTAMPTZ NOT NULL,

    -- CRITICAL: refresh tokens expire 6 months from ORIGINAL authorization and
    -- expose no issuance timestamp, so we must record it ourselves.
    -- Refreshing does NOT extend this. Only re-authorization resets it.
    authorized_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    reauth_required        BOOLEAN     NOT NULL DEFAULT FALSE,
    reauth_notified_at     TIMESTAMPTZ,

    -- Sync state
    last_synced_at         TIMESTAMPTZ,             -- last attempt
    last_successful_sync_at TIMESTAMPTZ,            -- last success (freshness source of truth)
    last_played_cursor     BIGINT,                  -- ms epoch, `after` cursor
    history_covered_from   TIMESTAMPTZ,             -- MIN(ts) ingested
    history_covered_to     TIMESTAMPTZ,             -- MAX(ts) ingested = measured watermark

    timezone               TEXT        NOT NULL DEFAULT 'UTC',
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN users.authorized_at IS
    'Start of the 6-month refresh-token window. Notify user to re-auth at ~day 165.';
COMMENT ON COLUMN users.history_covered_to IS
    'Measured, not estimated. Set from MAX(ts) at import; the API fills forward from here.';


-- ---------------------------------------------------------------------------
-- plays — the fact table. One row per play event.
-- ---------------------------------------------------------------------------
CREATE TABLE plays (
    id              BIGSERIAL   PRIMARY KEY,
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    spotify_uri     TEXT,                            -- NULL for local files
    track_name      TEXT        NOT NULL,
    artist_name     TEXT        NOT NULL,
    album_name      TEXT,

    -- Normalized identity. The SAME recording gets DIFFERENT spotify_uri values
    -- across single / album / deluxe reissue. Grouping by URI fragments play
    -- counts and silently corrupts MOST REPLAYED. Group leaderboards by this.
    track_key       TEXT        NOT NULL,

    played_at       TIMESTAMPTZ NOT NULL,
    ms_played       INTEGER     NOT NULL,

    reason_start    TEXT,
    reason_end      TEXT,
    shuffle         BOOLEAN,
    skipped_raw     BOOLEAN,                         -- as-reported; unreliable

    -- Derived at ingest. The raw `skipped` field was not populated between
    -- 2015-04-13 and 2022-10-16, so a query filtering skipped_raw = true
    -- returns near-empty results for historical data.
    is_skipped_derived BOOLEAN  NOT NULL,

    -- Spotify counts a stream at >= 30s. Below that it is not a real play.
    is_counted_stream  BOOLEAN  GENERATED ALWAYS AS (ms_played >= 30000) STORED,

    source          TEXT        NOT NULL CHECK (source IN ('zip_import','api_poll')),
    import_batch_id BIGINT,     -- FK added at end of file (import_batches declared later)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Deduplication. The zip and the API overlap around the watermark, and
    -- re-imports must be idempotent.
    CONSTRAINT plays_dedupe UNIQUE (user_id, track_key, played_at)
);

-- Every leaderboard filters user + date range, so this is the workhorse index.
CREATE INDEX idx_plays_user_time      ON plays (user_id, played_at DESC);
CREATE INDEX idx_plays_user_trackkey  ON plays (user_id, track_key);
CREATE INDEX idx_plays_user_artist    ON plays (user_id, artist_name);

COMMENT ON CONSTRAINT plays_dedupe ON plays IS
    'Keyed on track_key not spotify_uri: the same play re-imported from a different '
    'release URI must collide, not duplicate.';


-- ---------------------------------------------------------------------------
-- tracks — metadata cache. Lazily populated; enrichment is now 1 call/track.
-- ---------------------------------------------------------------------------
CREATE TABLE tracks (
    spotify_uri   TEXT PRIMARY KEY,
    track_key     TEXT        NOT NULL,
    track_name    TEXT,
    artist_name   TEXT,
    album_name    TEXT,

    -- The ONLY enrichment field still obtainable. Free from recently-played
    -- responses; otherwise one GET /tracks/{id} per track (batch ?ids= removed).
    duration_ms   INTEGER,

    -- NOTE: energy / danceability / valence / tempo / popularity are absent by
    -- design. audio-features and audio-analysis were deprecated 2024-11-27 for
    -- all apps without prior extended access; popularity was removed from track
    -- objects in 2026-02. There is no replacement. Do not re-add these columns.

    fetched_at    TIMESTAMPTZ,
    fetch_failed  BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_tracks_key ON tracks (track_key);
CREATE INDEX idx_tracks_needs_enrichment
    ON tracks (fetched_at) WHERE duration_ms IS NULL AND fetch_failed = FALSE;


-- ---------------------------------------------------------------------------
-- saved_tracks — powers "most liked" via GET /me/library (user-library-read)
-- ---------------------------------------------------------------------------
CREATE TABLE saved_tracks (
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    spotify_uri TEXT        NOT NULL,
    track_key   TEXT        NOT NULL,
    added_at    TIMESTAMPTZ,
    synced_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, spotify_uri)
);


-- ---------------------------------------------------------------------------
-- import_batches — provenance + data-quality report per zip upload
-- ---------------------------------------------------------------------------
CREATE TABLE import_batches (
    id                 BIGSERIAL   PRIMARY KEY,
    user_id            UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename           TEXT,
    rows_seen          INTEGER     NOT NULL DEFAULT 0,
    rows_inserted      INTEGER     NOT NULL DEFAULT 0,
    rows_duplicate     INTEGER     NOT NULL DEFAULT 0,
    rows_rejected      INTEGER     NOT NULL DEFAULT 0,
    earliest_ts        TIMESTAMPTZ,
    latest_ts          TIMESTAMPTZ,                 -- becomes the coverage watermark
    unknown_fields     JSONB,                       -- format-drift early warning
    quality_notes      JSONB,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- sync_runs — observability. Silent staleness is the top product risk.
-- ---------------------------------------------------------------------------
CREATE TABLE sync_runs (
    id             BIGSERIAL   PRIMARY KEY,
    user_id        UUID        REFERENCES users(id) ON DELETE CASCADE,
    started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at    TIMESTAMPTZ,
    status         TEXT        NOT NULL
                   CHECK (status IN ('ok','partial','rate_limited','quota_exceeded',
                                     'auth_expired','error')),
    api_calls      INTEGER     NOT NULL DEFAULT 0,
    plays_inserted INTEGER     NOT NULL DEFAULT 0,
    -- TRUE when a poll returned a full 50 items: the window may have overflowed
    -- and plays may have been permanently lost. Signal to shorten the interval.
    window_saturated BOOLEAN   NOT NULL DEFAULT FALSE,
    error_detail   TEXT
);

CREATE INDEX idx_sync_runs_user ON sync_runs (user_id, started_at DESC);

-- Deferred FK: plays.import_batch_id -> import_batches.id
ALTER TABLE plays
    ADD CONSTRAINT plays_import_batch_fk
    FOREIGN KEY (import_batch_id) REFERENCES import_batches(id) ON DELETE SET NULL;


-- ---------------------------------------------------------------------------
-- user_stats_cache — precomputed leaderboards, refreshed bi-weekly
-- ---------------------------------------------------------------------------
CREATE TABLE user_stats_cache (
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stat_key    TEXT        NOT NULL,
    stat_period TEXT        NOT NULL,        -- 'ytd' | 'last_30d' | 'last_6m' | 'all_time'
    result_json JSONB       NOT NULL,
    -- Honesty fields: what fraction of rows had the inputs this stat needs.
    coverage_pct NUMERIC(5,2),
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, stat_key, stat_period)
);


-- ============================================================================
-- CATEGORIZATION QUERIES (corrected)
-- ============================================================================

-- MOST REPLAYED — grouped by track_key, NOT spotify_uri.
-- Counting only streams >= 30s, matching Spotify's own definition.
/*
SELECT track_key,
       MIN(track_name)  AS track_name,
       MIN(artist_name) AS artist_name,
       COUNT(*)         AS play_count
FROM plays
WHERE user_id = $1
  AND played_at >= date_trunc('year', now())
  AND is_counted_stream
GROUP BY track_key
ORDER BY play_count DESC
LIMIT 50;
*/

-- MOST LISTENED — by total time, excluding derived skips.
/*
SELECT track_key,
       MIN(track_name)  AS track_name,
       MIN(artist_name) AS artist_name,
       SUM(ms_played)   AS total_ms,
       COUNT(*)         AS play_count
FROM plays
WHERE user_id = $1
  AND played_at >= date_trunc('year', now())
  AND NOT is_skipped_derived
GROUP BY track_key
ORDER BY total_ms DESC
LIMIT 50;
*/

-- MOST SKIPPED — uses the DERIVED flag. Filtering skipped_raw returns ~nothing.
/*
SELECT track_key,
       MIN(track_name)  AS track_name,
       MIN(artist_name) AS artist_name,
       COUNT(*) FILTER (WHERE is_skipped_derived) AS skip_count,
       COUNT(*)                                   AS total_starts,
       ROUND(100.0 * COUNT(*) FILTER (WHERE is_skipped_derived) / COUNT(*), 1) AS skip_pct
FROM plays
WHERE user_id = $1 AND played_at >= date_trunc('year', now())
GROUP BY track_key
HAVING COUNT(*) >= 5
ORDER BY skip_pct DESC, total_starts DESC
LIMIT 50;
*/

-- COMPLETION RATE — only over tracks with a known duration. Report coverage_pct
-- alongside; duration is missing for any track never seen via the API.
/*
SELECT p.track_key,
       MIN(p.track_name) AS track_name,
       COUNT(*)          AS plays,
       ROUND(AVG(LEAST(100.0, 100.0 * p.ms_played / t.duration_ms)), 1) AS avg_completion_pct
FROM plays p
JOIN tracks t ON t.spotify_uri = p.spotify_uri AND t.duration_ms IS NOT NULL
WHERE p.user_id = $1 AND p.played_at >= date_trunc('year', now())
GROUP BY p.track_key
HAVING COUNT(*) >= 3
ORDER BY avg_completion_pct DESC
LIMIT 50;
*/

-- LISTENING STREAK — gap-and-islands. (The prompt left this as "research the pattern".)
-- Consecutive days minus a dense row_number is constant within a streak.
/*
WITH days AS (
    SELECT DISTINCT (played_at AT TIME ZONE $2)::date AS d
    FROM plays WHERE user_id = $1
),
grouped AS (
    SELECT d, d - (ROW_NUMBER() OVER (ORDER BY d))::int AS grp
    FROM days
)
SELECT MIN(d) AS streak_start, MAX(d) AS streak_end, COUNT(*) AS streak_days
FROM grouped
GROUP BY grp
ORDER BY streak_days DESC
LIMIT 10;
*/

-- SAVED BUT NEVER PLAYED — the "most liked" cross that's actually interesting.
/*
SELECT s.track_key, s.added_at
FROM saved_tracks s
LEFT JOIN plays p ON p.user_id = s.user_id AND p.track_key = s.track_key
WHERE s.user_id = $1 AND p.id IS NULL
ORDER BY s.added_at DESC;
*/

-- ============================================================================
-- SQLite / Cloudflare D1 dialect notes
-- ============================================================================
-- UUID           -> TEXT (application-generated)
-- TIMESTAMPTZ    -> TEXT (ISO-8601 UTC) or INTEGER (epoch ms). Be consistent.
-- BYTEA          -> BLOB
-- BIGSERIAL      -> INTEGER PRIMARY KEY AUTOINCREMENT
-- JSONB          -> TEXT, queried via json_extract()
-- GENERATED STORED is supported by SQLite 3.31+ (D1 qualifies).
-- COUNT(*) FILTER (WHERE x) -> SUM(CASE WHEN x THEN 1 ELSE 0 END)
-- date_trunc('year', now()) -> date('now','start of year')
-- The streak query's window functions work in SQLite 3.25+; date arithmetic
-- needs julianday(d) - ROW_NUMBER() OVER (ORDER BY d) as the grouping key.
