import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { XeroClient } from "../client.js";
import { buildWhereClause } from "../client.js";
import { registerJsonTool } from "../toolkit.js";

// Sales invoices only (Type=ACCREC). Bills — the accounts-payable side,
// Type=ACCPAY — are covered separately in tools/bills.ts even though Xero
// serves both through the same underlying /Invoices endpoint, so this
// repo's write tiers can treat "billing a customer" (office-ops) and
// "money the business owes" (admin) differently. See bills.ts for why.
const lineItemShape = z.object({
  Description: z.string().optional(),
  Quantity: z.number().optional(),
  UnitAmount: z.number().optional(),
  AccountCode: z.string().optional().describe("Chart-of-accounts code — see list_accounts"),
  ItemCode: z.string().optional(),
  TaxType: z.string().optional().describe("Tax type from the org's tax rates, e.g. OUTPUT2 (AU GST), OUTPUT (NZ GST), 20% (S) (UK VAT)"),
  LineAmount: z.number().optional().describe("Provide instead of Quantity/UnitAmount if you just want to set the total directly"),
});

export function registerInvoiceTools(server: McpServer, client: XeroClient): void {
  registerJsonTool(
    server,
    "list_invoices",
    "List sales invoices (Type=ACCREC), with optional contact/status filtering and pagination. Maps to GET /Invoices.",
    "readonly-owner",
    {
      contactId: z.string().optional().describe("Filter to one customer's ContactID"),
      statuses: z.array(z.enum(["DRAFT", "SUBMITTED", "AUTHORISED", "PAID", "VOIDED", "DELETED"])).optional(),
      unpaidOnly: z.boolean().optional().describe("Filter to invoices with AmountDue > 0"),
      page: z.number().int().min(1).optional().describe("Up to 100 invoices returned per page"),
    },
    async ({ contactId, statuses, unpaidOnly, page }) => {
      const clauses: string[] = ['Type=="ACCREC"'];
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
    "get_invoice",
    "Get a single invoice by InvoiceID. Maps to GET /Invoices/{InvoiceID}.",
    "readonly-owner",
    { invoiceId: z.string().describe("Xero InvoiceID (GUID)") },
    async ({ invoiceId }) => client.get(`/Invoices/${invoiceId}`),
  );

  registerJsonTool(
    server,
    "get_invoice_online_url",
    "Get the shareable online-invoice URL for a sales invoice (a hosted payable page you can send a customer directly). Maps to GET /Invoices/{InvoiceID}/OnlineInvoice. Only works for AUTHORISED ACCREC invoices.",
    "readonly-owner",
    { invoiceId: z.string() },
    async ({ invoiceId }) => client.get(`/Invoices/${invoiceId}/OnlineInvoice`),
  );

  registerJsonTool(
    server,
    "create_invoice",
    "Create a new sales invoice (Type=ACCREC) for a customer. Maps to POST /Invoices.",
    "office-ops",
    {
      contactId: z.string().describe("Customer's Xero ContactID"),
      LineItems: z.array(lineItemShape).min(1),
      Date: z.string().optional().describe("YYYY-MM-DD — issue date, defaults to today if omitted"),
      DueDate: z.string().optional().describe("YYYY-MM-DD"),
      InvoiceNumber: z.string().optional().describe("Auto-generated if omitted"),
      Reference: z.string().optional(),
      Status: z.enum(["DRAFT", "SUBMITTED", "AUTHORISED"]).optional().describe("Defaults to DRAFT — set to AUTHORISED to make it a real, numbered invoice"),
      LineAmountTypes: z.enum(["Exclusive", "Inclusive", "NoTax"]).optional(),
    },
    async ({ contactId, ...fields }) =>
      client.post("/Invoices", { Invoices: [{ Type: "ACCREC", Contact: { ContactID: contactId }, ...fields }] }),
  );

  registerJsonTool(
    server,
    "update_invoice",
    "Update an existing sales invoice — e.g. authorise a draft, adjust line items, or change the due date. If LineItems is provided it replaces the full line list (Xero requires the complete set on any line update, not a partial patch). Maps to POST /Invoices/{InvoiceID}.",
    "office-ops",
    {
      invoiceId: z.string(),
      DueDate: z.string().optional().describe("YYYY-MM-DD"),
      Reference: z.string().optional(),
      Status: z.enum(["DRAFT", "SUBMITTED", "AUTHORISED"]).optional(),
      LineItems: z.array(lineItemShape).optional(),
    },
    async ({ invoiceId, ...fields }) => client.post(`/Invoices/${invoiceId}`, { Invoices: [fields] }),
  );

  registerJsonTool(
    server,
    "email_invoice",
    "Email an AUTHORISED sales invoice to the customer's address on file. Maps to POST /Invoices/{InvoiceID}/Email.",
    "office-ops",
    { invoiceId: z.string() },
    async ({ invoiceId }) => client.post(`/Invoices/${invoiceId}/Email`, {}),
  );

  registerJsonTool(
    server,
    "void_invoice",
    "Void an AUTHORISED invoice (keeps the record but zeroes it out) — hard to reverse, admin tier only. Maps to POST /Invoices/{InvoiceID} with Status=VOIDED.",
    "admin",
    { invoiceId: z.string() },
    async ({ invoiceId }) => client.post(`/Invoices/${invoiceId}`, { Invoices: [{ Status: "VOIDED" }] }),
  );

  registerJsonTool(
    server,
    "delete_invoice",
    "Delete a DRAFT or SUBMITTED invoice (Xero only allows deleting invoices that haven't been authorised yet — use void_invoice for an AUTHORISED one). Irreversible, admin tier only. Maps to POST /Invoices/{InvoiceID} with Status=DELETED.",
    "admin",
    { invoiceId: z.string() },
    async ({ invoiceId }) => client.post(`/Invoices/${invoiceId}`, { Invoices: [{ Status: "DELETED" }] }),
  );
}
