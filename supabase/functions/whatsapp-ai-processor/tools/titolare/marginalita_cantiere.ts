// MP02 — Marginalità cantiere: valore lavorato (contratto più varianti × SAL) meno i costi diretti
// registrati, dalla stessa fonte della scheda commessa (v_ordine_marginalita). Prima la manodopera
// era stimata con ore di tutti i rapportini × lordo medio senza oneri, e il margine usciva falso.

import type { ToolCtx, ToolResult, ToolDef } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";
import { fmtEur } from "../shared/formato.ts";
import { oreCantiere } from "../shared/oreCantiere.ts";
import { buildInteractivePayload } from "../../interactive.ts";

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
      // Scelta a bottoni: toccare un cantiere manda il suo nome, e io lo ricerco.
      return okResult({ __interactive: buildInteractivePayload(
        `${ms.length} cantieri trovati. Quale?`,
        ms.slice(0, 10).map((m) => ({ id: `cantiere:${m.id}`, title: m.name })),
        "Scegli il cantiere",
      ) }, "");
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
  const { data: m } = await ctx.supabase
    .from("v_ordine_marginalita")
    .select("preventivo_totale, costo_manodopera, costo_acquisti, costo_materiali_magazzino, consuntivo")
    .eq("company_id", ctx.company_id)
    .eq("id", orderId)
    .maybeSingle();
  if (!m) return errResult("no_data", "Non riesco a leggere i costi di questo cantiere: aprilo dall'app.");

  const valore = Number(m.preventivo_totale ?? o.total_amount ?? 0);
  const sal = Number(o.percentuale_avanzamento ?? 0);
  const valoreLavorato = valore * (sal / 100);
  const costoManodopera = Number(m.costo_manodopera ?? 0);
  const costoMateriali = Number(m.costo_acquisti ?? 0) + Number(m.costo_materiali_magazzino ?? 0);
  const costiDiretti = Number(m.consuntivo ?? 0);
  const ore = await oreCantiere(ctx, orderId);

  const margine = valoreLavorato - costiDiretti;
  const marginePct = valoreLavorato > 0
    ? ((margine / valoreLavorato) * 100).toFixed(1)
    : "n/d";


  const msg = [
    `📊 *${nome}* — Marginalità`,
    "",
    `💰 Valore (contratto + varianti): ${fmtEur(valore)} (SAL ${sal}%)`,
    `📈 Lavorato: ${fmtEur(valoreLavorato)}`,
    `👷 Manodopera registrata: ${fmtEur(costoManodopera)} (${ore.toFixed(1)} h nei rapportini inviati e approvati)`,
    `🧱 Materiali e acquisti: ${fmtEur(costoMateriali)}`,
    `🧾 Costi diretti registrati: ${fmtEur(costiDiretti)}`,
    "",
    `${margine >= 0 ? "✅" : "⚠️"} Margine sul lavorato: ${fmtEur(margine)} (${marginePct}%)`,
    "",
    sal < 50
      ? "_Costi registrati finora, IVA esclusa; col SAL ancora basso il margine esce prudente._"
      : "_Costi registrati finora, IVA esclusa._",
  ].filter((riga, i, righe) => riga !== "" || righe[i - 1] !== "").join("\n").trim();

  return okResult(
    { nome, valore, sal, valoreLavorato, ore, costoManodopera, costoMateriali, costiDiretti, margine, marginePct },
    msg,
  );
}
