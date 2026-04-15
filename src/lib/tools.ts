/**
 * Registers all Revolut Business MCP tools on the given McpServer instance.
 * Each tool returns JSON text content or an isError response.
 *
 * Tools:
 *   Accounts:         list_accounts, get_account
 *   Transactions:     list_transactions, get_transaction
 *   Payments:         create_payment
 *   Payment Drafts:   create_payment_draft, get_payment_draft, list_payment_drafts, delete_payment_draft
 *   Counterparties:   list_counterparties, get_counterparty, create_counterparty, delete_counterparty
 *   Team Members:     list_team_members
 *   FX:               get_exchange_rate
 *   Webhooks:         list_webhooks, create_webhook, delete_webhook
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RevolutClient } from "./revolut";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
function err(e: unknown): ToolResult {
  const msg = e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
}

const optStr = z.string().optional();
const optNum = z.number().optional();

export function registerTools(server: McpServer, client: RevolutClient) {
  // ════════════════════════════════════════════════════════════════
  // ACCOUNTS
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "list_accounts",
    "List all Revolut Business accounts with balances and currencies",
    {},
    async () => {
      try { return ok(await client.listAccounts()); } catch (e) { return err(e); }
    }
  );

  server.tool(
    "get_account",
    "Get a single Revolut Business account by ID",
    { id: z.string().describe("Account UUID") },
    async ({ id }) => {
      try { return ok(await client.getAccount(id)); } catch (e) { return err(e); }
    }
  );

  // ════════════════════════════════════════════════════════════════
  // TRANSACTIONS
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "list_transactions",
    "List transactions with optional date range, account, type, and limit filters",
    {
      from: optStr.describe("Start date/time in ISO 8601 format, e.g. 2024-01-01T00:00:00Z"),
      to: optStr.describe("End date/time in ISO 8601 format, e.g. 2024-12-31T23:59:59Z"),
      account: optStr.describe("Filter by account UUID"),
      limit: optNum.describe("Maximum number of transactions to return (default 100, max 1000)"),
      type: optStr.describe("Transaction type filter, e.g. transfer, card_payment, exchange, topup"),
    },
    async ({ from, to, account, limit, type }) => {
      try {
        return ok(await client.listTransactions({ from, to, account, limit, type }));
      } catch (e) { return err(e); }
    }
  );

  server.tool(
    "get_transaction",
    "Get a single transaction by ID",
    { id: z.string().describe("Transaction UUID") },
    async ({ id }) => {
      try { return ok(await client.getTransaction(id)); } catch (e) { return err(e); }
    }
  );

  // ════════════════════════════════════════════════════════════════
  // PAYMENTS
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "create_payment",
    "Create and submit a payment to a counterparty. Requires counterparty ID and account details.",
    {
      account_id: z.string().describe("Source account UUID"),
      receiver: z.object({
        counterparty_id: z.string().describe("Counterparty UUID"),
        account_id: optStr.describe("Counterparty account UUID (if multiple accounts)"),
      }),
      amount: z.number().positive().describe("Payment amount"),
      currency: z.string().length(3).describe("3-letter currency code, e.g. EUR, USD, GBP"),
      reference: optStr.describe("Payment reference/description"),
      schedule_for: optStr.describe("Schedule payment for a future date (ISO 8601)"),
    },
    async (args) => {
      const { account_id, receiver, amount, currency, reference, schedule_for } = args;
      const body: Record<string, unknown> = {
        account_id,
        receiver,
        amount,
        currency,
      };
      if (reference) body.reference = reference;
      if (schedule_for) body.schedule_for = schedule_for;
      try { return ok(await client.createPayment(body)); } catch (e) { return err(e); }
    }
  );

  // ════════════════════════════════════════════════════════════════
  // PAYMENT DRAFTS
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "create_payment_draft",
    "Create a payment draft (pending approval) for one or more payments",
    {
      title: optStr.describe("Draft title for identification"),
      schedule_for: optStr.describe("Date to schedule all payments (ISO 8601 date)"),
      payments: z.array(z.object({
        account_id: z.string().describe("Source account UUID"),
        receiver: z.object({
          counterparty_id: z.string(),
          account_id: optStr,
        }),
        amount: z.number().positive(),
        currency: z.string().length(3),
        reference: optStr,
      })).describe("List of payments to include in the draft"),
    },
    async (args) => {
      try { return ok(await client.createPaymentDraft(args)); } catch (e) { return err(e); }
    }
  );

  server.tool(
    "get_payment_draft",
    "Get a specific payment draft by ID",
    { id: z.string().describe("Payment draft UUID") },
    async ({ id }) => {
      try { return ok(await client.getPaymentDraft(id)); } catch (e) { return err(e); }
    }
  );

  server.tool(
    "list_payment_drafts",
    "List all payment drafts",
    {},
    async () => {
      try { return ok(await client.listPaymentDrafts()); } catch (e) { return err(e); }
    }
  );

  server.tool(
    "delete_payment_draft",
    "Delete a payment draft by ID",
    { id: z.string().describe("Payment draft UUID to delete") },
    async ({ id }) => {
      try { return ok(await client.deletePaymentDraft(id)); } catch (e) { return err(e); }
    }
  );

  // ════════════════════════════════════════════════════════════════
  // COUNTERPARTIES
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "list_counterparties",
    "List all counterparties (payees/vendors) in your Revolut Business account",
    {},
    async () => {
      try { return ok(await client.listCounterparties()); } catch (e) { return err(e); }
    }
  );

  server.tool(
    "get_counterparty",
    "Get a single counterparty by ID",
    { id: z.string().describe("Counterparty UUID") },
    async ({ id }) => {
      try { return ok(await client.getCounterparty(id)); } catch (e) { return err(e); }
    }
  );

  server.tool(
    "create_counterparty",
    "Create a new counterparty. For Revolut users use profile_type='personal'/'business' with revolut_id. For external bank accounts provide bank details.",
    {
      profile_type: z.enum(["personal", "business"]).optional()
        .describe("Revolut profile type — use for Revolut-to-Revolut transfers"),
      name: optStr.describe("Counterparty display name"),
      revolut_id: optStr.describe("Revolut username or phone for Revolut counterparty"),
      phone: optStr.describe("Phone number for Revolut personal counterparty"),
      email: optStr.describe("Email for Revolut business counterparty"),
      bank_country: optStr.describe("2-letter ISO country code for external bank account"),
      currency: optStr.describe("3-letter currency code for external bank account"),
      account_no: optStr.describe("Bank account number"),
      sort_code: optStr.describe("UK sort code"),
      iban: optStr.describe("IBAN for SEPA transfers"),
      bic: optStr.describe("BIC/SWIFT code"),
      company_name: optStr.describe("Company name for external business counterparty"),
    },
    async (args) => {
      // Build body omitting undefined fields
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(args)) {
        if (v !== undefined) body[k] = v;
      }
      try { return ok(await client.createCounterparty(body)); } catch (e) { return err(e); }
    }
  );

  server.tool(
    "delete_counterparty",
    "Delete a counterparty by ID",
    { id: z.string().describe("Counterparty UUID to delete") },
    async ({ id }) => {
      try { return ok(await client.deleteCounterparty(id)); } catch (e) { return err(e); }
    }
  );

  // ════════════════════════════════════════════════════════════════
  // TEAM MEMBERS
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "list_team_members",
    "List all team members in your Revolut Business account",
    {},
    async () => {
      try { return ok(await client.listTeamMembers()); } catch (e) { return err(e); }
    }
  );

  // ════════════════════════════════════════════════════════════════
  // FX RATES
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "get_exchange_rate",
    "Get the current exchange rate between two currencies",
    {
      from: z.string().length(3).describe("Source currency code, e.g. EUR"),
      to: z.string().length(3).describe("Target currency code, e.g. USD"),
      amount: optNum.describe("Amount in source currency (defaults to 1)"),
    },
    async ({ from, to, amount }) => {
      try { return ok(await client.getExchangeRate(from, to, amount)); } catch (e) { return err(e); }
    }
  );

  // ════════════════════════════════════════════════════════════════
  // WEBHOOKS
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "list_webhooks",
    "List all configured webhooks",
    {},
    async () => {
      try { return ok(await client.listWebhooks()); } catch (e) { return err(e); }
    }
  );

  server.tool(
    "create_webhook",
    "Create a new webhook subscription for Revolut Business events",
    {
      url: z.string().url().describe("HTTPS URL to receive webhook events"),
      events: z.array(z.string()).describe(
        "List of event types to subscribe to, e.g. ['TransactionCreated', 'PaymentCreated', 'PayerAuthorisationCompleted']"
      ),
    },
    async ({ url, events }) => {
      try { return ok(await client.createWebhook(url, events)); } catch (e) { return err(e); }
    }
  );

  server.tool(
    "delete_webhook",
    "Delete a webhook by ID",
    { id: z.string().describe("Webhook UUID to delete") },
    async ({ id }) => {
      try { return ok(await client.deleteWebhook(id)); } catch (e) { return err(e); }
    }
  );
}
