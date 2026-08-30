# Source 01 — Rate limits and the anti-spam question

**Verdict: H2 CONFIRMED. Rate limiting is a non-problem at this scale — but a *quota*
limit now exists that is distinct from the rate limit, and it is shared per developer account.**

---

## S1.1 — Spotify, Rate Limits documentation (first-party)

URL: https://developer.spotify.com/documentation/web-api/concepts/rate-limits

Verbatim:

> "Spotify's API rate limit is calculated based on the number of calls that your app
> makes to Spotify in a **rolling 30 second window**."

> "If your app exceeds the rate limit for your app then you'll begin to see 429 error
> responses from Spotify's Web API."

> "The header of the 429 response will normally include a `Retry-After` header with a
> value in seconds."

> "the limit varies depending on whether your app is in development mode or extended
> quota mode"

> Apps in extended quota mode "have a rate limit that is much higher than apps in
> development mode, the default mode for new apps."

> Some endpoints have "custom rate limit[s] that may differ from your app-wide rate limit"

**Spotify publishes no numeric threshold.** This is confirmed — the original prompt's
FACT 4 is correct and remains correct.

---

## S1.2 — Community and secondary corroboration

Sources: Spotify Community threads on rate limiting (multiple, 2021–2025); independent
developer write-ups.

Consistent findings across sources:

> "Requests are counted in rolling windows, not fixed intervals (e.g., 0:00–0:30,
> 0:15–0:45, etc.)"

> "The only correct way is to use a back-off principle and handle the 429 response
> correctly by implementing a wait-time equal to the value in the `Retry-After` header."

**On the prompt's four [VERIFY] items:**

| Prompt's expected finding | Verdict |
|---|---|
| "Rate limit is approximately 10–30 requests per second per access token" | **[INSUFFICIENT EVIDENCE]** — no reliable triangulated number exists. Community estimates vary wildly and none are authoritative. Do not design to a number. |
| "The `Retry-After` header tells you exactly how long to wait" | **CONFIRMED** — first-party, with the hedge that it is included "normally," not always. Code must default to a fallback when the header is absent. |
| "Rate limits reset on a rolling window, not a fixed clock" | **CONFIRMED** — first-party, explicit |
| "Polling recently-played more than once per 30 seconds is aggressive" | **[INSUFFICIENT EVIDENCE]** as a stated rule, but trivially irrelevant here — the design polls once per 14 days |

The correct engineering posture, given the absence of published numbers: **do not target
a threshold — implement `Retry-After`-driven backoff and keep steady-state volume
negligible.** Both are satisfied by the design.

---

## S1.3 — The new QUOTA_EXCEEDED signal (2026-07-23)

URL: https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates

Verbatim:

> "When your quota is exceeded, the 429 Too Many Requests response now returns a
> structured JSON body with a `reason`: `QUOTA_EXCEEDED` field."

> "the quota for all of those apps is shared under a single budget"

**This is a genuinely new failure mode not contemplated in the original prompt.** A 429
now means one of two different things:

| `reason` | Meaning | Correct response |
|---|---|---|
| absent / rate-limit 429 | Too many requests in the rolling 30s window | Honour `Retry-After`, back off, retry — transient |
| `QUOTA_EXCEEDED` | Developer-account budget exhausted | **Do not retry.** Abort the run, alert. Retrying makes it worse |

Code that treats all 429s identically will hammer a quota-exhausted account with retries.
The sync algorithm branches on this field.

---

## S1.4 — Call budget arithmetic (recomputed for the corrected user cap)

The prompt's math assumed 25 users. The real cap is 5. Recomputed, and adjusted for the
fact that the recently-played window is only 50 items (see `04_gdpr_zip_format.md`, S4.4):

Per user, per bi-weekly sync:

| Call | Count |
|---|---|
| `GET /me` | 1 |
| `GET /me/top/tracks` × 3 time ranges | 3 |
| `GET /me/top/artists` × 3 time ranges | 3 |
| `GET /me/player/recently-played?limit=50` | 1 (see note) |
| **Subtotal** | **8** |

Note: the prompt budgeted "1–3 calls, paginated until you reach the last sync timestamp."
That is not achievable — the endpoint holds only 50 items total and cursors cannot page
beyond it. One call retrieves everything available. Budgeting more is harmless but
pointless.

Optional metadata backfill: `GET /tracks/{id}` singly, for tracks lacking `duration_ms`.
Rate-limited by choice to a slow trickle (see `sync_algorithm.md`).

**Totals:**

- 5 users × 8 calls = **40 calls per bi-weekly run**
- Staggered 5s apart across users → run completes in well under a minute
- Even compressed into a single 30-second window: 40 requests / 30s ≈ **1.3 req/s**
- With the recommended 1s inter-call delay: **~0.2 req/s sustained**

Against even the most pessimistic community estimate of the undocumented limit, this has
orders of magnitude of headroom. **H2 confirmed with wide margin.**

The original prompt's core anti-spam insight — *never call Spotify on user page loads;
serve everything from your own database* — is architecturally correct and is retained
unchanged. It remains the single most important design decision in the document, and it
matters even more now that quota is account-wide.
