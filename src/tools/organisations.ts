import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { XeroClient } from "../client.js";
import { registerJsonTool } from "../toolkit.js";

// A small setup-helper tool, not part of the Accounting API proper: lists
// the organisations (Xero calls them "tenants") your access token is
// authorized for. Handy for finding your XERO_TENANT_ID during setup
// without leaving the assistant. No-op in client_credentials (Custom
// Connection) mode, since that mode is locked to one organisation and
// this endpoint isn't scoped by tenant anyway. Maps to
// GET https://api.xero.com/connections.
export function registerOrganisationTools(server: McpServer, client: XeroClient): void {
  registerJsonTool(
    server,
    "list_organisations",
    "List the Xero organisations your credentials are connected to, each with the tenantId to use as XERO_TENANT_ID. Maps to GET https://api.xero.com/connections.",
    "readonly-owner",
    {},
    async () => client.listConnections(),
  );
}
