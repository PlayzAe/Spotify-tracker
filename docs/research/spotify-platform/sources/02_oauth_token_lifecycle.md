# Source 02 — OAuth 2.0 flow and token lifecycle

**Verdict: the original prompt's STEP 4 claim that refresh tokens "do NOT expire" is
now false. This is the single most operationally significant finding for a cron-driven app.**

---

## S2.1 — Spotify, "Introducing refresh token expiration" (2026-06-18)

First-party engineering blog. **Authoritative.**
URL: https://developer.spotify.com/blog/2026-06-18-refresh-token-expiration

Verbatim:

> Refresh token lifetime is **"6 months from user authorization"**

> "Refreshing an access token does not reset or extend the refresh token's 6-month
> lifetime."

> On expiry the token endpoint returns "a `400 Bad Request` response with an
> `invalid_grant` error."

Scope and dates:
- Applies to **user-delegated flows only** — Authorization Code and Authorization Code
  with PKCE. **Client Credentials is unaffected.**
- New apps: effective immediately from 2026-06-18.
- Existing apps: enforcement from **2026-07-20**.
- Pre-existing refresh tokens are invalidated on next use if already past 6 months.

Recommended handling:

> Catch the `invalid_grant` error, discard stored tokens, and redirect users through the
> authorization flow rather than attempting retries.

---

## S2.2 — Independent corroboration (two unrelated project issue trackers)

Differently-typed sources — real projects breaking in the wild, which is strong evidence
the change is live rather than announced-only.

1. `raywo/MMM-NowPlayingOnSpotify` issue #151 — titled
   *"Refresh tokens will expire after 6 months (Spotify change, effective July 20, 2026)"*
2. `NousResearch/hermes-agent` issue #48381 — titled
   *"[BUG] Spotify refresh tokens expire after 6 months: no re-auth flow on invalid_grant"*

Additional detail surfaced in these threads and corroborated by the community discussion
thread (community.spotify.com/.../Refresh-token-expiration-discussion-thread/td-p/7474150):

> "Refresh tokens do not expose an issuance timestamp."

**Consequence for design:** you cannot introspect a stored refresh token to learn when it
expires. The backend must **record `authorized_at` itself** at the moment of the original
authorization and compute the 6-month deadline from that. This is a schema requirement,
and it is easy to miss.

---

## S2.3 — Which flow for a server-side backend

URL: https://developer.spotify.com/documentation/web-api/tutorials/code-flow and
secondary developer references.

> "The authorization code flow with PKCE is the recommended authorization flow if you're
> implementing authorization in a mobile app, single page web apps, or any other type of
> application where the client secret can't be safely stored."

**Finding — this corrects an assumption in the original prompt.** The prompt asked whether
to add PKCE to a server-side app "as an extra layer." PKCE exists to protect *public*
clients that cannot hold a secret. A confidential server-side backend that holds the
client secret should use **standard Authorization Code flow with the secret**. Adding PKCE
is not harmful, but it is not the meaningful hardening the prompt implies — it is
solving a problem this architecture does not have.

The genuinely load-bearing protections for this architecture are:
- `state` parameter validated on callback (CSRF) — the prompt has this correct
- client secret never leaving the server — correct
- refresh tokens encrypted at rest — correct
- exact redirect-URI matching

---

## S2.4 — Access token lifetime

Standard and unchanged across all sources: access tokens are valid for **3600 seconds
(1 hour)**, returned as `expires_in: 3600`.

Token response shape:

```
{
  "access_token":  "BQC...",
  "token_type":    "Bearer",
  "scope":         "user-top-read user-read-recently-played ...",
  "expires_in":    3600,
  "refresh_token": "AQD..."
}
```

Note: a refresh response **sometimes** returns a new `refresh_token`. The backend must
persist it when present and keep the old one when absent. Critically — per S2.1, a
rotated refresh token does **not** restart the 6-month clock.

---

## Corrected token-lifecycle model

| Property | Original prompt said | Reality (Aug 2026) |
|---|---|---|
| Access token TTL | 3600s | 3600s — correct |
| Refresh token TTL | "does NOT expire" | **6 months from original authorization** |
| Does refreshing extend it? | n/a | **No** |
| Expiry signal | n/a | `400` + `invalid_grant` |
| Can you read expiry from the token? | n/a | **No** — you must store `authorized_at` |
| Revocation signal | 401 on refresh | `invalid_grant`; treat identically → re-auth |

**Design consequence:** an unattended bi-weekly cron has a hard **6-month operational
life** per user. Around day ~165 the backend must proactively notify the user to
re-authorize. Without this, the app silently stops updating — the worst failure mode for
a stats product, because the UI keeps showing stale data that looks valid.
