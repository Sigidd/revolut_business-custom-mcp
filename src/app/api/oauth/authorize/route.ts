/**
 * OAuth 2.1 Authorization Endpoint
 * GET /api/oauth/authorize
 *
 * Flow:
 *  1. Validate OAuth params (client_id, redirect_uri, PKCE)
 *  2. Check for a long-lived `mcp_user_id` cookie set at first login.
 *     If found AND credentials still exist → silent re-auth: skip Revolut consent,
 *     issue an auth code directly and redirect back to the MCP client.
 *  3. Otherwise → save session and redirect user to Revolut's consent screen.
 *
 * Revolut consent URL:
 *   https://business.revolut.com/app-confirm?client_id=...&redirect_uri=...&response_type=code&scope=READ,WRITE&state={sessionId}
 */
import { NextRequest, NextResponse } from "next/server";
import { generateId, getBaseUrl } from "@/lib/auth";
import { store } from "@/lib/store";

const USER_COOKIE = "mcp_user_id";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const clientId = p.get("client_id");
  const redirectUri = p.get("redirect_uri");
  const responseType = p.get("response_type");
  const codeChallenge = p.get("code_challenge");
  const codeChallengeMethod = p.get("code_challenge_method");
  const state = p.get("state") ?? undefined;
  const scope = p.get("scope") ?? undefined;

  // ── 1. Basic validation ──────────────────────────────────────────────────
  if (!clientId || !redirectUri || responseType !== "code") {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description:
          "client_id, redirect_uri, and response_type=code are required",
      },
      { status: 400 }
    );
  }

  if (!codeChallenge || codeChallengeMethod !== "S256") {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "PKCE code_challenge with S256 method is required",
      },
      { status: 400 }
    );
  }

  const knownClient = await store.getClient(clientId);
  if (knownClient && !knownClient.redirectUris.includes(redirectUri)) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "redirect_uri mismatch" },
      { status: 400 }
    );
  }

  // ── 2. Silent re-auth: check long-lived cookie ───────────────────────────
  const cookieUserId = req.cookies.get(USER_COOKIE)?.value;
  if (cookieUserId) {
    const creds = await store.getCredentials(cookieUserId);
    if (creds) {
      // Credentials still valid → skip Revolut consent, issue code immediately
      const code = generateId(32);
      await store.setCode(code, {
        userId: cookieUserId,
        clientId,
        redirectUri,
        codeChallenge,
        codeChallengeMethod,
        scope,
        createdAt: Date.now(),
      });

      const redirect = new URL(redirectUri);
      redirect.searchParams.set("code", code);
      if (state) redirect.searchParams.set("state", state);

      return NextResponse.redirect(redirect.toString());
    }
  }

  // ── 3. First-time auth: persist session and redirect to setup page ───────
  const sessionId = generateId();
  await store.setSession(sessionId, {
    clientId,
    redirectUri,
    state,
    codeChallenge,
    codeChallengeMethod,
    scope,
    createdAt: Date.now(),
  });

  const baseUrl = getBaseUrl();
  return NextResponse.redirect(`${baseUrl}/api/oauth/setup?session=${sessionId}`);
}
