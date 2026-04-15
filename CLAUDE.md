# Revolut Business MCP — Context for Claude

## What this project is

A **remote MCP server** that connects Claude to the Revolut Business API. It is a Next.js 15 app deployed on Vercel, using `@vercel/mcp-adapter`.

**MCP endpoint** (use this URL when adding the connector): `https://your-deployment.vercel.app/mcp`

---

## Architecture

```
Claude → OAuth 2.1 → /api/oauth/authorize
                   → Revolut consent screen (business.revolut.com/app-confirm)
                   → /api/oauth/callback (code exchange + token storage)
                   → Bearer token issued to Claude

Claude tool call → /mcp → withMcpAuth → RevolutClient → Revolut API
                                        (auto-refreshes tokens if expired)
```

### Key files

| File | Purpose |
|---|---|
| `src/app/[transport]/route.ts` | MCP endpoint (SSE + HTTP), auth gate |
| `src/lib/tools.ts` | All 18 MCP tool definitions |
| `src/lib/revolut.ts` | Revolut Business REST API client with auto token refresh |
| `src/lib/store.ts` | Supabase persistence layer |
| `src/lib/auth.ts` | Token generation, PKCE, bearer helpers, Revolut JWT generation |
| `src/app/api/oauth/authorize/route.ts` | OAuth 2.1 authorization endpoint + silent re-auth |
| `src/app/api/oauth/callback/route.ts` | Revolut callback handler — exchanges code, stores tokens |
| `src/app/api/oauth/token/route.ts` | Token exchange endpoint (our code → our bearer token) |
| `src/app/api/oauth/register/route.ts` | Dynamic client registration (RFC 7591) |

---

## OAuth Flow (differs from Freshsales)

This is real OAuth 2.0 with Revolut — no domain/API key form.

1. Claude calls `GET /api/oauth/authorize` with PKCE (S256 required)
2. **Silent re-auth**: if `mcp_user_id` cookie exists and credentials valid in Supabase → skip consent, issue code immediately
3. **First-time**: session saved to Supabase, user redirected to Revolut consent screen
4. User approves on Revolut → redirect to `GET /api/oauth/callback?code=...&state={sessionId}`
5. Callback exchanges Revolut code for tokens using JWT assertion
6. Fetches `/accounts` to get stable accountId → `userId = SHA256(accountId).slice(0, 32)`
7. Stores tokens in Supabase, sets `mcp_user_id` cookie (1 year)
8. Issues our own auth code → Claude exchanges for our Bearer token

---

## Revolut JWT Assertion

Token requests to Revolut require a signed JWT:
- Algorithm: RS256 (RSA-SHA256)
- Claims: `iss` (base URL), `sub` (client_id), `aud` ("https://revolut.com"), `exp` (+300s), `nbf`, `iat`
- Signed with `REVOLUT_PRIVATE_KEY` (RSA private key PEM)

See `generateRevolutJWT()` in `src/lib/auth.ts`.

---

## Token Refresh

Revolut access tokens expire in ~40 minutes (`expires_in: 2399`).

`RevolutClient.getAccessToken()`:
1. Loads credentials from Supabase
2. If `tokenExpiresAt - 60000 > Date.now()` → use stored token
3. Otherwise → call `POST /auth/token` with `grant_type=refresh_token` + JWT assertion
4. Store new tokens in Supabase

---

## Supabase Schema

```sql
mcp_credentials:    user_id (PK), access_token TEXT, refresh_token TEXT, token_expires_at BIGINT, connected_at BIGINT
mcp_oauth_sessions: session_id (PK), data JSONB, expires_at TIMESTAMPTZ
mcp_auth_codes:     code (PK), data JSONB, expires_at TIMESTAMPTZ
mcp_access_tokens:  token_hash (PK), user_id TEXT, expires_at TIMESTAMPTZ
mcp_oauth_clients:  client_id (PK), data JSONB
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_BASE_URL` | Public deployment URL, e.g. `https://revolut-mcp.vercel.app` |
| `REVOLUT_CLIENT_ID` | Client ID from Revolut Business API settings |
| `REVOLUT_PRIVATE_KEY` | RSA private key PEM (use `\n` for newlines in env) |
| `REVOLUT_ENVIRONMENT` | `production` or `sandbox` |
| `MCP_TOKEN_SECRET` | 64-char hex (reserved, generate with `openssl rand -hex 32`) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key (never exposed to browser) |

**Critical:** All env vars have `.trim()` applied everywhere they are read to prevent whitespace issues.

**Private key env format:** The private key may contain literal `\n` strings when set via Vercel dashboard. The code calls `.replace(/\n/g, "\n")` before using it. This is done in `revolut.ts` and `callback/route.ts`.

---

## Known Gotchas

1. **No middleware.ts** — Do NOT create a middleware.ts file. It causes routing conflicts with the MCP handler's pathname checks. The connector points directly to `/mcp`.

2. **`REVOLUT_PRIVATE_KEY` newlines** — Must replace `\n` with `\n` before passing to `createSign()`. Done everywhere the key is used.

3. **Connector URL** — Must be `https://your-deployment.vercel.app/mcp` (the `/mcp` path, not `/sse` or root).

4. **`force-dynamic` on well-known routes** — The oauth-authorization-server route uses `dynamic = "force-dynamic"` (not `force-static`) because `getBaseUrl()` reads env vars at runtime.

5. **`serverExternalPackages`** — `next.config.ts` must include `@vercel/mcp-adapter` in `serverExternalPackages` to avoid bundling issues on Vercel.

6. **Revolut redirect URI** — Must exactly match what's registered in the Revolut Business portal. The callback URL is always `{NEXT_PUBLIC_BASE_URL}/api/oauth/callback`.

7. **Icon files** — `public/icon.png` and `public/apple-touch-icon.png` are referenced in layout.tsx metadata but NOT included in this repo. Add them manually after cloning.

---

## API Base URLs

| Environment | API | Token | Consent |
|---|---|---|---|
| Production | `https://b2b.revolut.com/api/1.0` | `https://b2b.revolut.com/api/1.0/auth/token` | `https://business.revolut.com/app-confirm` |
| Sandbox | `https://sandbox-b2b.revolut.com/api/1.0` | `https://sandbox-b2b.revolut.com/api/1.0/auth/token` | `https://sandbox-business.revolut.com/app-confirm` |

---

## Tools (18 total)

| Category | Tools |
|---|---|
| Accounts | `list_accounts`, `get_account` |
| Transactions | `list_transactions`, `get_transaction` |
| Payments | `create_payment` |
| Payment Drafts | `create_payment_draft`, `get_payment_draft`, `list_payment_drafts`, `delete_payment_draft` |
| Counterparties | `list_counterparties`, `get_counterparty`, `create_counterparty`, `delete_counterparty` |
| Team Members | `list_team_members` |
| FX Rates | `get_exchange_rate` |
| Webhooks | `list_webhooks`, `create_webhook`, `delete_webhook` |
