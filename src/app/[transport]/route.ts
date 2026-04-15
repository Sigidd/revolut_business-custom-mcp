/**
 * MCP transport endpoint — handles both SSE (/sse) and streamable HTTP (/mcp).
 *
 * OAuth 2.1 gate: withMcpAuth validates the bearer token, attaches userId
 * to request.auth.extra, then the inner handler loads credentials and creates
 * the per-request RevolutClient.
 *
 * IMPORTANT: The MCP connector URL must point to /mcp (not /sse or /).
 * Example: https://your-deployment.vercel.app/mcp
 */
import { createMcpHandler, withMcpAuth } from "@vercel/mcp-adapter";
import { validateAccessToken, getBaseUrl } from "@/lib/auth";
import { store } from "@/lib/store";
import { RevolutClient } from "@/lib/revolut";
import { registerTools } from "@/lib/tools";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

// Increase on Vercel Pro (max 300s) or Enterprise (max 800s)
export const maxDuration = 60;

async function mcpHandler(request: Request): Promise<Response> {
  const userId = request.auth?.extra?.userId as string | undefined;

  if (!userId) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const creds = await store.getCredentials(userId);
  if (!creds) {
    return new Response(
      JSON.stringify({
        error: "not_connected",
        error_description:
          "No Revolut credentials found. Please reconnect via the OAuth flow.",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  const client = new RevolutClient(userId);

  const handler = createMcpHandler(
    (server) => { registerTools(server, client); },
    { serverInfo: { name: "revolut-business-mcp", version: "1.0.0" } },
    { maxDuration, basePath: "" }
  );

  return handler(request);
}

// verifyToken: receives bearer token, returns AuthInfo with userId in extra
async function verifyToken(
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  const userId = await validateAccessToken(bearerToken);
  if (!userId) return undefined;
  return {
    token: bearerToken,
    clientId: "mcp-client",
    scopes: ["revolut"],
    extra: { userId },
  };
}

const authHandler = withMcpAuth(mcpHandler, verifyToken, {
  required: true,
  resourceUrl: getBaseUrl(),
});

export const GET = authHandler;
export const POST = authHandler;
export const DELETE = authHandler;
