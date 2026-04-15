/**
 * RFC 8414 — OAuth 2.0 Authorization Server Metadata
 * GET /.well-known/oauth-authorization-server  (rewritten from next.config.ts)
 *
 * Advertises our OAuth 2.1 endpoints to MCP clients (Claude).
 */
import { getBaseUrl } from "@/lib/auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const base = getBaseUrl().trim();
  return NextResponse.json({
    issuer: base,
    authorization_endpoint: `${base}/api/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    // Display metadata — used by MCP clients (e.g. Claude.ai) to show icon and name
    service_documentation: base,
    logo_uri: `${base}/icon.png`,
  });
}
