import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodRawShape } from "zod";
import { XeroApiError } from "./client.js";

/**
 * Every tool declares the minimum tier required to see/use it:
 *  - readonly-owner: read-only look-ups. Safe for anyone — cannot change data.
 *  - office-ops: everyday work — create/update contacts and sales invoices,
 *    email an invoice, record a customer payment, record money received
 *    directly into a bank account. No deletes/voids, no bills, nothing
 *    that represents money leaving the business.
 *  - admin: everything, including deletes/voids, bills (AP invoices),
 *    paying a bill, and recording a direct bank spend.
 * Profiles are cumulative: office-ops includes readonly-owner, admin
 * includes both.
 */
export type ToolTier = "readonly-owner" | "office-ops" | "admin";

const TIER_RANK: Record<ToolTier, number> = {
  "readonly-owner": 0,
  "office-ops": 1,
  admin: 2,
};

type ToolHandler<Args> = (args: Args) => Promise<unknown>;

/**
 * XERO_MCP_MODE is the master safety switch and always wins: "read_only"
 * (the shipped default) exposes nothing above readonly-owner no matter what
 * XERO_MCP_PROFILE says. Only "read_write" lets XERO_MCP_PROFILE raise the
 * ceiling. This is deliberate defense-in-depth — a misconfigured profile
 * can't accidentally expose write tools if the mode is still read_only.
 */
function resolveMaxExposedRank(): number {
  const mode = (process.env.XERO_MCP_MODE ?? "read_only").trim().toLowerCase();
  if (mode !== "read_write") {
    return TIER_RANK["readonly-owner"];
  }
  const profile = (process.env.XERO_MCP_PROFILE ?? "readonly-owner").trim().toLowerCase();
  return TIER_RANK[profile as ToolTier] ?? TIER_RANK["readonly-owner"];
}

const maxExposedRank = resolveMaxExposedRank();

/**
 * Registers a tool that calls the Xero API and serializes the result (or a
 * structured error) as the tool's text output — unless the tool's tier is
 * above what XERO_MCP_MODE / XERO_MCP_PROFILE currently allow, in which
 * case it's skipped entirely and never appears in tools/list.
 */
export function registerJsonTool<Shape extends ZodRawShape>(
  server: McpServer,
  name: string,
  description: string,
  tier: ToolTier,
  inputShape: Shape,
  handler: ToolHandler<z.infer<z.ZodObject<Shape>>>,
): void {
  if (TIER_RANK[tier] > maxExposedRank) {
    return;
  }

  const callback = async (args: z.infer<z.ZodObject<Shape>>) => {
    try {
      const result = await handler(args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: formatError(error) }],
        isError: true,
      };
    }
  };

  server.registerTool(
    name,
    { description: `${description} [tier: ${tier}]`, inputSchema: inputShape },
    callback as Parameters<typeof server.registerTool>[2],
  );
}

function formatError(error: unknown): string {
  if (error instanceof XeroApiError) {
    return JSON.stringify(
      { error: error.message, status: error.status, body: error.body },
      null,
      2,
    );
  }
  if (error instanceof Error) {
    return JSON.stringify({ error: error.message }, null, 2);
  }
  return JSON.stringify({ error: String(error) }, null, 2);
}
