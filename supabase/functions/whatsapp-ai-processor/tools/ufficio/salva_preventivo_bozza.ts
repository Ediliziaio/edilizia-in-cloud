import { SILVIO_TOOLS, type ToolContext } from "../../../_shared/silvioTools.ts";
import { errResult, okResult, type ToolCtx, type ToolDef, type ToolResult } from "../shared/types.ts";
import { idAttivitaValido } from "../../../../../shared/aiAttivita.ts";
export const salvaPreventivoBozzaDef: Omit<ToolDef, "handler"> = {
  name: "salva_preventivo_bozza",
  description: "Salva la bozza dopo la conferma di cliente, voci, quantità, unità, prezzi e IVA. Invia il PDF nella chat di chi l'ha chiesto se invia_pdf_qui è stato autorizzato. Usa i dati_da_confermare dell'anteprima.",
  parameters: {
    ...SILVIO_TOOLS.create_quote_draft.schema.function.parameters,
    properties: {
      ...SILVIO_TOOLS.create_quote_draft.schema.function.parameters.properties,
      invia_pdf_qui: { type: "boolean", description: "Attiva solo su richiesta esplicita di ricevere il PDF in questa chat." },
      bozza_whatsapp_id: { type: "string", description: "Identificativo della bozza ripresa, inserito dal gestionale." },
      revisione_whatsapp: { type: "integer", minimum: 1, description: "Revisione congelata nel riepilogo dal gestionale." },
    },
    additionalProperties: false,
  },
  requires_grants: ["preventivi.ai"], requires_confirmation: true,
};
export async function salvaPreventivoBozza(ctx: ToolCtx, args: Record<string, unknown>): Promise<ToolResult> {
  if (!ctx.user_id || !["ufficio", "admin"].includes(ctx.kind)) return errResult("no_user", "Questo salvataggio richiede un utente dell’ufficio autorizzato.");
  const { bozza_whatsapp_id: bozza, revisione_whatsapp: revisione, invia_pdf_qui: _inviaQui, ...anteprima } = args;
  let result;
  if (bozza !== undefined || revisione !== undefined) {
    if (!idAttivitaValido(bozza) || !Number.isInteger(revisione) || bozza !== ctx.sourceMessageId) {
      return errResult("bozza_da_riprendere", "Riprendi la bozza WhatsApp e conferma il riepilogo aggiornato.");
    }
    const { data, error } = await ctx.supabase.rpc("whatsapp_salva_bozza_preventivo", { p_id: bozza, p_company: ctx.company_id,
      p_utente: ctx.user_id, p_revisione: revisione, p_anteprima: anteprima });
    if (error || data?.success !== true || !idAttivitaValido(data.quote_id)) {
      return errResult("bozza_da_riprendere", "Riprendi la bozza WhatsApp per vedere il riepilogo o il preventivo già salvato.");
    }
    result = data;
  } else result = await SILVIO_TOOLS.create_quote_draft.executor(anteprima, {
    supabase: ctx.supabase, companyId: ctx.company_id, userId: ctx.user_id,
    primaryRole: ctx.kind === "admin" ? "company_admin" : "company_staff", channel: "whatsapp",
  } as ToolContext);
  if (result?.error) return errResult("quote_save_unconfirmed", result.error);
  if (!bozza && idAttivitaValido(result.quote_id) && idAttivitaValido(ctx.sourceMessageId)) {
    try {
      const { error } = await ctx.supabase.from("quotes").update({ ai_richiesta_id: ctx.sourceMessageId })
        .eq("company_id", ctx.company_id).eq("id", result.quote_id).is("ai_richiesta_id", null);
      if (error) throw error;
    } catch {
      console.warn("[preventivi] Collegamento all’attività AI non disponibile");
    }
  }
  const eur = (value: number) => value.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
  const etichetta = result.quote_number ? `Bozza ${result.quote_number} salvata` : "Bozza salvata";
  return okResult(result, `${etichetta}: ${result.items_count} voci. Imponibile ${eur(result.subtotal_eur)}, IVA ${eur(result.vat_eur)}, totale ${eur(result.total_eur)}.`);
}
