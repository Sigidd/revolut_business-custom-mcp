# Revolut Business MCP Server

A remote MCP (Model Context Protocol) server that connects Claude to the Revolut Business API. Built with Next.js 15 and deployed on Vercel.

## Quick Install

Add the MCP server to Claude using this URL:

```
https://your-deployment.vercel.app/mcp
```

**IMPORTANT: The connector URL must end with `/mcp`** — not `/sse`, not `/`, not `/api`.

Claude will automatically trigger the OAuth flow to connect your Revolut Business account.

---

## Available Tools (18 total)

| Category | Tool | Description |
|---|---|---|
| Accounts | `list_accounts` | List all accounts with balances |
| Accounts | `get_account` | Get a single account by ID |
| Transactions | `list_transactions` | List transactions with filters (date, account, type, limit) |
| Transactions | `get_transaction` | Get a single transaction by ID |
| Payments | `create_payment` | Create and submit a payment |
| Payment Drafts | `create_payment_draft` | Create a draft (pending approval) |
| Payment Drafts | `get_payment_draft` | Get a draft by ID |
| Payment Drafts | `list_payment_drafts` | List all drafts |
| Payment Drafts | `delete_payment_draft` | Delete a draft |
| Counterparties | `list_counterparties` | List all payees/vendors |
| Counterparties | `get_counterparty` | Get a counterparty by ID |
| Counterparties | `create_counterparty` | Add a new counterparty |
| Counterparties | `delete_counterparty` | Remove a counterparty |
| Team | `list_team_members` | List team members |
| FX | `get_exchange_rate` | Get current FX rate |
| Webhooks | `list_webhooks` | List webhooks |
| Webhooks | `create_webhook` | Create a webhook subscription |
| Webhooks | `delete_webhook` | Delete a webhook |

---

## Setup Guide

### 1. Generate your RSA key pair — start here

