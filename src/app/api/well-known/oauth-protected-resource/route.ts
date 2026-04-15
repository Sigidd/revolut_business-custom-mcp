/**
 * RFC 9728 — OAuth 2.0 Protected Resource Metadata
 * GET /.well-known/oauth-protected-resource  (rewritten in next.config.ts)
 *
 * Uses the built-in helper from @vercel/mcp-adapter.
 */
import {
  protectedResourceHandler,
  metadataCorsOptionsRequestHandler,
} from "@vercel/mcp-adapter";
import { getBaseUrl } from "@/lib/auth";

export function GET(req: Request) {
  const base = getBaseUrl().trim();
  return protectedResourceHandler({ authServerUrls: [base], resourceUrl: base })(req);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
