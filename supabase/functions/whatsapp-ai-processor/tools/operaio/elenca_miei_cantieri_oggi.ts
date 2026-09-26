// MP02 — Lista cantieri attivi oggi per l'operaio.

import type { ToolCtx, ToolResult, ToolDef } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";

export const elencaMieiCantieriOggiDef: Omit<ToolDef, "handler"> = {
  name: "elenca_miei_cantieri_oggi",
  description:
    "Elenca i cantieri attivi oggi (o data specificata) della company dell'operaio. " +
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
  stato: string;
}

const ACTIVE_STATUSES = [
  "in_produzione",
  "in_corso",
  "attivo",
  "aperto",
  "in_lavorazione",
];

export async function elencaMieiCantieriOggi(
  ctx: ToolCtx,
  args: { data?: string },
): Promise<ToolResult<{ cantieri: CantiereItem[] }>> {
  if (!ctx.user_id) {
    return errResult("no_user_id", "Non riesco a identificarti.");
  }

  const dataRif = args.data ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());

  const { data: rows, error } = await ctx.supabase
    .from("orders")
    .select("id, description, order_code, indirizzo_lavori, status, work_start_date, work_end_date")
    .eq("company_id", ctx.company_id)
    .in("status", ACTIVE_STATUSES)
    .limit(20);

  if (error) return errResult(error.message, "Errore caricando i cantieri.");

  const filtered = (rows ?? []).filter((r) => {
    const startOk = !r.work_start_date || r.work_start_date <= dataRif;
    const endOk = !r.work_end_date || r.work_end_date >= dataRif;
    return startOk && endOk;
  });

  if (filtered.length === 0) {
    return okResult(
      { cantieri: [] },
      "Non hai cantieri attivi oggi. Contatta il titolare se pensi sia un errore.",
    );
  }

  const cantieri: CantiereItem[] = filtered.map((r) => ({
    id: r.id,
    nome: r.description || r.order_code || "Cantiere",
    indirizzo: r.indirizzo_lavori,
    stato: r.status ?? "",
  }));

  const lista = cantieri.slice(0, 5).map((c, i) =>
    `${i + 1}. ${c.nome}${c.indirizzo ? ` — ${c.indirizzo}` : ""}`
  ).join("\n");

  const extra = cantieri.length > 5 ? `\n...e altri ${cantieri.length - 5}` : "";

  return okResult(
    { cantieri },
    `I tuoi cantieri oggi:\n${lista}${extra}\n\nA quale ti riferisci? (scrivi nome o numero)`,
  );
}
