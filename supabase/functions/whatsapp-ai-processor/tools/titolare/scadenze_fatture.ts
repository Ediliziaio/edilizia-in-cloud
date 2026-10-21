// MP02 — Scadenze fatture attive (invoices) con due_date.

import type { ToolCtx, ToolResult, ToolDef } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";
import { fmtEur, dataIt } from "../shared/formato.ts";

export const scadenzeFattureDef: Omit<ToolDef, "handler"> = {
  name: "scadenze_fatture",
  description:
    "Elenca fatture emesse non pagate con scadenza nei prossimi N giorni (default 30) oppure solo quelle già scadute.",
  parameters: {
    type: "object",
    properties: {
      giorni_range: { type: "number" },
      solo_scadute: { type: "boolean" },
    },
    additionalProperties: false,
  },
  requires_grants: ["scadenze.read"],
};

export async function scadenzeFatture(
  ctx: ToolCtx,
  args: { giorni_range?: number; solo_scadute?: boolean },
): Promise<ToolResult> {
  const giorni = args.giorni_range ?? 30;
  const soloScadute = args.solo_scadute ?? false;

  const today = new Date().toISOString().substring(0, 10);
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + giorni);
  const endStr = endDate.toISOString().substring(0, 10);

  // Le colonne vere di invoices (19/10/2026): total e status (paid, issued,
  // cancelled, draft). Prima cercava total_amount e payment_status, che non
  // esistono, e la risposta era sempre «Errore caricando le scadenze».
  // Note di credito e proforma non sono crediti da incassare.
  let q = ctx.supabase
    .from("invoices")
    .select("id, invoice_number, due_date, total, client_company_name, status, paid_amount")
    .eq("company_id", ctx.company_id)
    .is("deleted_at", null)
    .eq("document_type", "invoice")
    .eq("status", "issued")
    .not("due_date", "is", null);

  if (soloScadute) {
    q = q.lt("due_date", today);
  } else {
    q = q.lte("due_date", endStr);
  }

  const { data: fatture, error } = await q.order("due_date", { ascending: true }).limit(20);
  if (error) return errResult("scadenze_non_leggibili", "Non riesco a leggere le scadenze adesso. Riprova tra poco o guardale nell'app.");

  if (!fatture || fatture.length === 0) {
    const msg = soloScadute
      ? "✅ Nessuna fattura scaduta non pagata."
      : `✅ Nessuna scadenza nei prossimi ${giorni} giorni.`;
    return okResult({ fatture: [] }, msg);
  }

  const totaleAperto = fatture.reduce(
    (s, f) => s + (Number(f.total ?? 0) - Number(f.paid_amount ?? 0)),
    0,
  );
  const scadute = fatture.filter((f) => (f.due_date ?? "") < today);

  const lista = fatture.slice(0, 10).map((f, i) => {
    const scFlag = (f.due_date ?? "") < today ? " ⚠️" : "";
    const residuo = Number(f.total ?? 0) - Number(f.paid_amount ?? 0);
    return `${i + 1}. ${f.client_company_name || "Cliente non indicato"} — ${fmtEur(residuo)} (scade ${dataIt(f.due_date)})${scFlag}`;
  }).join("\n");

  const header = soloScadute
    ? `🔴 *${fatture.length} fatture scadute* — Totale ${fmtEur(totaleAperto)}`
    : `🗓️ *${fatture.length} scadenze in ${giorni}gg* (di cui ${scadute.length} già scadute) — Totale ${fmtEur(totaleAperto)}`;

  return okResult(
    { fatture, totaleAperto, scadute: scadute.length },
    `${header}\n\n${lista}`,
  );
}
