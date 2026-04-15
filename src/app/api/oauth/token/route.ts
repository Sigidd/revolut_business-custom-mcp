/**
 * OAuth 2.1 Token Endpoint
 * POST /api/oauth/token
 *
 * Exchanges an authorization code + PKCE verifier for a Bearer access token.
 * Only authorization_code grant is supported.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyPKCE, createAccessToken } from "@/lib/auth";
import { store } from "@/lib/store";

function oauthError(error: string, description: string, status = 400) {
  return NextResponse.json({ error, error_description: description }, { status });
}

export async function POST(req: NextRequest) {
  // Accept both application/x-www-form-urlencoded and application/json
  let params: URLSearchParams;
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    params = new URLSearchParams(body);
  } else {
    const text = await req.text();
    params = new URLSearchParams(text);
  }

  const grantType = params.get("grant_type");
  const code = params.get("code");
  const redirectUri = params.get("redirect_uri");
  const codeVerifier = params.get("code_verifier");
  const clientId = params.get("client_id");

  if (grantType !== "authorization_code") {
    return oauthError("unsupported_grant_type", "Only authorization_code is supported");
  }

  if (!code || !redirectUri || !codeVerifier || !clientId) {
    return oauthError(
      "invalid_request",
      "code, redirect_uri, code_verifier, and client_id are required"
    );
  }

  // Look up the auth code
  const authCode = await store.getCode(code);
  if (!authCode) {
    return oauthError("invalid_grant", "Authorization code not found or expired", 401);
  }

  // Validate client and redirect_uri
  if (authCode.clientId !== clientId || authCode.redirectUri !== redirectUri) {
    return oauthError("invalid_grant", "client_id or redirect_uri mismatch", 401);
  }

  // Verify PKCE (protects against authorization code interception)
  if (authCode.codeChallenge) {
    const method = authCode.codeChallengeMethod ?? "S256";
    if (!verifyPKCE(codeVerifier, authCode.codeChallenge, method)) {
      return oauthError("invalid_grant", "PKCE verification failed", 401);
    }
  }

  // Consume the code (one-time use)
  await store.delCode(code);

  // Issue access token (30 days)
  const accessToken = await createAccessToken(authCode.userId);

  return NextResponse.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 30 * 24 * 3600, // 30 days
    scope: authCode.scope ?? "revolut",
  });
}
