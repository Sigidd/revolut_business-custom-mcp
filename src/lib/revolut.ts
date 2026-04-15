/**
 * Revolut Business API client.
 *
 * Handles:
 *  - Automatic token refresh (Revolut tokens expire in ~40 minutes)
 *  - All major API operations: accounts, transactions, payments, counterparties,
 *    team members, FX rates, webhooks, and payment drafts
 *
 * Base URLs:
 *   Production: https://b2b.revolut.com/api/1.0
 *   Sandbox:    https://sandbox-b2b.revolut.com/api/1.0
 */
import { store } from "./store";
import { generateRevolutJWT } from "./auth";

function getBaseApiUrl(): string {
  const env = (process.env.REVOLUT_ENVIRONMENT ?? "production").trim().toLowerCase();
  return env === "sandbox"
    ? "https://sandbox-b2b.revolut.com/api/1.0"
    : "https://b2b.revolut.com/api/1.0";
}

function getBaseApiUrlV2(): string {
  const env = (process.env.REVOLUT_ENVIRONMENT ?? "production").trim().toLowerCase();
  return env === "sandbox"
    ? "https://sandbox-b2b.revolut.com/api/2.0"
    : "https://b2b.revolut.com/api/2.0";
}

function getTokenUrl(): string {
  const env = (process.env.REVOLUT_ENVIRONMENT ?? "production").trim().toLowerCase();
  return env === "sandbox"
    ? "https://sandbox-b2b.revolut.com/api/1.0/auth/token"
    : "https://b2b.revolut.com/api/1.0/auth/token";
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RevolutAccount {
  id: string;
  name: string;
  balance: number;
  currency: string;
  state: string;
  public: boolean;
  created_at: string;
  updated_at: string;
}

export interface RevolutTransaction {
  id: string;
  type: string;
  state: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  legs: unknown[];
  reference?: string;
  merchant?: unknown;
}

export interface TransactionListParams {
  from?: string;
  to?: string;
  account?: string;
  limit?: number;
  type?: string;
}

export interface RevolutCounterparty {
  id: string;
  name: string;
  state: string;
  created_at: string;
  updated_at: string;
  accounts?: unknown[];
}

export interface RevolutTeamMember {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  state: string;
  role: string;
  created_at: string;
}

export interface RevolutWebhook {
  id: string;
  url: string;
  events: string[];
  created_at: string;
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class RevolutClient {
  constructor(private userId: string) {}

  /**
   * Get a valid access token, refreshing if needed.
   * Updates stored tokens in Supabase after refresh.
   */
  private async getAccessToken(): Promise<string> {
    const creds = await store.getCredentials(this.userId);
    if (!creds) {
      throw new Error("No Revolut credentials found for user. Please reconnect.");
    }

    // Check if token is expired (with 60s buffer)
    const now = Date.now();
    if (now < creds.tokenExpiresAt - 60_000) {
      return creds.accessToken;
    }

    // Token expired — refresh it
    const clientId = process.env.REVOLUT_CLIENT_ID?.trim();
    const rawPrivateKey = process.env.REVOLUT_PRIVATE_KEY?.trim();
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim() ?? "http://localhost:3000";

    if (!clientId || !rawPrivateKey) {
      throw new Error("REVOLUT_CLIENT_ID or REVOLUT_PRIVATE_KEY env vars missing");
    }

    // Handle literal \n in env var (common when set via Vercel dashboard)
    const privateKeyPem = rawPrivateKey.replace(/\\n/g, "\n");

    const jwtAssertion = generateRevolutJWT(clientId, privateKeyPem, baseUrl);

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: creds.refreshToken,
      client_assertion_type:
        "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: jwtAssertion,
    });

    const res = await fetch(getTokenUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Revolut token refresh failed (${res.status}): ${text}`);
    }

    const tokens = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    const newExpiresAt = Date.now() + tokens.expires_in * 1000;
    await store.setCredentials(
      this.userId,
      tokens.access_token,
      tokens.refresh_token ?? creds.refreshToken, // keep old refresh_token if Revolut doesn't rotate it
      newExpiresAt
    );

    return tokens.access_token;
  }

  /** Make an authenticated request to the Revolut Business API */
  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    baseUrl?: string
  ): Promise<T> {
    const accessToken = await this.getAccessToken();
    const url = `${baseUrl ?? getBaseApiUrl()}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      let errorText: string;
      try {
        const errJson = await res.json();
        errorText = JSON.stringify(errJson);
      } catch {
        errorText = await res.text();
      }
      throw new Error(`Revolut API error ${res.status} ${method} ${path}: ${errorText}`);
    }

    // Handle empty responses (e.g., 204 No Content)
    const contentType = res.headers.get("content-type") ?? "";
    if (res.status === 204 || !contentType.includes("application/json")) {
      return {} as T;
    }

    return res.json() as Promise<T>;
  }

  // ── Accounts ──────────────────────────────────────────────────────────────

  /** List all business accounts */
  async listAccounts(): Promise<RevolutAccount[]> {
    return this.request<RevolutAccount[]>("GET", "/accounts");
  }

  /** Get a single account by ID */
  async getAccount(id: string): Promise<RevolutAccount> {
    return this.request<RevolutAccount>("GET", `/accounts/${id}`);
  }

  // ── Transactions ─────────────────────────────────────────────────────────

  /** List transactions with optional filters */
  async listTransactions(params?: TransactionListParams): Promise<RevolutTransaction[]> {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.account) qs.set("account", params.account);
    if (params?.limit !== undefined) qs.set("count", String(params.limit));
    if (params?.type) qs.set("type", params.type);
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<RevolutTransaction[]>("GET", `/transactions${query}`);
  }

  /** Get a single transaction by ID */
  async getTransaction(id: string): Promise<RevolutTransaction> {
    return this.request<RevolutTransaction>("GET", `/transaction/${id}`);
  }

  // ── Payments ──────────────────────────────────────────────────────────────

  /** Create and submit a payment */
  async createPayment(body: unknown): Promise<unknown> {
    return this.request("POST", "/pay", body);
  }

  // ── Payment Drafts ────────────────────────────────────────────────────────

  /** Create a payment draft */
  async createPaymentDraft(body: unknown): Promise<unknown> {
    return this.request("POST", "/payment-drafts", body);
  }

  /** Get a specific payment draft by ID */
  async getPaymentDraft(id: string): Promise<unknown> {
    return this.request("GET", `/payment-drafts/${id}`);
  }

  /** List all payment drafts */
  async listPaymentDrafts(): Promise<unknown> {
    return this.request("GET", "/payment-drafts");
  }

  /** Delete a payment draft by ID */
  async deletePaymentDraft(id: string): Promise<unknown> {
    return this.request("DELETE", `/payment-drafts/${id}`);
  }

  // ── Counterparties ────────────────────────────────────────────────────────

  /** List all counterparties */
  async listCounterparties(): Promise<RevolutCounterparty[]> {
    return this.request<RevolutCounterparty[]>("GET", "/counterparties");
  }

  /** Get a single counterparty by ID */
  async getCounterparty(id: string): Promise<RevolutCounterparty> {
    return this.request<RevolutCounterparty>("GET", `/counterparty/${id}`);
  }

  /** Create a new counterparty */
  async createCounterparty(body: unknown): Promise<RevolutCounterparty> {
    return this.request<RevolutCounterparty>("POST", "/counterparty", body);
  }

  /** Delete a counterparty by ID */
  async deleteCounterparty(id: string): Promise<unknown> {
    return this.request("DELETE", `/counterparty/${id}`);
  }

  // ── Team Members ──────────────────────────────────────────────────────────

  /** List all team members */
  async listTeamMembers(): Promise<RevolutTeamMember[]> {
    return this.request<RevolutTeamMember[]>("GET", "/team-members");
  }

  // ── FX Rates ──────────────────────────────────────────────────────────────

  /** Get exchange rate between two currencies */
  async getExchangeRate(from: string, to: string, amount?: number): Promise<unknown> {
    const qs = new URLSearchParams({ from, to });
    if (amount !== undefined) qs.set("amount", String(amount));
    return this.request("GET", `/rate?${qs.toString()}`);
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  /** List all webhooks (v2 API) */
  async listWebhooks(): Promise<RevolutWebhook[]> {
    return this.request<RevolutWebhook[]>("GET", "/webhooks", undefined, getBaseApiUrlV2());
  }

  /** Create a new webhook (v2 API) */
  async createWebhook(url: string, events: string[]): Promise<RevolutWebhook> {
    return this.request<RevolutWebhook>("POST", "/webhooks", { url, events }, getBaseApiUrlV2());
  }

  /** Delete a webhook by ID (v2 API) */
  async deleteWebhook(id: string): Promise<unknown> {
    return this.request("DELETE", `/webhooks/${id}`, undefined, getBaseApiUrlV2());
  }
}
