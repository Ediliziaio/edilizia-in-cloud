/**
 * Tool: get_client_info
 *
 * Ritorna informazioni di un cliente per ID o nome (LIKE).
 * Read-only safe.
 */

import type { ToolDefinition } from "../../types.ts";

interface Input {
  client_id?: string;
  client_name?: string;
}

interface ClientInfo {
  id: string;
  name: string;
  vat_number: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  total_revenue_eur: number | null;
}

export const GET_CLIENT_INFO: ToolDefinition<Input, ClientInfo | null> = {
  name: "get_client_info",
  description:
    "Cerca un cliente per ID o nome (parziale, case-insensitive) e ritorna le informazioni base + revenue totale.",
  domain: "crm",
  parameters: {
    type: "object",
    properties: {
      client_id: { type: "string", description: "UUID del cliente (preferito)" },
      client_name: { type: "string", description: "Nome o parte del nome (fallback se ID assente)" },
    },
    required: [],
    additionalProperties: false,
  },
  allowedRoles: ["super_admin", "company_admin", "company_staff", "salesperson"],
  allowedPersonas: ["*"],
  riskLevel: "safe",
  handler: async (input, ctx) => {
    if (!input.client_id && !input.client_name) {
      throw new Error("Specificare client_id o client_name");
    }
    let q = ctx.supabase
      .from("customers")
      .select("id, name, vat_number, email, phone, city")
      .eq("company_id", ctx.companyId);
    if (input.client_id) q = q.eq("id", input.client_id);
    else if (input.client_name) q = q.ilike("name", `%${input.client_name}%`);
    const { data, error } = await q.limit(1).maybeSingle();
    if (error) throw new Error(`DB error: ${error.message}`);
    if (!data) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = data as any;

    // Calcolo revenue (best-effort)
    const { data: agg } = await ctx.supabase
      .from("invoices")
      .select("amount_total")
      .eq("company_id", ctx.companyId)
      .eq("customer_id", c.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const total = (agg ?? []).reduce((s: number, r: any) => s + Number(r.amount_total ?? 0), 0);

    return {
      id: c.id,
      name: c.name,
      vat_number: c.vat_number,
      email: c.email,
      phone: c.phone,
      city: c.city,
      total_revenue_eur: total,
    };
  },
};
