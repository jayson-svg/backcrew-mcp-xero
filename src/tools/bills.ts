import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { XeroClient } from "../client.js";
import { buildWhereClause } from "../client.js";
import { registerJsonTool } from "../toolkit.js";

// Xero-specific quirk worth flagging: there is no separate "Bill" object.
// A bill is just an Invoice with Type=ACCPAY, served through the exact
// same /Invoices endpoint as customer invoices. This repo still splits
// them into their own file (matching this series' QuickBooks repo, which
// has a real separate Bill entity) because the *safety tier* should
// differ: invoicing a customer is routine front-desk work (office-ops),
// while a bill represents money the business owes — closer in spirit to
// the "financially consequential" writes that are admin-tier throughout
// this series. See README for the full rationale.
const lineItemShape = z.object({
  Description: z.string().optional(),
  Quantity: z.number().optional(),
  UnitAmount: z.number().optional(),
  AccountCode: z.string().optional().describe("Chart-of-accounts code — see list_accounts"),
  ItemCode: z.string().optional(),
  TaxType: z.string().optional().describe("Tax type from the org's tax rates, e.g. INPUT2 (AU GST), INPUT (NZ GST), 20% (VAT on Expenses) (UK)"),
  LineAmount: z.number().optional(),
});

export function registerBillTools(server: McpServer, client: XeroClient): void {
  registerJsonTool(
    server,
    "list_bills",
    "List bills — money owed to suppliers (Type=ACCPAY), with optional contact/status filtering and pagination. Maps to GET /Invoices.",
    "readonly-owner",
    {
      contactId: z.string().optional().describe("Filter to one supplier's ContactID"),
      statuses: z.array(z.enum(["DRAFT", "SUBMITTED", "AUTHORISED", "PAID", "VOIDED", "DELETED"])).optional(),
      unpaidOnly: z.boolean().optional().describe("Filter to bills with AmountDue > 0"),
      page: z.number().int().min(1).optional().describe("Up to 100 bills returned per page"),
    },
    async ({ contactId, statuses, unpaidOnly, page }) => {
      const clauses: string[] = ['Type=="ACCPAY"'];
      if (contactId) clauses.push(`Contact.ContactID==Guid("${contactId}")`);
      if (unpaidOnly) clauses.push("AmountDue>0");
      return client.get("/Invoices", {
        where: buildWhereClause(clauses),
        Statuses: statuses?.join(","),
        page,
      });
    },
  );

  registerJsonTool(
    server,
    "get_bill",
    "Get a single bill by its InvoiceID. Maps to GET /Invoices/{InvoiceID}.",
    "readonly-owner",
    { billId: z.string().describe("Xero InvoiceID (GUID) for the ACCPAY invoice") },
    async ({ billId }) => client.get(`/Invoices/${billId}`),
  );

  registerJsonTool(
    server,
    "create_bill",
    "Record a new bill (Type=ACCPAY) — money owed to a supplier. Admin tier: recording money the business owes is treated as more sensitive than invoicing a customer. Maps to POST /Invoices.",
    "admin",
    {
      contactId: z.string().describe("Supplier's Xero ContactID"),
      LineItems: z.array(lineItemShape).min(1),
      Date: z.string().optional().describe("YYYY-MM-DD"),
      DueDate: z.string().optional().describe("YYYY-MM-DD"),
      Reference: z.string().optional().describe("ACCPAY invoices don't have an InvoiceNumber field — use Reference for the supplier's bill/invoice number"),
      Status: z.enum(["DRAFT", "SUBMITTED", "AUTHORISED"]).optional().describe("Defaults to DRAFT"),
      LineAmountTypes: z.enum(["Exclusive", "Inclusive", "NoTax"]).optional(),
    },
    async ({ contactId, ...fields }) =>
      client.post("/Invoices", { Invoices: [{ Type: "ACCPAY", Contact: { ContactID: contactId }, ...fields }] }),
  );

  registerJsonTool(
    server,
    "update_bill",
    "Update an existing bill — e.g. authorise a draft or adjust line items. If LineItems is provided it replaces the full line list. Admin tier. Maps to POST /Invoices/{InvoiceID}.",
    "admin",
    {
      billId: z.string(),
      DueDate: z.string().optional().describe("YYYY-MM-DD"),
      Reference: z.string().optional(),
      Status: z.enum(["DRAFT", "SUBMITTED", "AUTHORISED"]).optional(),
      LineItems: z.array(lineItemShape).optional(),
    },
    async ({ billId, ...fields }) => client.post(`/Invoices/${billId}`, { Invoices: [fields] }),
  );

  registerJsonTool(
    server,
    "void_bill",
    "Void an AUTHORISED bill — hard to reverse, admin tier only. Maps to POST /Invoices/{InvoiceID} with Status=VOIDED.",
    "admin",
    { billId: z.string() },
    async ({ billId }) => client.post(`/Invoices/${billId}`, { Invoices: [{ Status: "VOIDED" }] }),
  );

  registerJsonTool(
    server,
    "delete_bill",
    "Delete a DRAFT or SUBMITTED bill (use void_bill for an AUTHORISED one). Irreversible, admin tier only. Maps to POST /Invoices/{InvoiceID} with Status=DELETED.",
    "admin",
    { billId: z.string() },
    async ({ billId }) => client.post(`/Invoices/${billId}`, { Invoices: [{ Status: "DELETED" }] }),
  );
}
