// MP02 — Tool operaio: crea o aggiorna rapportino giornaliero.
// Schema DB reale: campo_rapportini usa user_id (non employee_id) + order_id
// (non cantiere_id) + data_lavoro (non data). Attività → descrizione_lavori (TEXT).

import type { ToolCtx, ToolResult, ToolDef } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";
import { resolveCantiere } from "../shared/resolve_cantiere.ts";

export const creaRapportinoDef: Omit<ToolDef, "handler"> = {
  name: "crea_rapportino",
  description:
    "Crea o aggiorna il rapportino giornaliero dell'operaio per un cantiere. " +
    "UPSERT su (user_id, order_id, data_lavoro). Chiama SOLO quando l'operaio " +
    "ha dato almeno ore_lavorate oppure almeno 1 attività. Se non hai order_id, " +
    "passa cantiere_hint con il nome parziale.",
  parameters: {
    type: "object",
    properties: {
      order_id: { type: "string", description: "UUID cantiere (orders.id). Opzionale se c'è cantiere_hint." },
      cantiere_hint: { type: "string", description: "Nome parziale cantiere (es: 'Rossi', 'Via Verdi')." },
      data_lavoro: { type: "string", description: "YYYY-MM-DD. Default oggi." },
      ore_lavorate: { type: "number", minimum: 0, maximum: 14 },
      ore_straordinario: { type: "number", minimum: 0, maximum: 8 },
      attivita: {
        type: "array",
        items: { type: "string" },
        description: "Lista attività svolte — concatenate in descrizione_lavori.",
      },
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
      meteo: {
        type: "string",
        enum: ["soleggiato", "nuvoloso", "pioggia", "neve", "vento", "non_specificato"],
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
  ore_lavorate?: number;
  ore_straordinario?: number;
  attivita?: string[];
  materiali_usati?: Array<{ descrizione: string; quantita?: number; unita_misura?: string }>;
  meteo?: string;
  note?: string;
}

export async function creaRapportino(
  ctx: ToolCtx,
  args: Args,
): Promise<ToolResult<{ id: string; is_new: boolean; cantiere_nome: string }>> {
  if (!ctx.user_id) {
    return errResult(
      "no_user_id",
      "Non riesco a identificarti. Chiedi al titolare di registrarti in Edilizia in Cloud.",
    );
  }

  if (!args.ore_lavorate && (!args.attivita || args.attivita.length === 0)) {
    return errResult(
      "insufficient_data",
      "Dimmi almeno le ore lavorate oppure almeno un'attività svolta.",
    );
  }

  let orderId = args.order_id;
  let cantiereNome = "";

  if (!orderId) {
    const resolved = await resolveCantiere(ctx, args.cantiere_hint);
    if (!resolved.cantiere_id) {
      return errResult(
        "cantiere_ambiguous",
        resolved.ask_user ?? "A quale cantiere ti riferisci?",
      );
    }
    orderId = resolved.cantiere_id;
    cantiereNome = resolved.cantiere_nome ?? "";
  }

  // Verifica cantiere
  const { data: cantiere } = await ctx.supabase
    .from("orders")
    .select("id, description, order_code, company_id")
    .eq("id", orderId)
    .eq("company_id", ctx.company_id)
    .maybeSingle();

  if (!cantiere) {
    return errResult(
      "cantiere_not_found",
      "Questo cantiere non risulta nella tua azienda. Scrivi \"cantieri oggi\" per la lista.",
    );
  }

  cantiereNome = cantiere.description || cantiere.order_code || cantiereNome || "cantiere";
  // Oggi in Italia: con la data UTC un rapportino mandato dopo mezzanotte
  // finiva sul giorno prima.
  const dataLavoro = args.data_lavoro ??
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
  // «non_specificato» non è un valore ammesso dalla colonna meteo.
  const meteo = args.meteo && args.meteo !== "non_specificato" ? args.meteo : null;

  const descriptionFromAttivita = args.attivita?.length
    ? args.attivita.join(". ")
    : null;

  // Cerca esistente
  const { data: existing } = await ctx.supabase
    .from("campo_rapportini")
    .select("id, ore_lavorate, descrizione_lavori, materiali_usati, note, ore_straordinario")
    .eq("user_id", ctx.user_id)
    .eq("order_id", orderId)
    .eq("data_lavoro", dataLavoro)
    .maybeSingle();

  if (existing) {
    const mergedDescrizione = [existing.descrizione_lavori, descriptionFromAttivita]
      .filter(Boolean).join(". ");
    const mergedMateriali = [
      ...((existing.materiali_usati as unknown as Array<Record<string, unknown>>) ?? []),
      ...(args.materiali_usati ?? []),
    ];
    const mergedNote = existing.note && args.note
      ? `${existing.note}\n${args.note}`
      : (existing.note ?? args.note ?? null);

    const { data: updated, error } = await ctx.supabase
      .from("campo_rapportini")
      .update({
        ore_lavorate: args.ore_lavorate ?? existing.ore_lavorate,
        ore_straordinario: args.ore_straordinario ?? existing.ore_straordinario,
        descrizione_lavori: mergedDescrizione || existing.descrizione_lavori,
        materiali_usati: mergedMateriali,
        ...(meteo ? { meteo } : {}),
        note: mergedNote,
        source: "whatsapp",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("id")
      .single();

    if (error) return errResult(error.message, "Errore aggiornando il rapportino.");

    const oreTot = args.ore_lavorate ?? existing.ore_lavorate ?? 0;
    return okResult(
      { id: updated.id, is_new: false, cantiere_nome: cantiereNome },
      `✅ Rapportino aggiornato per ${cantiereNome}. Ore totali: ${oreTot}h.`,
    );
  }

  // INSERT nuovo
  const { data: inserted, error } = await ctx.supabase
    .from("campo_rapportini")
    .insert({
      company_id: ctx.company_id,
      user_id: ctx.user_id,
      order_id: orderId,
      data_lavoro: dataLavoro,
      ore_lavorate: args.ore_lavorate ?? null,
      ore_straordinario: args.ore_straordinario ?? null,
      descrizione_lavori: descriptionFromAttivita,
      materiali_usati: args.materiali_usati ?? [],
      meteo,
      note: args.note ?? null,
      source: "whatsapp",
      // La colonna ammette solo employee / subcontractor: con «operaio»
      // (com'era fino al 25/09/2026) ogni rapportino nuovo da WhatsApp falliva.
      role_type: "employee",
      stato: "bozza",
    })
    .select("id")
    .single();

  if (error) return errResult(error.message, "Errore creando il rapportino.");

  // Aggiorna sessione con current_cantiere_id
  if (ctx.sessionId) {
    await ctx.supabase
      .from("whatsapp_sessions")
      .update({
        current_cantiere_id: orderId,
        last_activity_at: new Date().toISOString(),
      })
      .eq("id", ctx.sessionId);
  }

  const riepilogo = [
    `✅ Rapportino creato per ${cantiereNome}`,
    args.ore_lavorate ? `• Ore: ${args.ore_lavorate}h` : null,
    args.attivita?.length ? `• Attività: ${args.attivita.join(", ")}` : null,
    args.materiali_usati?.length
      ? `• Materiali: ${args.materiali_usati.map((m) => m.descrizione).join(", ")}`
      : null,
  ].filter(Boolean).join("\n");

  return okResult(
    { id: inserted.id, is_new: true, cantiere_nome: cantiereNome },
    riepilogo,
  );
}
