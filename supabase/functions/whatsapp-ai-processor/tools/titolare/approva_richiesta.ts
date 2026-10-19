// Chiudere una segnalazione dal cantiere (19/10/2026): è un ticket con fonte
// «campo». «Approvata» = risolta, «rifiutata» = chiusa senza intervento.

import type { ToolCtx, ToolResult, ToolDef } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";

export const approvaRichiestaDef: Omit<ToolDef, "handler"> = {
  name: "approva_richiesta",
  description:
    "Approva o rifiuta una richiesta/segnalazione. Idempotente: se già in stato finale, ritorna lo stato corrente. " +
    "Richiede: richiesta_id (UUID) + esito ('approvata'|'rifiutata'). " +
    "IMPORTANTE: mostra sempre i dettagli della richiesta PRIMA di chiamare questo tool.",
  parameters: {
    type: "object",
    properties: {
      richiesta_id: { type: "string" },
      esito: { type: "string", enum: ["approvata", "rifiutata"] },
      note: { type: "string" },
    },
    required: ["richiesta_id", "esito"],
    additionalProperties: false,
  },
  requires_grants: ["approvazioni.write"],
  requires_confirmation: true,
};

interface Args {
  richiesta_id: string;
  esito: "approvata" | "rifiutata";
  note?: string;
}

export async function approvaRichiesta(
  ctx: ToolCtx,
  args: Args,
): Promise<ToolResult> {
  const { data: seg } = await ctx.supabase
    .from("tickets")
    .select("id, status, subject")
    .eq("id", args.richiesta_id)
    .eq("company_id", ctx.company_id)
    .eq("fonte", "campo")
    .maybeSingle();

  if (!seg) {
    return errResult("not_found", "Non trovo questa segnalazione: chiedimi l'elenco di quelle aperte.");
  }

  // Idempotenza: se è già chiusa lo dice.
  if (["risolto", "chiuso", "annullato"].includes(String(seg.status))) {
    return okResult(
      { id: seg.id, stato_corrente: seg.status },
      `Questa segnalazione è già ${seg.status}. Nessuna azione eseguita.`,
    );
  }

  const nuovoStato = args.esito === "approvata" ? "risolto" : "chiuso";

  const { error } = await ctx.supabase
    .from("tickets")
    .update({ status: nuovoStato, updated_at: new Date().toISOString() })
    .eq("id", args.richiesta_id)
    .eq("company_id", ctx.company_id);

  if (error) return errResult("aggiornamento_fallito", "Non sono riuscito ad aggiornare la segnalazione: riprova dall'app.");

  const icon = args.esito === "approvata" ? "✅" : "❌";
  return okResult(
    { id: args.richiesta_id, esito: args.esito, stato: nuovoStato },
    `${icon} Segnalazione ${nuovoStato === "risolto" ? "risolta" : "chiusa"}.`,
  );
}
