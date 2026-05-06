/**
 * Tool: elenca_cantieri_oggi
 *
 * Lista cantieri attivi oggi (status in 'in_corso','programmato' e date_range che include oggi).
 * Read-only safe.
 */

import type { ToolDefinition } from "../../types.ts";

interface Input {
  limit?: number;
}

interface CantiereLite {
  id: string;
  order_code: string | null;
  status: string | null;
  customer_name: string | null;
}

export const ELENCA_CANTIERI_OGGI: ToolDefinition<Input, { cantieri: CantiereLite[] }> = {
  name: "elenca_cantieri_oggi",
  description:
    "Restituisce la lista dei cantieri attivi oggi per la tua azienda (status in_corso/programmato, oggi nel range date).",
  domain: "cantiere",
  parameters: {
    type: "object",
    properties: {
      limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    },
    required: [],
    additionalProperties: false,
  },
  allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
  allowedPersonas: ["*"],
  riskLevel: "safe",
  handler: async (input, ctx) => {
    const today = new Date().toISOString().substring(0, 10);
    const limit = Math.min(100, Math.max(1, input.limit ?? 20));
    const { data, error } = await ctx.supabase
      .from("orders")
      .select("id, order_code, status, customers!inner(name)")
      .eq("company_id", ctx.companyId)
      .in("status", ["in_corso", "programmato"])
      .or(`start_date.lte.${today},start_date.is.null`)
      .or(`end_date.gte.${today},end_date.is.null`)
      .limit(limit);
    if (error) throw new Error(`DB error: ${error.message}`);
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cantieri: (data ?? []).map((d: any) => ({
        id: d.id,
        order_code: d.order_code,
        status: d.status,
        customer_name: d.customers?.name ?? null,
      })),
    };
  },
};
