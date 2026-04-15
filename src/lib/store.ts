/**
 * Supabase store — all persistent state lives here.
 *
 * Tables (all in public schema, RLS disabled, anon role has GRANT ALL):
 *   mcp_credentials       – Revolut token data per userId
 *   mcp_oauth_sessions    – OAuth session during authorize flow (10 min TTL)
 *   mcp_auth_codes        – Auth code pending token exchange (5 min TTL)
 *   mcp_access_tokens     – Bearer token hash → userId (30 day TTL)
 *   mcp_oauth_clients     – Dynamically registered OAuth clients
 *
 * Expired rows are filtered out in queries; periodic cleanup is left
 * to a pg_cron job or manual DELETE WHERE expires_at < NOW().
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

function db(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL!.trim(),
    process.env.SUPABASE_ANON_KEY!.trim()
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserCredentials {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number;
  connectedAt: number;
}

export interface OAuthSession {
  clientId: string;
  redirectUri: string;
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  scope?: string;
  createdAt: number;
}

export interface AuthCode {
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  scope?: string;
  createdAt: number;
}

export interface RegisteredClient {
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
  clientName?: string;
  createdAt: number;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const store = {
  // ── Revolut credentials ─────────────────────────────────────────────────────
  async setCredentials(
    userId: string,
    accessToken: string,
    refreshToken: string,
    tokenExpiresAt: number
  ) {
    const { error } = await db().from("mcp_credentials").upsert({
      user_id: userId,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: tokenExpiresAt,
      connected_at: Date.now(),
    });
    if (error) throw new Error(`setCredentials: ${error.message}`);
  },

  async getCredentials(userId: string): Promise<UserCredentials | null> {
    const { data, error } = await db()
      .from("mcp_credentials")
      .select("access_token, refresh_token, token_expires_at, connected_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenExpiresAt: data.token_expires_at,
      connectedAt: data.connected_at,
    };
  },

  // ── OAuth sessions ─────────────────────────────────────────────────────────
  async setSession(sessionId: string, session: OAuthSession) {
    const { error } = await db().from("mcp_oauth_sessions").upsert({
      session_id: sessionId,
      data: session,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (error) throw new Error(`setSession: ${error.message}`);
  },

  async getSession(sessionId: string): Promise<OAuthSession | null> {
    const { data, error } = await db()
      .from("mcp_oauth_sessions")
      .select("data")
      .eq("session_id", sessionId)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error || !data) return null;
    return data.data as OAuthSession;
  },

  async delSession(sessionId: string) {
    await db().from("mcp_oauth_sessions").delete().eq("session_id", sessionId);
  },

  // ── Auth codes ─────────────────────────────────────────────────────────────
  async setCode(code: string, authCode: AuthCode) {
    const { error } = await db().from("mcp_auth_codes").upsert({
      code,
      data: authCode,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
    if (error) throw new Error(`setCode: ${error.message}`);
  },

  async getCode(code: string): Promise<AuthCode | null> {
    const { data, error } = await db()
      .from("mcp_auth_codes")
      .select("data")
      .eq("code", code)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error || !data) return null;
    return data.data as AuthCode;
  },

  async delCode(code: string) {
    await db().from("mcp_auth_codes").delete().eq("code", code);
  },

  // ── Access tokens ──────────────────────────────────────────────────────────
  async setToken(tokenHash: string, userId: string) {
    const { error } = await db().from("mcp_access_tokens").upsert({
      token_hash: tokenHash,
      user_id: userId,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (error) throw new Error(`setToken: ${error.message}`);
  },

  async getUserFromToken(tokenHash: string): Promise<string | null> {
    const { data, error } = await db()
      .from("mcp_access_tokens")
      .select("user_id")
      .eq("token_hash", tokenHash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error || !data) return null;
    return data.user_id;
  },

  async delToken(tokenHash: string) {
    await db().from("mcp_access_tokens").delete().eq("token_hash", tokenHash);
  },

  // ── OAuth clients ──────────────────────────────────────────────────────────
  async setClient(clientId: string, client: RegisteredClient) {
    const { error } = await db().from("mcp_oauth_clients").upsert({
      client_id: clientId,
      data: client,
    });
    if (error) throw new Error(`setClient: ${error.message}`);
  },

  async getClient(clientId: string): Promise<RegisteredClient | null> {
    const { data, error } = await db()
      .from("mcp_oauth_clients")
      .select("data")
      .eq("client_id", clientId)
      .maybeSingle();
    if (error || !data) return null;
    return data.data as RegisteredClient;
  },
};
