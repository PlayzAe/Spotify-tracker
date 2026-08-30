# 07 — Technical contract

What the data actually looks like, and the four traps that produce wrong numbers.
Implementation is yours; these constraints aren't.

---

## The file

- User uploads a `.zip` from Spotify's privacy page
- Inside: JSON files named **`Streaming_History_Audio_*.json`** — these are the ones that
  matter. Ignore video/technical/marquee files
- Each JSON is capped around **12 MB**; a 10-year history can total **150 MB+** and
  hundreds of thousands of records
- Large exports may arrive as **multiple zips**

## Record shape

```json
{
  "ts": "2025-07-15T07:11:08Z",
  "platform": "android",
  "ms_played": 55229,
  "conn_country": "GB",
  "master_metadata_track_name": "Blinding Lights",
  "master_metadata_album_artist_name": "The Weeknd",
  "master_metadata_album_album_name": "After Hours",
  "spotify_track_uri": "spotify:track:0VjIjW4GlUZAMYd2vXMi3b",
  "episode_name": null,
  "episode_show_name": null,
  "reason_start": "fwdbtn",
  "reason_end": "trackdone",
  "shuffle": false,
  "skipped": false,
  "offline": false,
  "offline_timestamp": null,
  "incognito_mode": false
}
```

**Not present:** track duration, genre, artwork, popularity. See file 04.

---

## The four traps

These are researched, confirmed defects. Each produces plausible-looking wrong output —
which is worse than an error, because nothing signals the problem.

### Trap 1 — `skipped` lies

The field exists but was **not populated between 2015-04-13 and 2022-10-16**. Filtering on
`skipped === true` returns almost nothing for older history — and looks like "you never
skip anything" rather than a bug.

**Derive it instead:**

```js
const isSkipped = record.skipped === true ||
  ['backbtn', 'unknown', 'endplay', 'fwdbtn'].includes(record.reason_end);
```

### Trap 2 — the same song has multiple URIs

One recording gets **different `spotify_track_uri` values** across single, album, and
deluxe reissue. Grouping by URI splits one song into three rows with a third of the plays
each — corrupting the headline "most replayed" stat.

**Group leaderboards by a normalized key:**

```js
const trackKey = `${title}|${artist}`
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')   // strip accents
  .replace(/\s*[\(\[].*?(remaster|remix|feat|version|edit).*?[\)\]]/gi, '')
  .replace(/\s*-\s*\d{4}\s*remaster.*$/i, '')
  .replace(/\s+/g, ' ')
  .trim();
```

⚠️ **Balance against last.fm's failure mode** (file 02, cluster G): over-aggressive
merging combines genuinely different artists with similar names. When in doubt, don't
merge. Keep the original strings for display; use the key only for grouping.

### Trap 3 — a "play" needs 30 seconds

Spotify counts a stream at **≥30,000 ms**. Below that it's a skip, not a play.

Counting everything inflates play counts and makes skip-heavy sessions look like
listening. Use `ms_played >= 30000` for play-count stats; keep sub-30s plays for skip
analysis.

### Trap 4 — nulls are normal

- `master_metadata_track_name` is **null for podcasts** (use `episode_name`) and for local
  files
- `spotify_track_uri` is null for local files
- `offline_timestamp` changed units (seconds → milliseconds) partway through history —
  **don't use it**

Parse defensively. Never crash on a missing field; skip the record and count it.

---

## Performance requirements

The parse must not freeze the tab or crash mobile.

- **Web Worker** — parsing on the main thread locks the UI for a 150 MB file
- **Stream file-by-file.** Don't decompress the whole archive into memory at once; each
  inner file is ~12 MB, which is a natural chunk boundary
- **Aggregate incrementally.** Build counters as you parse; don't hold every record in
  memory. The stats need totals, not the raw array
- **Report real progress** from the worker — files done, plays counted
- **Test on mid-range Android**, not just a dev laptop. Mobile is where this breaks

Suggested library: `fflate` (small, fast, streaming) over `JSZip` for large archives —
verify yourself.

---

## Hosting

Static site. No backend, no build-time secrets, no environment variables.

Cloudflare Pages or GitHub Pages free tier serves this at any traffic level for $0 —
which is the whole economic model. Nothing in the frontend should require a runtime
server.

**Recommended headers** (both hosts support these):
- A strict `Content-Security-Policy` — with ads, allow only what AdSense needs
- No third-party scripts beyond the ad script and the consent manager

Fewer third-party scripts is both a privacy posture and a performance win.

---

## Definition of done

- [ ] 150 MB+ export parses on mid-range mobile without crashing
- [ ] UI stays responsive throughout (worker confirmed, not just assumed)
- [ ] Skip stat uses derived logic, not the raw field
- [ ] Leaderboards group by normalized key, not URI
- [ ] Play counts respect the 30s threshold
- [ ] Malformed file → partial results, not total failure
- [ ] Wrong-export upload → the specific guiding error, not a generic one
- [ ] Zero network requests contain user data (verify in DevTools Network tab)
- [ ] Snapshot date visible on results
- [ ] Works with JS-heavy content blockers and with ads declined
