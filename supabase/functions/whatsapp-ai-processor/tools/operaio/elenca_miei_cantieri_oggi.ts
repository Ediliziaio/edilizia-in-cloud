// MP02 — Lista cantieri attivi oggi per l'operaio.

import type { ToolCtx, ToolResult, ToolDef } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";
import { cantieriInOrdine, commesseAperte } from "../shared/cantieriAperti.ts";

export const elencaMieiCantieriOggiDef: Omit<ToolDef, "handler"> = {
  name: "elenca_miei_cantieri_oggi",
  description:
    "Elenca i cantieri aperti dell'operaio (le sue assegnazioni), dal più probabile per oggi, con il motivo. " +
    "Usa SEMPRE quando l'operaio non ha specificato il cantiere e non c'è cantiere in sessione.",
  parameters: {
    type: "object",
    properties: {
      data: { type: "string", description: "YYYY-MM-DD, default oggi" },
    },
    additionalProperties: false,
  },
  requires_grants: ["cantieri.list_assigned"],
};

interface CantiereItem {
  id: string;
  nome: string;
  indirizzo: string | null;
  motivo: string | null;
}

export async function elencaMieiCantieriOggi(
  ctx: ToolCtx,
  args: { data?: string },
): Promise<ToolResult<{ cantieri: CantiereItem[] }>> {
  if (!ctx.user_id && !ctx.employee_id) {
    return errResult("no_user_id", "Non riesco a identificarti.");
  }
  const adesso = args.data && /^\d{4}-\d{2}-\d{2}$/.test(args.data) ? new Date(`${args.data}T12:00:00Z`) : new Date();
  let ordinati;
  try {
    ordinati = await cantieriInOrdine(ctx, await commesseAperte(ctx, adesso), adesso);
  } catch {
    return errResult("site_list_unavailable", "Non riesco a leggere i tuoi cantieri adesso. Riprova tra poco.");
  }
  if (ordinati.length === 0) {
    return okResult(
      { cantieri: [] },
      "Non risulti su nessun cantiere aperto. Chiedi all'ufficio di aggiungerti alla squadra della commessa.",
    );
  }
  const cantieri: CantiereItem[] = ordinati.map((c) => ({
    id: c.id,
    nome: c.titolo,
    indirizzo: c.dettaglio,
    motivo: c.motivo,
  }));
  const lista = cantieri.slice(0, 9).map((c, i) =>
    `${i + 1}. ${c.nome} — ${c.indirizzo}${c.motivo ? ` (${c.motivo})` : ""}`
  ).join("\n");
  const extra = cantieri.length > 9 ? `\n...e altri ${cantieri.length - 9}: scrivimi il nome o la via.` : "";
  return okResult(
    { cantieri },
    `I tuoi cantieri aperti:\n${lista}${extra}\n\nA quale ti riferisci? (scrivi il numero o il nome)`,
  );
}
