// MP02 — Approvazione richiesta (stub safe MP02 — opera su cantiere_segnalazioni).
// MP3 estenderà a preventivi/ordini/ferie con audit log dedicato.

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
    .from("cantiere_segnalazioni")
    .select("id, stato, descrizione, urgenza")
    .eq("id", args.richiesta_id)
    .eq("company_id", ctx.company_id)
    .maybeSingle();

  if (!seg) {
    return errResult("not_found", "Richiesta non trovata.");
  }

  // Idempotenza: se già risolta/archiviata ritorna stato
  if (seg.stato === "risolta" || seg.stato === "archiviata") {
    return okResult(
      { id: seg.id, stato_corrente: seg.stato },
      `Questa richiesta è già ${seg.stato}. Nessuna azione eseguita.`,
    );
  }

  const nuovoStato = args.esito === "approvata" ? "risolta" : "archiviata";

  const { error } = await ctx.supabase
    .from("cantiere_segnalazioni")
    .update({
      stato: nuovoStato,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.richiesta_id);

  if (error) return errResult(error.message, "Errore aggiornando la richiesta.");

  const verb = args.esito === "approvata" ? "approvata" : "rifiutata";
  const icon = args.esito === "approvata" ? "✅" : "❌";
  return okResult(
    { id: args.richiesta_id, esito: args.esito, stato: nuovoStato },
    `${icon} Richiesta ${verb}. Stato: ${nuovoStato}.`,
  );
}
