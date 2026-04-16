/**
 * Revolut OAuth Callback Handler
 * GET /api/oauth/callback?code=...&state=...
 *
 * Steps:
 *  1. Look up the OAuth session by the `state` parameter (sessionId)
 *  2. Exchange the Revolut authorization code for tokens (POST /auth/token with JWT assertion)
 *  3. Fetch user identity from GET /accounts (use first account ID as stable identity)
 *  4. userId = SHA256(accountId).slice(0, 32) — deterministic, never changes
 *  5. Store Revolut tokens in Supabase
 *  6. Set `mcp_user_id` cookie (1 year, HttpOnly, Secure)
 *  7. Issue our own OAuth auth code → redirect to original redirect_uri with code+state
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { generateId, generateRevolutJWT, getBaseUrl } from "@/lib/auth";
import { store } from "@/lib/store";

const USER_COOKIE = "mcp_user_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function getTokenUrl(): string {
  const env = (process.env.REVOLUT_ENVIRONMENT ?? "production").trim().toLowerCase();
  return env === "sandbox"
    ? "https://sandbox-b2b.revolut.com/api/1.0/auth/token"
    : "https://b2b.revolut.com/api/1.0/auth/token";
}

function getApiBaseUrl(): string {
  const env = (process.env.REVOLUT_ENVIRONMENT ?? "production").trim().toLowerCase();
  return env === "sandbox"
    ? "https://sandbox-b2b.revolut.com/api/1.0"
    : "https://b2b.revolut.com/api/1.0";
}

function errorPage(message: string): Response {
  return new Response(
    `<!DOCTYPE html><html><head><title>Error</title></head><body>
    <h1>Authentication Error</h1>
    <p>${message}</p>
    <p>Please close this window and try again.</p>
    </body></html>`,
    { status: 400, headers: { "Content-Type": "text/html" } }
  );
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const code = p.get("code");
  const stateParam = p.get("state"); // This is our sessionId
  const errorParam = p.get("error");

  // Handle Revolut error responses (user denied, etc.)
  if (errorParam) {
    const errorDesc = p.get("error_description") ?? errorParam;
    return errorPage(`Revolut authorization failed: ${errorDesc}`);
  }

  if (!code || !stateParam) {
    return errorPage("Missing code or state parameter from Revolut callback");
  }

  // ── 1. Look up session ──────────────────────────────────────────────────
  const session = await store.getSession(stateParam);
  if (!session) {
    return errorPage("OAuth session expired or not found. Please try connecting again.");
  }

  // ── 2. Exchange code for Revolut tokens ────────────────────────────────
  // Prefer per-user credentials stored in the session; fall back to env vars
  // for backward compatibility with existing users (e.g. Sigid) who already
  // have a cookie but have no revolut_client_id stored.
  const revolutClientId =
    session.revolutClientId?.trim() ||
    process.env.REVOLUT_CLIENT_ID?.trim();
  const rawPrivateKey =
    session.revolutPrivateKey?.trim() ||
    process.env.REVOLUT_PRIVATE_KEY?.trim();
  const baseUrl = getBaseUrl();

  if (!revolutClientId || !rawPrivateKey) {
    return errorPage("Server configuration error: missing Revolut credentials");
  }

  // Handle literal \n in env var or in form-submitted key
  const privateKeyPem = rawPrivateKey.replace(/\\n/g, "\n");

  const callbackUrl = `${baseUrl}/api/oauth/callback`;

  let jwtAssertion: string;
  try {
    jwtAssertion = generateRevolutJWT(revolutClientId, privateKeyPem, baseUrl);
  } catch (e) {
    console.error("JWT generation failed:", e);
    return errorPage("Server error: failed to generate JWT assertion");
  }

  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl,
    client_assertion_type:
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: jwtAssertion,
  });

  let tokenData: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  };

  try {
    const tokenRes = await fetch(getTokenUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error("Revolut token exchange failed:", tokenRes.status, text);
      return errorPage(`Failed to exchange token with Revolut (${tokenRes.status})`);
    }

    tokenData = await tokenRes.json();
  } catch (e) {
    console.error("Token exchange network error:", e);
    return errorPage("Network error during token exchange");
  }

  const tokenExpiresAt = Date.now() + tokenData.expires_in * 1000;

  // ── 3. Fetch user identity from Revolut accounts ───────────────────────
  let accountId: string;
  try {
    const accountsRes = await fetch(`${getApiBaseUrl()}/accounts`, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/json",
      },
    });

    if (!accountsRes.ok) {
      const text = await accountsRes.text();
      console.error("Revolut accounts fetch failed:", accountsRes.status, text);
      return errorPage(`Failed to fetch Revolut accounts (${accountsRes.status})`);
    }

    const accounts = (await accountsRes.json()) as Array<{ id: string }>;
    if (!accounts || accounts.length === 0) {
      return errorPage("No Revolut accounts found for this user");
    }

    accountId = accounts[0].id;
  } catch (e) {
    console.error("Accounts fetch error:", e);
    return errorPage("Network error while fetching Revolut accounts");
  }

  // ── 4. Derive stable userId from accountId ─────────────────────────────
  const userId = createHash("sha256")
    .update(accountId)
    .digest("hex")
    .slice(0, 32);

  // ── 5. Store credentials in Supabase ───────────────────────────────────
  // Store per-user Revolut credentials only when they came from the setup form
  // (i.e. not from env vars). This lets getAccessToken() refresh using them.
  const storedClientId = session.revolutClientId?.trim() || undefined;
  const storedPrivateKey = session.revolutPrivateKey?.trim() || undefined;

  try {
    await store.setCredentials(
      userId,
      tokenData.access_token,
      tokenData.refresh_token,
      tokenExpiresAt,
      storedClientId,
      storedPrivateKey
    );
  } catch (e) {
    console.error("Store credentials error:", e);
    return errorPage("Failed to store credentials");
  }

  // Consume session (one-time use)
  await store.delSession(stateParam);

  // ── 6. Issue our own OAuth auth code ───────────────────────────────────
  const ourCode = generateId(32);
  await store.setCode(ourCode, {
    userId,
    clientId: session.clientId,
    redirectUri: session.redirectUri,
    codeChallenge: session.codeChallenge,
    codeChallengeMethod: session.codeChallengeMethod,
    scope: session.scope,
    createdAt: Date.now(),
  });

  // ── 7. Redirect back to MCP client with code ───────────────────────────
  const redirectUrl = new URL(session.redirectUri);
  redirectUrl.searchParams.set("code", ourCode);
  if (session.state) redirectUrl.searchParams.set("state", session.state);

  const response = NextResponse.redirect(redirectUrl.toString());

  // Set long-lived cookie for silent re-auth on future sessions
  response.cookies.set(USER_COOKIE, userId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });

  return response;
}
