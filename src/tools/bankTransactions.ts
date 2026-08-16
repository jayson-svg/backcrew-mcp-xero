import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { XeroClient } from "../client.js";
import { buildWhereClause } from "../client.js";
import { registerJsonTool } from "../toolkit.js";

// Xero's closest equivalent to QuickBooks' "Purchase" entity (an
// already-paid expense with no separate bill) is a BankTransaction of
// Type=SPEND — money leaving an account directly, not through a bill.
// The mirror image, Type=RECEIVE, covers money arriving directly (not
// through a sales invoice) — e.g. a cash sale or a bank-fee refund. Split
// into two write tools for the same reason payments.ts splits: money out
// is admin tier, money in is office-ops.
const lineItemShape = z.object({
  Description: z.string().optional(),
  Quantity: z.number().optional(),
  UnitAmount: z.number().optional(),
  AccountCode: z.string().describe("Chart-of-accounts code this line hits — see list_accounts"),
  TaxType: z.string().optional(),
  LineAmount: z.number().optional(),
});

export function registerBankTransactionTools(server: McpServer, client: XeroClient): void {
  registerJsonTool(
    server,
    "list_bank_transactions",
    "List direct bank transactions (spend/receive money not tied to an invoice or bill), with optional type/reference filtering and pagination. Maps to GET /BankTransactions.",
    "readonly-owner",
    {
      type: z.enum(["SPEND", "RECEIVE"]).optional(),
      reference: z.string().optional(),
      page: z.number().int().min(1).optional().describe("Up to 100 transactions returned per page, with line items"),
    },
    async ({ type, reference, page }) => {
      const clauses: string[] = [];
      if (type) clauses.push(`Type=="${type}"`);
      return client.get("/BankTransactions", {
        where: buildWhereClause(clauses),
        References: reference,
        page,
      });
    },
  );

  registerJsonTool(
    server,
    "get_bank_transaction",
    "Get a single bank transaction by BankTransactionID. Maps to GET /BankTransactions/{BankTransactionID}.",
    "readonly-owner",
    { bankTransactionId: z.string() },
    async ({ bankTransactionId }) => client.get(`/BankTransactions/${bankTransactionId}`),
  );

  registerJsonTool(
    server,
    "record_received_money",
    "Record money received directly into a bank account (Type=RECEIVE) — not tied to a sales invoice, e.g. a cash sale. Maps to POST /BankTransactions.",
    "office-ops",
    {
      bankAccountId: z.string().describe("The bank account the money landed in — see list_accounts"),
      contactId: z.string().optional().describe("Optional — who the money came from"),
      LineItems: z.array(lineItemShape).min(1),
      Date: z.string().optional().describe("YYYY-MM-DD"),
      Reference: z.string().optional(),
    },
    async ({ bankAccountId, contactId, ...fields }) =>
      client.post("/BankTransactions", {
        BankTransactions: [
          {
            Type: "RECEIVE",
            BankAccount: { AccountID: bankAccountId },
            ...(contactId ? { Contact: { ContactID: contactId } } : {}),
            ...fields,
          },
        ],
      }),
  );

  registerJsonTool(
    server,
    "record_spend_money",
    "Record money spent directly from a bank account (Type=SPEND) — an already-paid expense with no separate bill. Money leaving the business, admin tier only. Maps to POST /BankTransactions.",
    "admin",
    {
      bankAccountId: z.string().describe("The bank account the money left from — see list_accounts"),
      contactId: z.string().optional().describe("Optional — who the money went to"),
      LineItems: z.array(lineItemShape).min(1),
      Date: z.string().optional().describe("YYYY-MM-DD"),
      Reference: z.string().optional(),
    },
    async ({ bankAccountId, contactId, ...fields }) =>
      client.post("/BankTransactions", {
        BankTransactions: [
          {
            Type: "SPEND",
            BankAccount: { AccountID: bankAccountId },
            ...(contactId ? { Contact: { ContactID: contactId } } : {}),
            ...fields,
          },
        ],
      }),
  );

  registerJsonTool(
    server,
    "delete_bank_transaction",
    "Delete a bank transaction (only works before it's been bank-reconciled). Irreversible, admin tier only. Maps to POST /BankTransactions/{BankTransactionID} with Status=DELETED.",
    "admin",
    { bankTransactionId: z.string() },
    async ({ bankTransactionId }) =>
      client.post(`/BankTransactions/${bankTransactionId}`, { BankTransactions: [{ Status: "DELETED" }] }),
  );
}
