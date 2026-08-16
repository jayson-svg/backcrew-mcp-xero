#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { XeroClient } from "./client.js";
import { registerContactTools } from "./tools/contacts.js";
import { registerInvoiceTools } from "./tools/invoices.js";
import { registerBillTools } from "./tools/bills.js";
import { registerPaymentTools } from "./tools/payments.js";
import { registerBankTransactionTools } from "./tools/bankTransactions.js";
import { registerAccountTools } from "./tools/accounts.js";
import { registerOrganisationTools } from "./tools/organisations.js";

const client = new XeroClient({
  authMode: process.env.XERO_AUTH_MODE,
  clientId: process.env.XERO_CLIENT_ID ?? "",
  clientSecret: process.env.XERO_CLIENT_SECRET ?? "",
  tenantId: process.env.XERO_TENANT_ID,
  accessToken: process.env.XERO_ACCESS_TOKEN,
  refreshToken: process.env.XERO_REFRESH_TOKEN,
  scopes: process.env.XERO_SCOPES,
});

const server = new McpServer({
  name: "backcrew-xero-mcp",
  version: "0.1.0",
});

registerContactTools(server, client);
registerInvoiceTools(server, client);
registerBillTools(server, client);
registerPaymentTools(server, client);
registerBankTransactionTools(server, client);
registerAccountTools(server, client);
registerOrganisationTools(server, client);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const mode = process.env.XERO_MCP_MODE ?? "read_only";
  const profile = process.env.XERO_MCP_PROFILE ?? "readonly-owner";
  console.error(
    `BackCrew Xero MCP server running on stdio (XERO_MCP_MODE=${mode}, XERO_MCP_PROFILE=${profile})`,
  );
}

main().catch((error) => {
  console.error("Fatal error starting BackCrew Xero MCP server:", error);
  process.exit(1);
});
