/**
 * Homepage — lists available tools and shows connection instructions.
 */

const tools = [
  // Accounts
  { name: "list_accounts", description: "List all Revolut Business accounts with balances and currencies" },
  { name: "get_account", description: "Get a single account by ID" },
  // Transactions
  { name: "list_transactions", description: "List transactions with optional date range, account, type, and limit filters" },
  { name: "get_transaction", description: "Get a single transaction by ID" },
  // Payments
  { name: "create_payment", description: "Create and submit a payment to a counterparty" },
  // Payment Drafts
  { name: "create_payment_draft", description: "Create a payment draft (pending approval)" },
  { name: "get_payment_draft", description: "Get a specific payment draft by ID" },
  { name: "list_payment_drafts", description: "List all payment drafts" },
  { name: "delete_payment_draft", description: "Delete a payment draft" },
  // Counterparties
  { name: "list_counterparties", description: "List all counterparties (payees/vendors)" },
  { name: "get_counterparty", description: "Get a single counterparty by ID" },
  { name: "create_counterparty", description: "Create a new counterparty (Revolut or external bank)" },
  { name: "delete_counterparty", description: "Delete a counterparty" },
  // Team Members
  { name: "list_team_members", description: "List all team members in your Revolut Business account" },
  // FX
  { name: "get_exchange_rate", description: "Get current exchange rate between two currencies" },
  // Webhooks
  { name: "list_webhooks", description: "List all configured webhooks" },
  { name: "create_webhook", description: "Create a new webhook subscription for Revolut events" },
  { name: "delete_webhook", description: "Delete a webhook" },
];

export default function HomePage() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 800, margin: "0 auto", padding: "2rem 1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
        <img
          src="/icon.png"
          alt="Revolut Business MCP"
          width={64}
          height={64}
          style={{ borderRadius: 12 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
        <div>
          <h1 style={{ margin: 0, fontSize: "1.8rem" }}>Revolut Business MCP</h1>
          <p style={{ margin: "0.25rem 0 0", color: "#666" }}>
            Connect Claude to your Revolut Business account
          </p>
        </div>
      </div>

      <section style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: "1rem 1.25rem", marginBottom: "2rem" }}>
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1rem", color: "#0369a1" }}>Quick Install</h2>
        <p style={{ margin: "0 0 0.5rem", fontSize: "0.9rem" }}>
          Add this MCP server to Claude using the URL below:
        </p>
        <code style={{ display: "block", background: "#e0f2fe", padding: "0.5rem 0.75rem", borderRadius: 6, fontFamily: "monospace", fontSize: "0.9rem", wordBreak: "break-all" }}>
          https://your-deployment.vercel.app/mcp
        </code>
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.8rem", color: "#0369a1" }}>
          Note: the connector URL must end with <strong>/mcp</strong>
        </p>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.2rem", marginBottom: "0.75rem" }}>How it works</h2>
        <ol style={{ paddingLeft: "1.25rem", lineHeight: 1.7, color: "#374151" }}>
          <li>Add the MCP server URL (<code>/mcp</code>) to Claude</li>
          <li>Claude triggers the OAuth flow — you are redirected to Revolut to authorize</li>
          <li>After authorization, Claude can access your Revolut Business data</li>
          <li>Future sessions use silent re-auth (no repeat consent needed)</li>
        </ol>
      </section>

      <section>
        <h2 style={{ fontSize: "1.2rem", marginBottom: "0.75rem" }}>
          Available Tools ({tools.length})
        </h2>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {tools.map((tool) => (
            <div
              key={tool.name}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.75rem",
                padding: "0.6rem 0.75rem",
                background: "#f9fafb",
                borderRadius: 6,
                border: "1px solid #e5e7eb",
              }}
            >
              <code style={{ fontFamily: "monospace", fontSize: "0.85rem", color: "#7c3aed", flexShrink: 0 }}>
                {tool.name}
              </code>
              <span style={{ fontSize: "0.875rem", color: "#6b7280" }}>{tool.description}</span>
            </div>
          ))}
        </div>
      </section>

      <footer style={{ marginTop: "3rem", paddingTop: "1rem", borderTop: "1px solid #e5e7eb", fontSize: "0.8rem", color: "#9ca3af" }}>
        <p>Powered by the <a href="https://modelcontextprotocol.io" style={{ color: "#6366f1" }}>Model Context Protocol</a> and <a href="https://vercel.com" style={{ color: "#6366f1" }}>Vercel</a></p>
      </footer>
    </main>
  );
}
