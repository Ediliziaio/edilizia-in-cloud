// MP02 — Aggiunge attività/materiali a un rapportino ESISTENTE del giorno.
// Se non esiste, errore con invito a usare crea_rapportino.

import type { ToolCtx, ToolResult, ToolDef } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";
import { resolveCantiere } from "../shared/resolve_cantiere.ts";
import { requireSiteAccess } from "../shared/siteAccess.ts";
import { rapportinoContentIssue } from "../../../_shared/operationalDraftValidation.ts";

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
  requires_confirmation: true,
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
  const issue = rapportinoContentIssue(args);
  if (issue) return errResult("invalid_rapportino", issue);

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

  const dataLavoro = args.data_lavoro ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
  try { await requireSiteAccess(ctx, orderId); }
  catch { return errResult("cantiere_access_unavailable", "Non posso verificare l’accesso al cantiere. Nessuna modifica salvata."); }

  const { data: existing, error: readError } = await ctx.supabase
    .from("campo_rapportini")
    .select("id, stato, updated_at, descrizione_lavori, materiali_usati, note")
    .eq("company_id", ctx.company_id)
    .eq("user_id", ctx.user_id)
    .eq("order_id", orderId)
    .eq("data_lavoro", dataLavoro)
    .maybeSingle();
  if (readError) return errResult("rapportino_lookup_failed", "Lettura rapportino non disponibile. Nessuna modifica salvata.");

  if (!existing) {
    return errResult(
      "rapportino_not_found",
      `Non c’è un rapportino del ${dataLavoro} su questo cantiere. Dimmi le ore o le attività per prepararne una bozza.`,
    );
  }
  if (existing.stato !== "bozza") return errResult("rapportino_locked", "Il rapportino è già inviato o approvato: la rettifica va gestita dall’ufficio.");
  if (existing.materiali_usati != null && !Array.isArray(existing.materiali_usati)) return errResult("invalid_existing_materials", "Elenco materiali esistente da verificare nell’app.");

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

  let update = ctx.supabase
    .from("campo_rapportini")
    .update({
      descrizione_lavori: mergedDescrizione || existing.descrizione_lavori,
      materiali_usati: mergedMateriali,
      note: mergedNote,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id).eq("company_id", ctx.company_id).eq("user_id", ctx.user_id).eq("order_id", orderId).eq("stato", "bozza");
  update = existing.updated_at == null ? update.is("updated_at", null) : update.eq("updated_at", existing.updated_at);
  const { data: updated, error } = await update.select("id").maybeSingle();

  if (error || !updated?.id) return errResult("rapportino_update_unconfirmed", "Aggiornamento non confermato: il rapportino potrebbe essere cambiato. Verifica nell’app prima di riprovare.");

  const parts = [];
  if (args.attivita?.length) parts.push(`${args.attivita.length} attività`);
  if (args.materiali_usati?.length) parts.push(`${args.materiali_usati.length} materiali`);
  if (args.note) parts.push("nota");

  return okResult(
    { id: existing.id },
    `✅ Aggiunto alla bozza del ${dataLavoro}: ${parts.join(", ")}. Non ancora inviata all’ufficio. Materiali annotati, nessuno scarico di magazzino.`,
  );
}
