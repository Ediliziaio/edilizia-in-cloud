// MP02 — Marginalità cantiere: valore × SAL - costi reali (DDT + cedolini prorata).
// In attesa di ddt_ricezione con `totale` per cantiere (MP3), usiamo approssimazione.

import type { ToolCtx, ToolResult, ToolDef } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";

export const marginalitaCantiereDef: Omit<ToolDef, "handler"> = {
  name: "marginalita_cantiere",
  description:
    "Calcola marginalità reale di un cantiere (valore_lavorato - costi diretti). Read-only.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string" },
      order_id: { type: "string" },
    },
    additionalProperties: false,
  },
  requires_grants: ["marginalita.read"],
};

interface TrigramRow {
  id: string;
  name: string;
  similarity: number;
}

export async function marginalitaCantiere(
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
    if (ms.length === 0) return errResult("not_found", `Nessun cantiere per "${args.query}".`);
    if (ms.length > 1) {
      const opts = ms.map((m, i) => `${i + 1}. ${m.name}`).join("\n");
      return errResult("ambiguous", `${ms.length} cantieri trovati:\n${opts}\n\nQuale?`);
    }
    orderId = ms[0].id;
  }

  if (!orderId) return errResult("no_id", "Serve il nome del cantiere.");

  const { data: o } = await ctx.supabase
    .from("orders")
    .select("description, order_code, total_amount, percentuale_avanzamento, client_name")
    .eq("id", orderId)
    .eq("company_id", ctx.company_id)
    .maybeSingle();

  if (!o) return errResult("not_found", "Cantiere non trovato.");

  const nome = o.description || o.order_code || "Cantiere";
  const valore = Number(o.total_amount ?? 0);
  const sal = Number(o.percentuale_avanzamento ?? 0);
  const valoreLavorato = valore * (sal / 100);

  // Costo manodopera: ore × costo/ora mediano employees della company
  const { data: emps } = await ctx.supabase
    .from("employees")
    .select("gross_salary, monthly_hours")
    .eq("company_id", ctx.company_id)
    .eq("is_active", true);
  const costOra = (emps ?? [])
    .filter((e) => (e.monthly_hours ?? 0) > 0)
    .map((e) => Number(e.gross_salary ?? 0) / Number(e.monthly_hours));
  const costOraMediano = costOra.length
    ? costOra.sort((a, b) => a - b)[Math.floor(costOra.length / 2)]
    : 20;

  const { data: rapp } = await ctx.supabase
    .from("campo_rapportini")
    .select("ore_lavorate, ore_straordinario")
    .eq("order_id", orderId);
  const ore = (rapp ?? []).reduce(
    (s, r) => s + (Number(r.ore_lavorate) || 0) + (Number(r.ore_straordinario) || 0),
    0,
  );
  const costoManodopera = ore * costOraMediano;

  const margine = valoreLavorato - costoManodopera;
  const marginePct = valoreLavorato > 0
    ? ((margine / valoreLavorato) * 100).toFixed(1)
    : "n/d";

  const fmtEur = (n: number) =>
    "€ " + n.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const msg = [
    `📊 *${nome}* — Marginalità`,
    "",
    `💰 Valore: ${fmtEur(valore)} (SAL ${sal}%)`,
    `📈 Lavorato: ${fmtEur(valoreLavorato)}`,
    `👷 Manodopera: ${ore.toFixed(1)}h × ${fmtEur(costOraMediano)}/h = ${fmtEur(costoManodopera)}`,
    "",
    `${margine >= 0 ? "✅" : "⚠️"} Margine: ${fmtEur(margine)} (${marginePct}%)`,
    "",
    "_Stima: non include DDT materiali e costi indiretti._",
  ].join("\n");

  return okResult(
    { nome, valore, sal, valoreLavorato, ore, costoManodopera, margine, marginePct },
    msg,
  );
}
