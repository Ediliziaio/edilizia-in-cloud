// Le segnalazioni dal cantiere ancora aperte, urgenti e medie (19/10/2026).
// Dal 18/10 una segnalazione da WhatsApp o dall'app Campo è un ticket (fonte
// «campo»): prima si leggeva cantiere_segnalazioni, rimasta vuota, e la
// risposta era sempre «Nessuna richiesta in sospeso».

import type { ToolCtx, ToolResult, ToolDef } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";

export const listaApprovazioniDef: Omit<ToolDef, "handler"> = {
  name: "lista_approvazioni",
  description:
    "Le segnalazioni dal cantiere ancora aperte, con urgenza alta o media, da guardare o chiudere.",
  parameters: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  requires_grants: ["approvazioni.list"],
};

export async function listaApprovazioni(
  ctx: ToolCtx,
): Promise<ToolResult> {
  const { data: ticket, error } = await ctx.supabase
    .from("tickets")
    .select("id, subject, priorita, created_at, order_id")
    .eq("company_id", ctx.company_id)
    .eq("fonte", "campo")
    .not("status", "in", "(risolto,chiuso,annullato,preventivo_rifiutato)")
    .in("priorita", ["alta", "media"])
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) return errResult("segnalazioni_non_leggibili", "Non riesco a leggere le segnalazioni adesso: riprova tra poco.");
  const segnalazioni = (ticket ?? []) as Array<{ id: string; subject: string | null; priorita: string | null; created_at: string; order_id: string | null }>;

  if (segnalazioni.length === 0) {
    return okResult(
      { items: [] },
      "✅ Nessuna richiesta in sospeso. Tutto sotto controllo.",
    );
  }

  const lista = segnalazioni.slice(0, 8).map((s, i) => {
    const emoji = s.priorita === "alta" ? "🔴" : "🟠";
    return `${emoji} ${i + 1}. ${(s.subject ?? "").substring(0, 90)}`;
  }).join("\n");

  return okResult(
    { items: segnalazioni },
    `📋 *${segnalazioni.length} richieste in sospeso*\n\n${lista}\n\n_Scrivi il numero per vedere i dettagli._`,
  );
}
