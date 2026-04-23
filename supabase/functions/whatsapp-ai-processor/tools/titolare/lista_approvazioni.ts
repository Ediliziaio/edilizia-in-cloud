// MP02 — Lista approvazioni pendenti (stub: lettura da segnalazioni urgenti
// in cantiere_segnalazioni come approssimazione prima di MP3).
// MP3 aggiungerà: preventivi in approvazione, ordini > soglia, ferie, acquisti.

import type { ToolCtx, ToolResult, ToolDef } from "../shared/types.ts";
import { okResult } from "../shared/types.ts";

export const listaApprovazioniDef: Omit<ToolDef, "handler"> = {
  name: "lista_approvazioni",
  description:
    "Lista di richieste che richiedono decisione del titolare. In MP02 include solo le segnalazioni aperte con urgenza alta/media. MP3 aggiungerà preventivi/ordini/ferie.",
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
  const { data: segnalazioni } = await ctx.supabase
    .from("cantiere_segnalazioni")
    .select("id, descrizione, urgenza, tipo_problema, created_at, order_id")
    .eq("company_id", ctx.company_id)
    .eq("stato", "aperta")
    .in("urgenza", ["alta", "media"])
    .order("created_at", { ascending: false })
    .limit(10);

  if (!segnalazioni || segnalazioni.length === 0) {
    return okResult(
      { items: [] },
      "✅ Nessuna richiesta in sospeso. Tutto sotto controllo.",
    );
  }

  const lista = segnalazioni.slice(0, 8).map((s, i) => {
    const emoji = s.urgenza === "alta" ? "🔴" : "🟠";
    const cat = s.tipo_problema ? ` [${s.tipo_problema}]` : "";
    const descr = (s.descrizione ?? "").substring(0, 80);
    return `${emoji} ${i + 1}. ${descr}${cat}`;
  }).join("\n");

  return okResult(
    { items: segnalazioni },
    `📋 *${segnalazioni.length} richieste in sospeso*\n\n${lista}\n\n_Scrivi il numero per vedere i dettagli._`,
  );
}
