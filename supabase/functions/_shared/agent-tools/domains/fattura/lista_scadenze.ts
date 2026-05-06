/**
 * Tool: lista_scadenze
 *
 * Lista fatture in scadenza nei prossimi N giorni.
 * Read-only safe.
 */

import type { ToolDefinition } from "../../types.ts";

interface Input {
  days_ahead?: number;
  only_unpaid?: boolean;
}

interface ScadenzaInvoice {
  id: string;
  invoice_number: string | null;
  customer_name: string | null;
  amount_total: number | null;
  due_date: string | null;
  status: string | null;
  giorni_alla_scadenza: number;
}

export const LISTA_SCADENZE: ToolDefinition<Input, { scadenze: ScadenzaInvoice[] }> = {
  name: "lista_scadenze",
  description:
    "Lista delle fatture in scadenza nei prossimi N giorni (default 30) per la tua azienda. Read-only.",
  domain: "fattura",
  parameters: {
    type: "object",
    properties: {
      days_ahead: { type: "integer", minimum: 1, maximum: 365, default: 30 },
      only_unpaid: { type: "boolean", default: true },
    },
    required: [],
    additionalProperties: false,
  },
  allowedRoles: ["super_admin", "company_admin", "company_staff"],
  allowedPersonas: ["*"],
  riskLevel: "safe",
  handler: async (input, ctx) => {
    const days = Math.min(365, Math.max(1, input.days_ahead ?? 30));
    const onlyUnpaid = input.only_unpaid !== false; // default true
    const today = new Date();
    const limit = new Date(today.getTime() + days * 86400_000).toISOString().substring(0, 10);

    let q = ctx.supabase
      .from("invoices")
      .select("id, invoice_number, amount_total, due_date, status, customers(name)")
      .eq("company_id", ctx.companyId)
      .lte("due_date", limit)
      .order("due_date", { ascending: true });
    if (onlyUnpaid) q = q.in("status", ["unpaid", "overdue", "sent"]);

    const { data, error } = await q.limit(100);
    if (error) throw new Error(`DB error: ${error.message}`);
    const todayStr = today.toISOString().substring(0, 10);
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scadenze: (data ?? []).map((d: any) => ({
        id: d.id,
        invoice_number: d.invoice_number,
        customer_name: d.customers?.name ?? null,
        amount_total: d.amount_total,
        due_date: d.due_date,
        status: d.status,
        giorni_alla_scadenza: d.due_date
          ? Math.ceil((new Date(d.due_date).getTime() - new Date(todayStr).getTime()) / 86400_000)
          : 0,
      })),
    };
  },
};
