// MP02 — Costi del mese aggregati (fatture_ricevute + cedolini).

import type { ToolCtx, ToolResult, ToolDef } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";

export const costiMeseDef: Omit<ToolDef, "handler"> = {
  name: "costi_mese",
  description:
    "Aggrega costi del mese (default mese corrente): totale fatture ricevute + cedolini. Raggruppa per top 5 fornitori.",
  parameters: {
    type: "object",
    properties: {
      mese: { type: "string", description: "YYYY-MM" },
    },
    additionalProperties: false,
  },
  requires_grants: ["costi.read"],
};

export async function costiMese(
  ctx: ToolCtx,
  args: { mese?: string },
): Promise<ToolResult> {
  const mese = args.mese ?? new Date().toISOString().substring(0, 7);
  const [y, m] = mese.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) {
    return errResult("invalid_month", "Mese non valido. Usa YYYY-MM (es: 2026-04).");
  }

  const start = `${mese}-01`;
  const endDate = new Date(y, m, 0);
  const end = endDate.toISOString().substring(0, 10);

  // fatture_ricevute: le note di credito dei fornitori (importo positivo nel
  // documento) si tolgono, non si sommano.
  const { data: fatture, error: errFatture } = await ctx.supabase
    .from("fatture_ricevute")
    .select("cedente_ragione_sociale, totale_documento, tipo_documento")
    .eq("company_id", ctx.company_id)
    .gte("data_fattura", start)
    .lte("data_fattura", end);
  if (errFatture) return errResult("costi_non_leggibili", "Non riesco a leggere le fatture ricevute adesso: riprova tra poco.");
  const segno = (tipo: unknown) => (tipo === "TD04" || tipo === "passive_credit_note" ? -1 : 1);
  const totaleFatture = (fatture ?? []).reduce(
    (s, f) => s + segno(f.tipo_documento) * Number(f.totale_documento ?? 0),
    0,
  );

  const byFornitore = new Map<string, number>();
  (fatture ?? []).forEach((f) => {
    const k = f.cedente_ragione_sociale || "Sconosciuto";
    byFornitore.set(k, (byFornitore.get(k) ?? 0) + segno(f.tipo_documento) * Number(f.totale_documento ?? 0));
  });
  const topFornitori = Array.from(byFornitore.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // cedolini
  // I cedolini hanno anno e mese (prima cercava colonne inesistenti e gli
  // stipendi risultavano sempre 0 €).
  const { data: cedolini, error: errCedolini } = await ctx.supabase
    .from("cedolini")
    .select("netto, lordo")
    .eq("company_id", ctx.company_id)
    .eq("anno", y)
    .eq("mese", m);
  if (errCedolini) return errResult("costi_non_leggibili", "Non riesco a leggere i cedolini adesso: riprova tra poco.");
  const totaleStipendi = (cedolini ?? []).reduce(
    (s, c) => s + Number(c.netto ?? c.lordo ?? 0),
    0,
  );

  const totale = totaleFatture + totaleStipendi;
  const fmtEur = (n: number) =>
    "€ " + Number(n).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const meseName = new Date(y, m - 1, 1).toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
  });

  const top = topFornitori.map((f, i) =>
    `  ${i + 1}. ${f[0]} — ${fmtEur(f[1])}`
  ).join("\n");

  const msg = [
    `📊 *Costi ${meseName}* — ${fmtEur(totale)}`,
    "",
    `📄 Fatture ricevute: ${fmtEur(totaleFatture)}`,
    `👷 Stipendi: ${fmtEur(totaleStipendi)}`,
    top ? `\nTop 5 fornitori:\n${top}` : "",
  ].filter(Boolean).join("\n");

  return okResult({ totale, totaleFatture, totaleStipendi, topFornitori }, msg);
}
