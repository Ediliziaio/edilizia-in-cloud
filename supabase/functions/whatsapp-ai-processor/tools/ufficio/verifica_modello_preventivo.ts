import { errResult, okResult, type ToolCtx, type ToolDef, type ToolResult } from "../shared/types.ts";
import { modelArchiveKey, MODEL_ARCHIVES, publishedModel, modelWorkflowCapabilities } from "../../../_shared/whatsappQuoteModels.ts";
import { moduloAttivo } from "../../../_shared/moduloAttivo.ts";
import { requireQuoteModelAccess } from "../../../_shared/quoteModelAccess.ts";
import { isEdileDraftModel, validEdileReview } from "../../../_shared/edileQuoteDraft.ts";

export const verificaModelloPreventivoDef: Omit<ToolDef, "handler"> = {
  name: "verifica_modello_preventivo",
  description: "Verifica il modello ESATTO pubblicato dall’azienda e il modulo abilitato prima di preparare un preventivo dedicato. Restituisce la revisione da confermare; non genera PDF, non certifica l’aspetto grafico e non modifica dati. Se il modello non è pubblicato chiedi di sincronizzarlo nell’app, senza sostituirlo con quello generico.",
  parameters: { type: "object", additionalProperties: false, properties: {
    modulo: { type: "string", enum: Object.keys(MODEL_ARCHIVES) },
    modello: { type: "string", description: "ID esatto dell’intervento, ad esempio completo o vasca-doccia per bagni. Se non noto, chiedilo; non inventarlo." },
    quote_id: { type: "string", description: "Bozza classica da convertire: restituisce revisione e voci da mostrare prima della conferma." },
  }, required: ["modulo", "modello"] },
  requires_grants: ["preventivi.pdf"],
};
export async function verificaModelloPreventivo(ctx: ToolCtx, args: Record<string, unknown>): Promise<ToolResult> {
  if (!ctx.user_id || !["ufficio", "admin"].includes(ctx.kind)) return errResult("no_user", "Serve un utente dell’ufficio autorizzato.");
  if (typeof args.modulo !== "string" || typeof args.modello !== "string") return errResult("invalid_args", "Indica modulo e modello esatti.");
  try {
    await requireQuoteModelAccess(ctx.supabase, ctx.company_id, ctx.user_id);
    const key = modelArchiveKey(args.modulo, ctx.company_id, args.modello);
    if (!await moduloAttivo(ctx.supabase, ctx.company_id, MODEL_ARCHIVES[args.modulo].feature)) return errResult("modulo_non_attivo", "Questo modulo non è abilitato per la tua azienda. Nessun preventivo generico preparato al suo posto.");
    const { data, error } = await ctx.supabase.from("modelli_libreria_azienda").select("contenuto, salvato_il")
      .eq("company_id", ctx.company_id).eq("chiave", key).maybeSingle();
    if (error) return errResult("modello_non_leggibile", "Non riesco a verificare il modello aziendale. Nessun dato modificato.");
    if (!data) return errResult("modello_non_pubblicato", "Il modello scelto non è ancora pubblicato online per l’azienda. Salvalo e sincronizzalo dalla libreria prima di usarlo su WhatsApp.");
    const model = publishedModel(data.contenuto, ctx.company_id, args.modello);
    const capabilities = modelWorkflowCapabilities(args.modulo, args.modello);
    let quotePreview: Record<string, unknown> = {};
    if (args.quote_id !== undefined) {
      if (typeof args.quote_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args.quote_id)) return errResult("invalid_quote", "Indica l’ID esatto del preventivo.");
      if (isEdileDraftModel(args.modulo, args.modello)) {
        const { data: review, error: reviewError } = await ctx.supabase.rpc("whatsapp_review_edile_quote", {
          p_company_id: ctx.company_id, p_user_id: ctx.user_id, p_quote_id: args.quote_id,
          p_module: args.modulo, p_model_id: args.modello,
        });
        if (reviewError || !validEdileReview(review, ctx.company_id, args.quote_id, args.modulo, args.modello)) {
          return errResult("computo_non_convertibile", "Non posso confermare una conversione senza perdita: verifica nell’app IVA, sconti, prodotti configurati e voci. Nessun dato modificato. La funzione potrebbe non essere ancora attiva.");
        }
        // The RPC locks/reads its own exact model version. Do not overwrite its
        // revision with the earlier library read, which could have become stale.
        return okResult({ ...review, modulo: args.modulo, modello: args.modello, modello_pubblicato: true,
          immagini_verificate: false, capabilities },
          `Bozza e modello ${args.modulo}/${args.modello} verificati. Mostra cliente, tutte le voci e totale prima della conferma. Posso salvarli nel preventivatore dedicato; dati tecnici, condizioni e PDF vanno completati nell’app. Nessun documento inviato.`);
      }
      const { data: quote, error: quoteError } = await ctx.supabase.from("quotes")
        .select("id, quote_number, client_name, updated_at, status, total, source")
        .eq("company_id", ctx.company_id).eq("id", args.quote_id).is("deleted_at", null).maybeSingle();
      if (quoteError || !quote || quote.status !== "bozza" || String(quote.source ?? "").startsWith("modulo:")) return errResult("quote_non_convertibile", "Non trovo una bozza classica convertibile nell’azienda.");
      const { data: items, error: itemsError } = await ctx.supabase.from("quote_items")
        .select("name, description, quantity, unit_price, unit_of_measure, vat_rate, item_type")
        .eq("company_id", ctx.company_id).eq("quote_id", quote.id).order("sort_order").limit(201);
      if (itemsError || !items?.length || items.length > 200) return errResult("voci_non_verificabili", "Non posso verificare tutte le voci del preventivo. Nessuna conversione preparata.");
      quotePreview = { quote_id: quote.id, quote_number: quote.quote_number, cliente: quote.client_name,
        revisione_preventivo: quote.updated_at ?? null, totale: quote.total, voci_da_mostrare: items };
    }
    return okResult({ modulo: args.modulo, modello: args.modello, revisione_modello: model.revision,
      ...quotePreview, modello_pubblicato: true, pdf_generato: false, immagini_verificate: false, capabilities },
    `Modello ${args.modulo}/${args.modello} trovato nell’archivio dell’azienda. La versione è ${model.revision}. PDF e immagini non ancora verificati. ${capabilities.workflow === "app_required" ? "Per questo modulo la creazione e il PDF dedicato vanno completati nell’app; non posso sostituirli con un preventivo classico." : capabilities.workflow === "edile_reviewed_draft" ? "Posso preparare una bozza dedicata: verifica anche il quote_id prima della conferma. Dati tecnici, condizioni e PDF vanno completati nell’app." : "Posso preparare il progetto bagno e il PDF verificato, con conferme separate; l’invio è solo al tuo numero."}`);
  } catch (e) { return errResult("modello_non_valido", e instanceof Error ? e.message : "Modello non valido."); }
}
