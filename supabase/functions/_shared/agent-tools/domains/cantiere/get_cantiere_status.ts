/**
 * Tool: get_cantiere_status
 *
 * Ritorna lo stato corrente di un cantiere (codice, status, customer, importi).
 * Read-only safe → esegue direttamente.
 */

import type { ToolDefinition } from "../../types.ts";

interface Input {
  cantiere_id: string;
}

interface Output {
  id: string;
  order_code: string | null;
  status: string | null;
  customer_name: string | null;
  total_amount_eur: number | null;
  start_date: string | null;
  end_date: string | null;
}

export const GET_CANTIERE_STATUS: ToolDefinition<Input, Output> = {
  name: "get_cantiere_status",
  description:
    "Ritorna lo stato corrente di un cantiere/ordine: codice, status, cliente, importi, date. Read-only.",
  domain: "cantiere",
  parameters: {
    type: "object",
    properties: {
      cantiere_id: { type: "string", description: "UUID del cantiere/ordine" },
    },
    required: ["cantiere_id"],
    additionalProperties: false,
  },
  allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
  allowedPersonas: ["*"],
  riskLevel: "safe",
  handler: async (input, ctx) => {
    const { data, error } = await ctx.supabase
      .from("orders")
      .select("id, order_code, status, total_amount, start_date, end_date, customers!inner(name)")
      .eq("id", input.cantiere_id)
      .eq("company_id", ctx.companyId)
      .maybeSingle();
    if (error) throw new Error(`DB error: ${error.message}`);
    if (!data) throw new Error(`Cantiere ${input.cantiere_id} non trovato per la tua azienda`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as any;
    return {
      id: d.id,
      order_code: d.order_code,
      status: d.status,
      customer_name: d.customers?.name ?? null,
      total_amount_eur: d.total_amount,
      start_date: d.start_date,
      end_date: d.end_date,
    };
  },
};
