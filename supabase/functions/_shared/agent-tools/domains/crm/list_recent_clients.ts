/**
 * Tool: list_recent_clients
 *
 * Lista N clienti più recenti per la company.
 * Read-only safe.
 */

import type { ToolContext, ToolDefinition } from "../../types.ts";

interface Input {
  limit?: number;
}

interface ClientLite {
  id: string;
  name: string;
  city: string | null;
  created_at: string;
}

export const LIST_RECENT_CLIENTS: ToolDefinition<Input, { clients: ClientLite[] }> = {
  name: "list_recent_clients",
  description: "Restituisce i clienti più recentemente creati per la company corrente.",
  domain: "crm",
  parameters: {
    type: "object",
    properties: {
      limit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
    },
    required: [],
    additionalProperties: false,
  },
  allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
  allowedPersonas: ["*"],
  riskLevel: "safe",
  handler: async (input, ctx) => {
    const limit = Math.min(50, Math.max(1, input.limit ?? 10));
    const { data, error } = await ctx.supabase
      .from("customers")
      .select("id, name, city, created_at")
      .eq("company_id", ctx.companyId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`DB error: ${error.message}`);
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      clients: (data ?? []) as ClientLite[],
    };
  },
};
