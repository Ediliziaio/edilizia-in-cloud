import { errResult, okResult, type ToolCtx, type ToolDef, type ToolResult } from "../shared/types.ts";
import { EDILE_DRAFT_MODULES, HASH, UUID, isEdileDraftModel, isRevision, edileProjectPath } from "../../../_shared/edileQuoteDraft.ts";

export const preparaPreventivoModelloDef: Omit<ToolDef, "handler"> = {
  name: "prepara_preventivo_modello",
  description: "Dopo verifica_modello_preventivo con quote_id e conferma esplicita, salva la bozza nel preventivatore ESATTO di climatizzazione/elettrico/termoidraulico/pavimenti/piscine/ristrutturazione. Usa revisioni e impronte restituite dalla verifica: non inventarle. Mostra prima cliente, modulo, modello, tutte le voci e totale. Congela testi e foto del modello pubblicato, controlla ogni voce e conserva i costi unitari disponibili. Non inventa dimensionamento, incentivi o condizioni. Restituisce il progetto da completare nell’app: NON genera né invia PDF. Bagni usa il suo tool dedicato. Se esito incerto verifica nell’app, niente retry automatico.",
  parameters: { type: "object", additionalProperties: false, properties: {
    modulo: { type: "string", enum: Object.keys(EDILE_DRAFT_MODULES) },
    modello: { type: "string", description: "Uno dei modelli con project_creation_tool disponibile nella verifica." },
    quote_id: { type: "string", pattern: UUID.source },
    revisione_modello: { type: "string" }, revisione_preventivo: { type: "string" },
    impronta_preventivo: { type: "string", pattern: HASH.source },
    impronta_modello: { type: "string", pattern: HASH.source },
  }, required: ["modulo", "modello", "quote_id", "revisione_modello", "revisione_preventivo", "impronta_preventivo", "impronta_modello"] },
  requires_grants: ["preventivi.pdf"], requires_confirmation: true,
};

export async function preparaPreventivoModello(ctx: ToolCtx, args: Record<string, unknown>): Promise<ToolResult> {
  if (!ctx.user_id || !["admin", "ufficio"].includes(ctx.kind)) return errResult("no_user", "Serve un utente dell’ufficio autorizzato.");
  if (!isEdileDraftModel(args.modulo, args.modello) || typeof args.quote_id !== "string" || !UUID.test(args.quote_id) ||
    !isRevision(args.revisione_modello) || !isRevision(args.revisione_preventivo) ||
    typeof args.impronta_preventivo !== "string" || !HASH.test(args.impronta_preventivo) ||
    typeof args.impronta_modello !== "string" || !HASH.test(args.impronta_modello)) {
    return errResult("invalid_args", "Verifica prima il modello e la bozza: servono tutte le revisioni e le impronte originali. Modelli non supportati vanno completati nell’app.");
  }
  try {
    // One DB transaction: actor, company feature, exact model, source hash,
    // computo, project and unique retry are verified together, never TS inserts.
    const { data, error } = await ctx.supabase.rpc("whatsapp_prepare_edile_quote", {
      p_company_id: ctx.company_id, p_user_id: ctx.user_id, p_quote_id: args.quote_id,
      p_module: args.modulo, p_model_id: args.modello, p_model_revision: args.revisione_modello,
      p_quote_revision: args.revisione_preventivo, p_quote_fingerprint: args.impronta_preventivo,
      p_model_fingerprint: args.impronta_modello,
    });
    if (error || !data || data.success !== true || data.company_id !== ctx.company_id || data.quote_id !== args.quote_id ||
      data.module_id !== args.modulo || data.model_id !== args.modello || typeof data.progetto_id !== "string" ||
      !UUID.test(data.progetto_id) || !isRevision(data.project_revision) || typeof data.reused !== "boolean" ||
      data.pdf_generated !== false || data.dati_tecnici_da_completare !== true) {
      return errResult("progetto_non_confermato", "Il progetto non è confermato. Verifica nell’app prima di riprovare: il modello o le voci possono essere cambiati, oppure la funzione non è ancora attiva. Nessun PDF dichiarato pronto.");
    }
    const path = edileProjectPath(args.modulo, data.progetto_id);
    const base = (Deno.env.get("APP_URL") ?? "https://app.ediliziaincloud.com").replace(/\/$/, "");
    return okResult({ ...data, app_path: path, link: `${base}${path}`, link_inviato: false, customer_sent: false },
      `Bozza ${args.modulo}/${args.modello} ${data.reused ? "già salvata" : "salvata"} nel preventivatore dedicato, con modello aziendale congelato. Completa e verifica dati tecnici, condizioni e PDF nell’app: ${base}${path}. Nessun documento inviato.`);
  } catch {
    return errResult("project_outcome_unknown", "Esito della preparazione non verificabile. Controlla il preventivatore nell’app prima di riprovare, per evitare doppioni. Nessun PDF dichiarato pronto.");
  }
}
