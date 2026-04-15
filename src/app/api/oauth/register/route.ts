/**
 * RFC 7591 — OAuth 2.0 Dynamic Client Registration
 * POST /api/oauth/register
 *
 * MCP clients (Claude) call this to obtain a client_id before starting the
 * authorization flow. We issue a public client (no secret needed, PKCE required).
 */
import { NextRequest, NextResponse } from "next/server";
import { generateId } from "@/lib/auth";
import { store, RegisteredClient } from "@/lib/store";

export async function POST(req: NextRequest) {
  let body: { redirect_uris?: string[]; client_name?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (!body.redirect_uris?.length) {
    return NextResponse.json(
      {
        error: "invalid_client_metadata",
        error_description: "redirect_uris is required",
      },
      { status: 400 }
    );
  }

  const clientId = generateId(16);
  const client: RegisteredClient = {
    clientId,
    clientSecret: "", // public client — no secret
    redirectUris: body.redirect_uris,
    clientName: body.client_name,
    createdAt: Date.now(),
  };

  await store.setClient(clientId, client);

  return NextResponse.json(
    {
      client_id: clientId,
      redirect_uris: client.redirectUris,
      client_name: client.clientName,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    },
    { status: 201 }
  );
}
