// MP02 — Aggiunge attività/materiali a un rapportino ESISTENTE del giorno.
// Se non esiste, errore con invito a usare crea_rapportino.

import type { ToolCtx, ToolResult, ToolDef } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";
import { resolveCantiere } from "../shared/resolve_cantiere.ts";

export const aggiungiAttivitaRapportinoDef: Omit<ToolDef, "handler"> = {
  name: "aggiungi_attivita_rapportino",
  description:
    "Aggiunge attività e/o materiali a un rapportino ESISTENTE (stesso giorno, stesso cantiere, stesso operaio). " +
    "Se non esiste, restituisce errore invitando l'operaio a usare crea_rapportino.",
  parameters: {
    type: "object",
    properties: {
      order_id: { type: "string" },
      cantiere_hint: { type: "string" },
      data_lavoro: { type: "string", description: "YYYY-MM-DD, default oggi" },
      attivita: { type: "array", items: { type: "string" } },
      materiali_usati: {
        type: "array",
        items: {
          type: "object",
          properties: {
            descrizione: { type: "string" },
            quantita: { type: "number" },
            unita_misura: { type: "string" },
          },
          required: ["descrizione"],
        },
      },
      note: { type: "string" },
    },
    additionalProperties: false,
  },
  requires_grants: ["rapportino.write"],
};

interface Args {
  order_id?: string;
  cantiere_hint?: string;
  data_lavoro?: string;
  attivita?: string[];
  materiali_usati?: Array<{ descrizione: string; quantita?: number; unita_misura?: string }>;
  note?: string;
}

export async function aggiungiAttivitaRapportino(
  ctx: ToolCtx,
  args: Args,
): Promise<ToolResult<{ id: string }>> {
  if (!ctx.user_id) {
    return errResult("no_user_id", "Non riesco a identificarti.");
  }

  if (
    (!args.attivita || args.attivita.length === 0) &&
    (!args.materiali_usati || args.materiali_usati.length === 0) &&
    !args.note
  ) {
    return errResult(
      "insufficient_data",
      "Cosa vuoi aggiungere? Attività, materiali o una nota?",
    );
  }

  let orderId = args.order_id;
  if (!orderId) {
    const resolved = await resolveCantiere(ctx, args.cantiere_hint);
    if (!resolved.cantiere_id) {
      return errResult("cantiere_ambiguous", resolved.ask_user ?? "Quale cantiere?");
    }
    orderId = resolved.cantiere_id;
  }

  const dataLavoro = args.data_lavoro ?? new Date().toISOString().substring(0, 10);

  const { data: existing } = await ctx.supabase
    .from("campo_rapportini")
    .select("id, descrizione_lavori, materiali_usati, note")
    .eq("user_id", ctx.user_id)
    .eq("order_id", orderId)
    .eq("data_lavoro", dataLavoro)
    .maybeSingle();

  if (!existing) {
    return errResult(
      "rapportino_not_found",
      "Non c'è ancora un rapportino per oggi su questo cantiere. Dimmi prima le ore lavorate.",
    );
  }

  const newAttivita = args.attivita?.join(". ");
  const mergedDescrizione = [existing.descrizione_lavori, newAttivita]
    .filter(Boolean).join(". ");
  const mergedMateriali = [
    ...((existing.materiali_usati as unknown as Array<Record<string, unknown>>) ?? []),
    ...(args.materiali_usati ?? []),
  ];
  const mergedNote = existing.note && args.note
    ? `${existing.note}\n${args.note}`
    : (existing.note ?? args.note ?? null);

  const { error } = await ctx.supabase
    .from("campo_rapportini")
    .update({
      descrizione_lavori: mergedDescrizione || existing.descrizione_lavori,
      materiali_usati: mergedMateriali,
      note: mergedNote,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);

  if (error) return errResult(error.message, "Errore aggiungendo al rapportino.");

  const parts = [];
  if (args.attivita?.length) parts.push(`${args.attivita.length} attività`);
  if (args.materiali_usati?.length) parts.push(`${args.materiali_usati.length} materiali`);
  if (args.note) parts.push("nota");

  return okResult(
    { id: existing.id },
    `✅ Aggiunto al rapportino: ${parts.join(", ")}.`,
  );
}