> **Why is this needed?**
> Revolut Business API uses certificate-based authentication instead of a simple API key. This means you prove your identity using a **public/private key pair**:
> - The **public key** is uploaded to Revolut — it lets Revolut verify that requests come from you.
> - The **private key** stays on your side (never shared) — it signs every token request so Revolut knows it's authentic.
>
> This is the standard for secure server-to-server OAuth (RFC 7523 / JWT Bearer). Without this key pair you cannot create a certificate on Revolut, so **this is the very first thing to do**.
>
> 📖 [Official Revolut Business API documentation](https://developer.revolut.com/docs/guides/manage-accounts/get-started/make-your-first-api-call)

**Mac / Linux — Terminal:**
```bash
# 1. Generate RSA private key (keep this secret, never share it)
openssl genrsa -out private.pem 2048

# 2. Generate X509 public certificate (this is what you upload to Revolut)
openssl req -new -x509 -key private.pem -out public.pem -days 1825 -subj "/CN=Revolut MCP"
```

**Windows — PowerShell or Git Bash:**
```powershell
# Same commands — OpenSSL is included with Git for Windows
openssl genrsa -out private.pem 2048
openssl req -new -x509 -key private.pem -out public.pem -days 1825 -subj "/CN=Revolut MCP"
```

> Don't have OpenSSL on Windows? [Download it here](https://slproweb.com/products/Win32OpenSSL.html) or use Git Bash.

You now have two files in your current folder:
| File | What it is | What to do with it |
|---|---|---|
| `public.pem` | Your public certificate | Upload to Revolut when creating the certificate |
| `private.pem` | Your private key | Paste into the Claude setup form — **never share this** |

---

### 2. Create the API certificate on Revolut Business

Go to **Revolut Business → Settings (⚙️) → API → Business API**.

![Revolut Business API settings](docs/screenshots/revolut-api-settings.png)

Click **"Aggiungi"** (Add) in the top-right of the Certificates section.

---

### 3. Fill in the certificate form

![Add certificate modal](docs/screenshots/revolut-add-certificate.png)

Fill in the modal:
- **Titolo certificato** — give it a name (e.g. `Claude MCP`)
- **URI di reindirizzamento OAuth** — paste exactly:
  ```
  https://your-deployment.vercel.app/api/oauth/callback
  ```
- **Chiave pubblica X509** — paste the full contents of your `public.pem` file

Click **"Continua"**.

---

### 4. Copy your Client ID

![Certificate detail with Client ID](docs/screenshots/revolut-client-id.png)

After creation, Revolut shows the certificate detail panel on the right. Copy the **ID cliente** (starts with `po_live_` or `po_test_`) — you'll need it in the next step.

---

### 5. Connect via Claude

When you add the MCP connector to Claude for the first time, you'll be guided through a setup form that asks for:
- Your **Client ID** from Revolut
- Your **private key** (`private.pem` contents)

The form validates the format live and walks you through each step.

---

### 6. Supabase Setup

Create a Supabase project and run this SQL:

```sql
-- Revolut credentials (tokens)
CREATE TABLE mcp_credentials (
  user_id TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at BIGINT NOT NULL,
  connected_at BIGINT NOT NULL,
  revolut_client_id TEXT,
  revolut_private_key TEXT
);

-- OAuth sessions (10-min TTL, stores PKCE state)
CREATE TABLE mcp_oauth_sessions (
  session_id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Auth codes (5-min TTL, single use)
CREATE TABLE mcp_auth_codes (
  code TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Bearer tokens (30-day TTL, stored as SHA-256 hashes)
CREATE TABLE mcp_access_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Dynamically registered OAuth clients
CREATE TABLE mcp_oauth_clients (
  client_id TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

-- Grant anon role access (used by supabase-js)
GRANT ALL ON mcp_credentials TO anon;
GRANT ALL ON mcp_oauth_sessions TO anon;
GRANT ALL ON mcp_auth_codes TO anon;
GRANT ALL ON mcp_access_tokens TO anon;
GRANT ALL ON mcp_oauth_clients TO anon;

-- Disable RLS
ALTER TABLE mcp_credentials DISABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_oauth_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_auth_codes DISABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_access_tokens DISABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_oauth_clients DISABLE ROW LEVEL SECURITY;
```

> If you already have the tables, just run:
> ```sql
> ALTER TABLE mcp_credentials ADD COLUMN IF NOT EXISTS revolut_client_id TEXT;
> ALTER TABLE mcp_credentials ADD COLUMN IF NOT EXISTS revolut_private_key TEXT;
> ```

---

### 7. Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_BASE_URL=https://your-deployment.vercel.app
REVOLUT_CLIENT_ID=your_revolut_client_id
REVOLUT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
REVOLUT_ENVIRONMENT=production
MCP_TOKEN_SECRET=<64-char hex, generate with: openssl rand -hex 32>
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=your_anon_key
```

> **Multi-tenant mode:** `REVOLUT_CLIENT_ID` and `REVOLUT_PRIVATE_KEY` are only needed for the first/admin user. Other users provide their own credentials through the setup form during OAuth.

**REVOLUT_PRIVATE_KEY format:** Use `\n` (literal backslash-n) for newlines when setting in Vercel or `.env`. The code converts them to real newlines automatically.

```bash
# Format private key for env var:
cat private.pem | awk 'NF {printf "%s\\n", $0}'
```

---

### 8. Deploy to Vercel

```bash
npm install
npx vercel deploy --prod
```

Set env vars in Vercel dashboard or via CLI:

```bash
npx vercel env add REVOLUT_CLIENT_ID
npx vercel env add REVOLUT_PRIVATE_KEY
npx vercel env add REVOLUT_ENVIRONMENT
npx vercel env add MCP_TOKEN_SECRET
npx vercel env add SUPABASE_URL
npx vercel env add SUPABASE_ANON_KEY
npx vercel env add NEXT_PUBLIC_BASE_URL
```

### 9. Add to Claude

In Claude's MCP settings, add a new remote server:

```
URL: https://your-deployment.vercel.app/mcp
```

---

## Architecture

```
Claude -> OAuth 2.1 -> /api/oauth/authorize
                    -> /api/oauth/setup  (first-time: collect Revolut credentials)
                    -> Revolut consent screen
                    -> /api/oauth/callback (exchanges code, stores tokens)
                    -> Bearer token issued to Claude

Claude tool call -> /mcp -> withMcpAuth -> RevolutClient -> Revolut API
                                          (auto-refreshes expired tokens)
```

## Multi-tenant

Each user who adds the connector goes through the setup form once and enters their own Revolut Business `Client ID` and `private key`. Their credentials are stored securely in Supabase and never shared. Subsequent sessions use silent re-auth via a long-lived cookie.

## Token Refresh

Revolut access tokens expire in ~40 minutes. The `RevolutClient` automatically:
1. Checks token expiry before each API call (with 60-second buffer)
2. Uses the stored refresh token + JWT assertion to get a fresh token
3. Updates the stored tokens in Supabase

This is transparent to Claude — no re-authentication required.

## Sandbox Mode

Set `REVOLUT_ENVIRONMENT=sandbox` to use Revolut sandbox:
- Token endpoint: `https://sandbox-b2b.revolut.com/api/1.0/auth/token`
- API: `https://sandbox-b2b.revolut.com/api/1.0/`
- Consent: `https://sandbox-business.revolut.com/app-confirm`
