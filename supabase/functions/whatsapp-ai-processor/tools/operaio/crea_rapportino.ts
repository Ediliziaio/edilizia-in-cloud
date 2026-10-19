// MP02 — Tool operaio: crea o aggiorna rapportino giornaliero.
// Schema DB reale: campo_rapportini usa user_id (non employee_id) + order_id
// (non cantiere_id) + data_lavoro (non data). Attività → descrizione_lavori (TEXT).

import type { ToolCtx, ToolResult, ToolDef } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";
import { resolveCantiere } from "../shared/resolve_cantiere.ts";
import { requireSiteAccess } from "../shared/siteAccess.ts";
import { rapportinoContentIssue, workHoursIssue } from "../../../_shared/operationalDraftValidation.ts";
import { rapportiniWhatsAppDelDipendente } from "../shared/cantieriAperti.ts";
import { giornalieroDelGiorno } from "../../../_shared/rapportoGiornaliero.ts";

export const creaRapportinoDef: Omit<ToolDef, "handler"> = {
  name: "crea_rapportino",
  description:
    "Registra il rapportino giornaliero dell'operaio per un cantiere e lo INVIA all'ufficio, come dall'app Campo. " +
    "Un solo rapportino per persona, cantiere e giorno. Chiama SOLO quando l'operaio " +
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
  // Anche chi non ha l'account nell'app (18/10/2026): è in anagrafica dipendenti
  // e il rapportino va a suo nome, con lui nelle presenze come la squadra nell'app.
  if (!ctx.user_id && !ctx.employee_id) {
    return errResult(
      "no_identity",
      "Non riesco a identificarti. Chiedi all'ufficio di controllare il tuo numero in anagrafica.",
    );
  }
  const issue = rapportinoContentIssue(args) ?? workHoursIssue(args.ore_lavorate, args.ore_straordinario, 14);
  if (issue) return errResult("invalid_rapportino", issue);
  if (args.meteo != null && !["soleggiato", "nuvoloso", "pioggia", "neve", "vento", "non_specificato"].includes(args.meteo)) return errResult("invalid_meteo", "Meteo non valido.");

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
  try { await requireSiteAccess(ctx, orderId); }
  catch { return errResult("cantiere_access_unavailable", "Non posso verificare l’accesso al cantiere. Nessun rapportino salvato."); }
  const { data: cantiere, error: siteError } = await ctx.supabase
    .from("orders")
    .select("id, description, order_code, company_id")
    .eq("id", orderId)
    .eq("company_id", ctx.company_id)
    .maybeSingle();

  if (siteError || !cantiere) {
    return errResult(
      "cantiere_not_found",
      "Questo cantiere non risulta nella tua azienda. Scrivi \"cantieri oggi\" per la lista.",
    );
  }

  cantiereNome = cantiere.description || cantiere.order_code || cantiereNome || "cantiere";
  // Oggi in Italia: con la data UTC un rapportino mandato dopo mezzanotte
  // finiva sul giorno prima.
  const oggi = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
  const dataLavoro = args.data_lavoro ?? oggi;
  // Il rapportino nasce già inviato: niente giorni futuri, e indietro al massimo
  // una settimana. Per giorni più vecchi lo corregge l'ufficio dall'app.
  const settimanaFa = new Date(`${oggi}T12:00:00Z`);
  settimanaFa.setUTCDate(settimanaFa.getUTCDate() - 7);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataLavoro) || dataLavoro > oggi || dataLavoro < settimanaFa.toISOString().slice(0, 10)) {
    return errResult("data_non_ammessa", "Il rapportino da WhatsApp vale per oggi o per un giorno dell'ultima settimana. Dimmi il giorno giusto, oppure chiedi all'ufficio.");
  }
  // «non_specificato» non è un valore ammesso dalla colonna meteo.
  const meteo = args.meteo && args.meteo !== "non_specificato" ? args.meteo : null;

  const descriptionFromAttivita = args.attivita?.length
    ? args.attivita.join(". ")
    : null;

  // Senza account: il nome per le presenze e per l'ufficio.
  let nomeDipendente: string | null = null;
  if (!ctx.user_id) {
    const { data: dip } = await ctx.supabase.from("employees").select("first_name, last_name")
      .eq("company_id", ctx.company_id).eq("id", ctx.employee_id).maybeSingle();
    nomeDipendente = [dip?.first_name, dip?.last_name].filter(Boolean).join(" ") || null;
  }

  // Cerca esistente: nello stesso giorno può esserci anche il collaudo col
  // cliente, che non va toccato da qui. Si lavora solo sul giornaliero.
  const colonne = "id, stato, updated_at, ore_lavorate, descrizione_lavori, materiali_usati, note, ore_straordinario, lavoro_completato, firma_cliente_url";
  const nonVerificabile = errResult("rapportino_lookup_failed", "Non posso verificare il rapportino esistente. Nessun nuovo rapportino creato: verifica prima di riprovare.");
  let existing: Record<string, unknown> | null = null;
  if (ctx.user_id) {
    const { data, error: readError } = await ctx.supabase
      .from("campo_rapportini")
      .select(colonne)
      .eq("company_id", ctx.company_id)
      .eq("user_id", ctx.user_id)
      .eq("order_id", orderId)
      .eq("data_lavoro", dataLavoro)
      .limit(5);
    if (readError) return nonVerificabile;
    existing = giornalieroDelGiorno(data as Array<Record<string, unknown>> | null);
  } else {
    let suoi;
    try { suoi = (await rapportiniWhatsAppDelDipendente(ctx, dataLavoro)).filter((r) => r.order_id === orderId && r.data_lavoro === dataLavoro); }
    catch { return nonVerificabile; }
    if (suoi.length > 0) {
      const { data, error: readError } = await ctx.supabase.from("campo_rapportini").select(colonne)
        .eq("company_id", ctx.company_id).in("id", suoi.map((r) => r.id)).limit(5);
      if (readError) return nonVerificabile;
      existing = giornalieroDelGiorno(data as Array<Record<string, unknown>> | null);
    }
  }

  const oreTotali = (ordinarie: unknown, straordinario: unknown) => Number(ordinarie ?? 0) + Number(straordinario ?? 0);
  const presenze = (ordinarie: unknown, straordinario: unknown) => ctx.user_id ? undefined
    : [{ employee_id: ctx.employee_id, nome: nomeDipendente ?? "Operaio", ore: oreTotali(ordinarie, straordinario) }];
  const conclusione = "L'ufficio lo controlla e lo approva. Materiali annotati, nessuno scarico di magazzino.";

  if (existing) {
    // Inviato o approvato: lo corregge l'ufficio. Una bozza dell'app o un
    // rapportino respinto si completano e si (ri)mandano, come dall'app.
    if (existing.stato !== "bozza" && existing.stato !== "rifiutato") {
      return errResult("rapportino_locked", `Il rapportino di oggi per ${cantiereNome} è già all'ufficio. Per correggerlo scrivi all'ufficio: non lo modifico.`);
    }
    if (existing.materiali_usati != null && !Array.isArray(existing.materiali_usati)) return errResult("invalid_existing_materials", "Elenco materiali esistente da verificare nell’app.");
    const ore = args.ore_lavorate ?? existing.ore_lavorate;
    const straordinario = args.ore_straordinario ?? existing.ore_straordinario;
    const mergedHoursIssue = workHoursIssue(ore as number | undefined, straordinario as number | undefined, 14);
    if (mergedHoursIssue) return errResult("invalid_rapportino", mergedHoursIssue);
    const mergedDescrizione = [existing.descrizione_lavori, descriptionFromAttivita]
      .filter(Boolean).join(". ");
    const mergedMateriali = [
      ...((existing.materiali_usati as unknown as Array<Record<string, unknown>>) ?? []),
      ...(args.materiali_usati ?? []),
    ];
    const mergedNote = existing.note && args.note
      ? `${existing.note}\n${args.note}`
      : (existing.note ?? args.note ?? null);

    const pres = presenze(ore, straordinario);
    let update = ctx.supabase
      .from("campo_rapportini")
      .update({
        ore_lavorate: ore,
        ore_straordinario: straordinario,
        descrizione_lavori: mergedDescrizione || existing.descrizione_lavori,
        materiali_usati: mergedMateriali,
        ...(meteo ? { meteo } : {}),
        ...(pres ? { presenze: pres } : {}),
        note: mergedNote,
        source: "whatsapp",
        stato: "inviato",
        motivo_rifiuto: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id as string)
      .eq("company_id", ctx.company_id).eq("order_id", orderId).eq("stato", existing.stato as string);
    update = ctx.user_id ? update.eq("user_id", ctx.user_id) : update.is("user_id", null);
    update = existing.updated_at == null ? update.is("updated_at", null) : update.eq("updated_at", existing.updated_at as string);
    const { data: updated, error } = await update.select("id").maybeSingle();

    if (error || !updated?.id) return errResult("rapportino_update_unconfirmed", "Invio non confermato: il rapportino potrebbe essere cambiato. Verifica nell’app prima di riprovare.");

    return okResult(
      { id: updated.id, is_new: false, cantiere_nome: cantiereNome },
      `✅ Rapportino inviato all'ufficio per ${cantiereNome} · ${dataLavoro}. Ore ordinarie: ${ore ?? 0}h; straordinario: ${straordinario ?? 0}h. ${conclusione}`,
    );
  }

  // INSERT nuovo
  const pres = presenze(args.ore_lavorate, args.ore_straordinario);
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
      note: [ctx.user_id ? null : `Mandato su WhatsApp da ${nomeDipendente ?? "un operaio senza account"}`, args.note ?? null].filter(Boolean).join("\n") || null,
      source: "whatsapp",
      // La colonna ammette solo employee / subcontractor: con «operaio»
      // (com'era fino al 25/09/2026) ogni rapportino nuovo da WhatsApp falliva.
      role_type: "employee",
      // Come dall'app Campo: dopo il Sì dell'operaio il rapportino è all'ufficio.
      stato: "inviato",
      ...(pres ? { presenze: pres } : {}),
    })
    .select("id")
    .single();

  if (error || !inserted?.id) return errResult("rapportino_insert_unconfirmed", "Salvataggio non confermato. Verifica nell’app prima di riprovare.");

  // Aggiorna sessione con current_cantiere_id
  if (ctx.sessionId) {
    await ctx.supabase
      .from("whatsapp_sessions")
      .update({
        current_cantiere_id: orderId,
        last_activity_at: new Date().toISOString(),
      })
      .eq("id", ctx.sessionId).eq("company_id", ctx.company_id).eq("wa_number_id", ctx.waNumberId);
  }

  const riepilogo = [
    `✅ Rapportino inviato all'ufficio per ${cantiereNome} · ${dataLavoro}`,
    args.ore_lavorate ? `• Ore: ${args.ore_lavorate}h${args.ore_straordinario ? ` + ${args.ore_straordinario}h di straordinario` : ""}` : null,
    args.attivita?.length ? `• Lavori: ${args.attivita.join(", ")}` : null,
    args.materiali_usati?.length
      ? `• Materiali: ${args.materiali_usati.map((m) => m.descrizione).join(", ")}`
      : null,
    conclusione,
  ].filter(Boolean).join("\n");

  return okResult(
    { id: inserted.id, is_new: true, cantiere_nome: cantiereNome },
    riepilogo,
  );
}
