/**
 * Auth utilities:
 *  - Token generation & hashing
 *  - PKCE (S256) verification  – required by OAuth 2.1
 *  - Bearer token extraction from Request
 *  - Base URL helper
 *  - Revolut JWT assertion generation
 *  - Revolut token refresh helper
 */
import { createHash, randomBytes, createSign } from "crypto";
import { store } from "./store";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a cryptographically random URL-safe string */
export function generateId(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** SHA-256 hash a token so we never store raw bearer tokens */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Verify PKCE code_challenge against code_verifier (RFC 7636) */
export function verifyPKCE(
  verifier: string,
  challenge: string,
  method: string
): boolean {
  if (method === "S256") {
    const computed = createHash("sha256")
      .update(verifier)
      .digest("base64url");
    return computed === challenge;
  }
  if (method === "plain") {
    return verifier === challenge;
  }
  return false;
}

// ─── Token lifecycle ──────────────────────────────────────────────────────────

/** Create a new access token and persist its hash → userId */
export async function createAccessToken(userId: string): Promise<string> {
  const token = generateId(48);
  await store.setToken(hashToken(token), userId);
  return token;
}

/** Validate an inbound bearer token; returns userId or null */
export async function validateAccessToken(token: string): Promise<string | null> {
  return store.getUserFromToken(hashToken(token));
}

// ─── Request helpers ──────────────────────────────────────────────────────────

/** Extract the raw bearer token from an Authorization header */
export function extractBearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}

/** Get this deployment's public base URL (no trailing slash) */
export function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL.trim();
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** Build a 401 Unauthorized response that triggers the MCP OAuth flow */
export function unauthorizedResponse(): Response {
  const base = getBaseUrl();
  return new Response(
    JSON.stringify({ error: "unauthorized", error_description: "Valid bearer token required" }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`,
      },
    }
  );
}

// ─── Revolut JWT assertion ────────────────────────────────────────────────────

/**
 * Generate a signed JWT assertion for Revolut token requests (client_assertion).
 * Uses RS256 (RSA-SHA256) with the private key PEM from env.
 *
 * Revolut JWT claims:
 *   iss: your domain (base URL)
 *   sub: REVOLUT_CLIENT_ID
 *   aud: https://revolut.com
 *   exp: now + 300s
 *   nbf: now
 *   iat: now
 */
export function generateRevolutJWT(
  clientId: string,
  privateKeyPem: string,
  baseUrl: string
): string {
  const now = Math.floor(Date.now() / 1000);

  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" })
  ).toString("base64url");

  const payload = Buffer.from(
    JSON.stringify({
      iss: baseUrl,
      sub: clientId,
      aud: "https://revolut.com",
      exp: now + 300,
      nbf: now,
      iat: now,
    })
  ).toString("base64url");

  const signingInput = `${header}.${payload}`;

  const sign = createSign("RSA-SHA256");
  sign.update(signingInput);
  sign.end();
  const signature = sign.sign(privateKeyPem, "base64url");

  return `${signingInput}.${signature}`;
}

// ─── Revolut token refresh ────────────────────────────────────────────────────

interface RevolutEnv {
  clientId: string;
  privateKeyPem: string;
  baseUrl: string;
  environment: string;
}

interface RevolutTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
}

/**
 * Refresh a Revolut access token using the stored refresh token.
 * Returns the new token response or throws on failure.
 */
export async function refreshRevolutToken(
  refreshToken: string,
  env: RevolutEnv
): Promise<RevolutTokenResponse> {
  const isSandbox = env.environment.trim().toLowerCase() === "sandbox";
  const tokenUrl = isSandbox
    ? "https://sandbox-b2b.revolut.com/api/1.0/auth/token"
    : "https://b2b.revolut.com/api/1.0/auth/token";

  const jwtAssertion = generateRevolutJWT(
    env.clientId,
    env.privateKeyPem,
    env.baseUrl
  );

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_assertion_type:
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: jwtAssertion,
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Revolut token refresh failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<RevolutTokenResponse>;
}
