# Roadmap

This repo (an MCP server for Xero) is part of a series of open MCP servers built by BackCrew. Like [backcrew-mcp-quickbooks](https://github.com/jayson-svg/backcrew-mcp-quickbooks), it's accounting software rather than a CRM/FSM platform, meant to run alongside a CRM/FSM server so an AI assistant can answer questions that span both. See [backcrew-mcp-housecall-pro](https://github.com/jayson-svg/backcrew-mcp-housecall-pro)'s ROADMAP.md for the full CRM/FSM platform research and status table.

## Why Xero, and why the scope is narrow

Xero is the accounting platform most pest control and field-service businesses in the UK, Australia, and New Zealand already use — the market QuickBooks covers in the US. Its API docs (`developer.xero.com`) are fully public, and Xero itself publishes a complete OpenAPI 3.0 specification for the Accounting API (confirmed at [`XeroAPI/Xero-OpenAPI`](https://github.com/XeroAPI/Xero-OpenAPI)), which this repo was built directly against, field by field, the same way this series' ServiceM8 repo used ServiceM8's own OpenAPI schema.

Xero's full API surface is large (manual journals, budgets, tracking categories, purchase orders, quotes, payroll, assets, reporting, and more). Per this series' established scoping approach, this repo covers exactly six areas: Contacts, Invoices (sales), Bills (purchases), Payments, Bank Transactions, and Accounts (read-only reference). This keeps the repo accurate and reviewable rather than attempting a full accounting-system clone. See the README's [Scope](README.md#scope-this-is-intentionally-narrow) section.

## Xero already ships an official MCP server: see this repo's README

Before building, we checked whether Xero already had this covered. They do: an open-source server at [`XeroAPI/xero-mcp-server`](https://github.com/XeroAPI/xero-mcp-server) with 50+ commands spanning invoices, credit notes, bank transactions, manual journals, quotes, contacts, items, accounts, tax rates, tracking categories, reports, and (region-dependent) payroll. It's genuinely broader than this repo. The gap it leaves: it's built around Xero's **Custom Connections**, a paid add-on that skips the OAuth consent screen, or a bearer-token mode where the client runs its own OAuth/PKCE flow — either way, more setup friction or cost than the free, standard OAuth flow this repo defaults to. It also doesn't have this series' tiered read/write safety model; scope is controlled purely by which OAuth scopes you granted. Full comparison is in the README's [Why use an independent MCP server instead of Xero's own official one?](README.md#why-use-an-independent-mcp-server-instead-of-xeros-own-official-one) section; read that before assuming this repo is redundant.

## Following the established pattern, with one platform-specific addition

- Read Xero's own published OpenAPI 3.0 specification directly (`xero_accounting.yaml`, ~25,000 lines, covering the full Accounting API), cross-checked against the prose docs at `developer.xero.com`, rather than transcribing endpoint-by-endpoint from a JS-rendered docs site or inferring from a third-party SDK.
- One Node/TypeScript MCP server, shared typed client (`src/client.ts`).
- **Read-only by default with tiered write access**: `XERO_MCP_MODE` (default `read_only`) and `XERO_MCP_PROFILE` (`readonly-owner` / `office-ops` / `admin`).
- No BackCrew business-logic tools in this open repo.
- Friendly, plain-language README, with read vs. write actions clearly separated and a visible warning before the write section.
- **New for this repo**: Xero doesn't split customers/suppliers or bills/invoices into separate objects the way QuickBooks does — one `Contact` can be a customer, supplier, or both, and a "bill" is just an `Invoice` with `Type=ACCPAY` served through the same endpoint as sales invoices. This repo still splits them into separate tool files (`contacts.ts` handling both roles; `bills.ts` split from `invoices.ts`) because this series ties safety tier to what an action *means* financially, not to how the vendor's schema happens to be shaped — see the README's "For developers" notes.
- **Also new**: this repo supports two Xero auth modes — the free, standard `authorization_code` flow (default, matches this series' "no plan-tier gate" principle) and Xero's paid `client_credentials` Custom Connection (optional, for operators who already have one and want to skip refresh-token management). No other repo in this series has an optional second auth mode.
- **Carried over from QuickBooks**: rotating refresh tokens are also a Xero quirk (60-day unused expiry, new token issued on every refresh) — handled the same way as this series' QuickBooks repo: refreshed automatically in-memory during a run, logged to stderr, not persisted to disk automatically.

## What's next

Natural scope additions, in rough priority order: Credit Notes (to mirror invoices/bills for refunds), Manual Journals, Quotes (to compare against a CRM/FSM's own estimate data), and the Accounting API's reporting endpoints (Profit & Loss, Aged Receivables/Payables) for read-only financial summaries.

See [backcrew-mcp-housecall-pro](https://github.com/jayson-svg/backcrew-mcp-housecall-pro)'s ROADMAP.md for the full CRM/FSM platform research and status table across the rest of the series.
