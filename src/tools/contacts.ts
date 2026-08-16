import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { XeroClient } from "../client.js";
import { buildWhereClause } from "../client.js";
import { registerJsonTool } from "../toolkit.js";

// Xero doesn't split customers and vendors into separate objects the way
// QuickBooks does: everyone is a Contact, flagged IsCustomer and/or
// IsSupplier depending on whether they've ever been used on a sales
// invoice (ACCREC) or a bill (ACCPAY). This repo exposes one contacts.ts
// covering both roles, with filters to narrow to one side when useful.
const addressShape = z.object({
  AddressType: z.enum(["POBOX", "STREET"]).optional(),
  AddressLine1: z.string().optional(),
  AddressLine2: z.string().optional(),
  City: z.string().optional(),
  Region: z.string().optional(),
  PostalCode: z.string().optional(),
  Country: z.string().optional(),
});

const phoneShape = z.object({
  PhoneType: z.enum(["DEFAULT", "DDI", "MOBILE", "FAX", "OFFICE"]).optional(),
  PhoneNumber: z.string().optional(),
  PhoneAreaCode: z.string().optional(),
  PhoneCountryCode: z.string().optional(),
});

export function registerContactTools(server: McpServer, client: XeroClient): void {
  registerJsonTool(
    server,
    "list_contacts",
    "List contacts (customers and/or suppliers), with optional name search, role filtering, and pagination. Maps to GET /Contacts.",
    "readonly-owner",
    {
      searchTerm: z.string().optional().describe("Case-insensitive search across Name, FirstName, LastName, ContactNumber, EmailAddress"),
      role: z.enum(["customer", "supplier", "any"]).optional().default("any").describe("Filter to IsCustomer=true, IsSupplier=true, or no role filter"),
      includeArchived: z.boolean().optional().describe("Include contacts with ContactStatus=ARCHIVED"),
      page: z.number().int().min(1).optional().describe("Up to 100 contacts returned per page"),
    },
    async ({ searchTerm, role, includeArchived, page }) => {
      const clauses: string[] = [];
      if (role === "customer") clauses.push("IsCustomer==true");
      if (role === "supplier") clauses.push("IsSupplier==true");
      return client.get("/Contacts", {
        where: buildWhereClause(clauses),
        searchTerm,
        includeArchived,
        page,
      });
    },
  );

  registerJsonTool(
    server,
    "get_contact",
    "Get a single contact by ContactID. Maps to GET /Contacts/{ContactID}.",
    "readonly-owner",
    { contactId: z.string().describe("Xero ContactID (GUID)") },
    async ({ contactId }) => client.get(`/Contacts/${contactId}`),
  );

  registerJsonTool(
    server,
    "create_contact",
    "Create a new contact (customer and/or supplier). Maps to POST /Contacts.",
    "office-ops",
    {
      Name: z.string().describe("Required — full display name, must be unique across all contacts"),
      FirstName: z.string().optional(),
      LastName: z.string().optional(),
      EmailAddress: z.string().optional(),
      TaxNumber: z.string().optional().describe("ABN (AU), GST/NZBN (NZ), VAT number (UK), etc."),
      Addresses: z.array(addressShape).optional(),
      Phones: z.array(phoneShape).optional(),
      IsCustomer: z.boolean().optional(),
      IsSupplier: z.boolean().optional(),
    },
    async (args) => client.post("/Contacts", { Contacts: [args] }),
  );

  registerJsonTool(
    server,
    "update_contact",
    "Update an existing contact — send only the fields you want changed. Maps to POST /Contacts/{ContactID}.",
    "office-ops",
    {
      contactId: z.string().describe("Xero ContactID (GUID)"),
      Name: z.string().optional(),
      EmailAddress: z.string().optional(),
      TaxNumber: z.string().optional(),
      Addresses: z.array(addressShape).optional(),
      Phones: z.array(phoneShape).optional(),
      ContactStatus: z.enum(["ACTIVE", "ARCHIVED"]).optional().describe("Set to ARCHIVED to deactivate — Xero does not support deleting contacts"),
    },
    async ({ contactId, ...fields }) => client.post(`/Contacts/${contactId}`, { Contacts: [fields] }),
  );
}
