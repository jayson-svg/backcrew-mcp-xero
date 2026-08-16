import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { XeroClient } from "../client.js";
import { buildWhereClause } from "../client.js";
import { registerJsonTool } from "../toolkit.js";

// Xero applies payments to invoices (both ACCREC and ACCPAY) through one
// shared Payments entity, unlike QuickBooks which has a separate Payment
// (customer) vs BillPayment (vendor) object. This repo still splits
// *creating* a payment into two tools — record_customer_payment vs
// record_bill_payment — because they belong on different safety tiers:
// money coming in (office-ops) vs money going out (admin). Both write to
// the same POST /Payments endpoint; Xero infers which side a payment is on
// from the invoice you point it at, so pass the matching InvoiceID.
export function registerPaymentTools(server: McpServer, client: XeroClient): void {
  registerJsonTool(
    server,
    "list_payments",
    "List payments against invoices, bills, and credit notes, with optional date filtering and pagination. Maps to GET /Payments.",
    "readonly-owner",
    {
      since: z.string().optional().describe("YYYY-MM-DD — filter to payments on or after this date"),
      page: z.number().int().min(1).optional().describe("Up to 100 payments returned per page"),
    },
    async ({ since, page }) => {
      const clauses: string[] = [];
      if (since) clauses.push(`Date>=DateTime(${since.replace(/-/g, ",")})`);
      return client.get("/Payments", { where: buildWhereClause(clauses), page });
    },
  );

  registerJsonTool(
    server,
    "get_payment",
    "Get a single payment by PaymentID. Maps to GET /Payments/{PaymentID}.",
    "readonly-owner",
    { paymentId: z.string().describe("Xero PaymentID (GUID)") },
    async ({ paymentId }) => client.get(`/Payments/${paymentId}`),
  );

  registerJsonTool(
    server,
    "record_customer_payment",
    "Record a payment received against a sales invoice (ACCREC), applying it to reduce the invoice's AmountDue. Maps to POST /Payments. Only use with a sales-invoice InvoiceID — see list_invoices, not list_bills.",
    "office-ops",
    {
      invoiceId: z.string().describe("The sales invoice's InvoiceID"),
      accountId: z.string().describe("The bank/clearing account the money was received into — see list_accounts"),
      Amount: z.number().describe("Must be <= the invoice's AmountDue"),
      Date: z.string().optional().describe("YYYY-MM-DD — defaults to today if omitted"),
      Reference: z.string().optional(),
    },
    async ({ invoiceId, accountId, ...fields }) =>
      client.post("/Payments", {
        Payments: [{ Invoice: { InvoiceID: invoiceId }, Account: { AccountID: accountId }, ...fields }],
      }),
  );

  registerJsonTool(
    server,
    "record_bill_payment",
    "Record a payment made against a bill (ACCPAY) — money leaving the business, admin tier only. Maps to POST /Payments. Only use with a bill's InvoiceID — see list_bills, not list_invoices.",
    "admin",
    {
      billId: z.string().describe("The bill's InvoiceID"),
      accountId: z.string().describe("The bank account the payment was made from — see list_accounts"),
      Amount: z.number().describe("Must be <= the bill's AmountDue"),
      Date: z.string().optional().describe("YYYY-MM-DD — defaults to today if omitted"),
      Reference: z.string().optional(),
    },
    async ({ billId, accountId, ...fields }) =>
      client.post("/Payments", {
        Payments: [{ Invoice: { InvoiceID: billId }, Account: { AccountID: accountId }, ...fields }],
      }),
  );

  registerJsonTool(
    server,
    "delete_payment",
    "Reverse a payment (Xero calls this deleting — it sets the payment's Status to DELETED rather than removing the record). Only works on payments that haven't been bank-reconciled. Irreversible in practice, admin tier only. Maps to POST /Payments/{PaymentID}.",
    "admin",
    { paymentId: z.string() },
    async ({ paymentId }) => client.post(`/Payments/${paymentId}`, { Payments: [{ Status: "DELETED" }] }),
  );
}
