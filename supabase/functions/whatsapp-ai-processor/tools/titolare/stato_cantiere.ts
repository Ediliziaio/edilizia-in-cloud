// MP02 — Stato cantiere: SAL, ore cumulate, costi stimati, margine.
// Read-only. Adattato al DB reale (orders.percentuale_avanzamento / total_amount / description).

import type { ToolCtx, ToolResult, ToolDef } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";
import { oreCantiere } from "../shared/oreCantiere.ts";

export const statoCantiereDef: Omit<ToolDef, "handler"> = {
  name: "stato_cantiere",
  description:
    "Restituisce stato corrente di un cantiere: SAL%, ore cumulate (da rapportini), costi materiali, marginalità stimata. Read-only.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Nome o parte del nome del cantiere" },
      order_id: { type: "string" },
    },
    additionalProperties: false,
  },
  requires_grants: ["cantieri.read_all"],
};

interface TrigramRow {
  id: string;
  name: string;
  similarity: number;
}

export async function statoCantiere(
  ctx: ToolCtx,
  args: { query?: string; order_id?: string },
): Promise<ToolResult> {
  let orderId = args.order_id;

  if (!orderId && args.query && args.query.trim().length >= 2) {
    const { data: matches } = await ctx.supabase.rpc("search_cantieri_by_trigram", {
      p_company_id: ctx.company_id,
      p_query: args.query,
      p_limit: 5,
    });
    const ms = (matches ?? []) as TrigramRow[];
    if (ms.length === 0) {
      return errResult("not_found", `Non trovo cantieri con "${args.query}".`);
    }
    if (ms.length > 1) {
      const opts = ms.map((m, i) => `${i + 1}. ${m.name}`).join("\n");
      return errResult("ambiguous", `Ho trovato ${ms.length} cantieri:\n${opts}\n\nQuale intendevi?`);
    }
    orderId = ms[0].id;
  }

  if (!orderId) return errResult("no_id", "Dimmi il nome del cantiere.");

  const { data: cantiere } = await ctx.supabase
    .from("orders")
    .select("id, description, order_code, indirizzo_lavori, work_start_date, work_end_date, status, total_amount, percentuale_avanzamento, client_name")
    .eq("id", orderId)
    .eq("company_id", ctx.company_id)
    .maybeSingle();

  if (!cantiere) return errResult("not_found", "Cantiere non trovato.");

  const nome = cantiere.description || cantiere.order_code || "Cantiere";

  // Ore dei rapportini inviati e approvati, con le presenze della squadra.
  const oreTotali = await oreCantiere(ctx, orderId);

  const valore = Number(cantiere.total_amount ?? 0);
  const sal = Number(cantiere.percentuale_avanzamento ?? 0);
  const valoreLavorato = valore * (sal / 100);
  // Il margine della pagina Marginalità (19/10/2026): prima i costi erano
  // sempre zero e il margine stimato usciva sempre 100%.
  const { data: margini } = await ctx.supabase
    .from("v_ordine_marginalita")
    .select("margine_perc")
    .eq("company_id", ctx.company_id)
    .eq("id", orderId)
    .maybeSingle();
  const percentuale = margini?.margine_perc;
  const marginPct = percentuale != null && Number.isFinite(Number(percentuale))
    ? Number(percentuale).toFixed(1)
    : "n/d";

  const fmtEur = (n: number) =>
    "€ " + n.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const msg = [
    `📊 *${nome}*${cantiere.client_name ? ` — ${cantiere.client_name}` : ""}`,
    `Stato: ${cantiere.status ?? "n/d"} — SAL: ${sal}%`,
    "",
    `💰 Valore commessa: ${fmtEur(valore)}`,
    `📈 Lavorato (SAL): ${fmtEur(valoreLavorato)}`,
    `⏱️ Ore cumulate: ${oreTotali.toFixed(1)}h`,
    typeof marginPct === "string" && marginPct !== "n/d"
      ? `📉 Margine: ${marginPct}%`
      : null,
  ].filter(Boolean).join("\n");

  return okResult(
    {
      cantiere,
      ore_totali: oreTotali,
      sal,
      valore_commessa: valore,
      valore_lavorato: valoreLavorato,
    },
    msg,
  );
}
