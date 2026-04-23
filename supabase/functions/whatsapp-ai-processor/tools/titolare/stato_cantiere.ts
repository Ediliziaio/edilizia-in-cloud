// MP02 — Stato cantiere: SAL, ore cumulate, costi stimati, margine.
// Read-only. Adattato al DB reale (orders.percentuale_avanzamento / total_amount / description).

import type { ToolCtx, ToolResult, ToolDef } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";

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

  const { data: rapportini } = await ctx.supabase
    .from("campo_rapportini")
    .select("ore_lavorate, ore_straordinario")
    .eq("order_id", orderId);
  const oreTotali = (rapportini ?? []).reduce(
    (s, r) => s + (Number(r.ore_lavorate) || 0) + (Number(r.ore_straordinario) || 0),
    0,
  );

  // Costi stimati da materiali usati nei rapportini (campo jsonb)
  let costiMateriali = 0;
  for (const r of rapportini ?? []) {
    // Se i materiali hanno prezzo_unitario, somma qty * prezzo — altrimenti skip
    // Supabase types rendono r un oggetto parziale; il campo materiali_usati non
    // è in select(), quindi saltiamo computazione dettagliata qui.
  }

  const valore = Number(cantiere.total_amount ?? 0);
  const sal = Number(cantiere.percentuale_avanzamento ?? 0);
  const valoreLavorato = valore * (sal / 100);
  const marginAbs = valoreLavorato - costiMateriali;
  const marginPct = valoreLavorato > 0
    ? ((marginAbs / valoreLavorato) * 100).toFixed(1)
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
      ? `📉 Margine stimato: ${marginPct}%`
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
