import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { XeroClient } from "../client.js";
import { buildWhereClause } from "../client.js";
import { registerJsonTool } from "../toolkit.js";

// Read-only reference data — the chart of accounts. Every line item on an
// invoice, bill, or bank transaction needs an AccountCode/AccountID from
// here, so these lookups exist to support the other tools, the same role
// Vendors plays in this series' QuickBooks repo. Creating/editing accounts
// is chart-of-accounts administration (renumbering, changing account
// types), which is out of scope for this repo — see README.
export function registerAccountTools(server: McpServer, client: XeroClient): void {
  registerJsonTool(
    server,
    "list_accounts",
    "List the full chart of accounts, with optional type/class filtering. Maps to GET /Accounts.",
    "readonly-owner",
    {
      accountClass: z.enum(["ASSET", "EQUITY", "EXPENSE", "LIABILITY", "REVENUE"]).optional(),
      status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
    },
    async ({ accountClass, status }) => {
      const clauses: string[] = [];
      if (accountClass) clauses.push(`Class=="${accountClass}"`);
      if (status) clauses.push(`Status=="${status}"`);
      return client.get("/Accounts", { where: buildWhereClause(clauses) });
    },
  );

  registerJsonTool(
    server,
    "get_account",
    "Get a single account by AccountID. Maps to GET /Accounts/{AccountID}.",
    "readonly-owner",
    { accountId: z.string().describe("Xero AccountID (GUID)") },
    async ({ accountId }) => client.get(`/Accounts/${accountId}`),
  );
}
