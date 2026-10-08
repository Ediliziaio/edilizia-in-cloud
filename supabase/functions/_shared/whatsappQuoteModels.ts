import { isEdileDraftModel } from "./edileQuoteDraft.ts";
/** Published company models, never browser drafts or another company's defaults. */
export const MODEL_ARCHIVES: Record<string, { archive: string; feature: string }> = {
  bagni: { archive: "bgn", feature: "modulo_bagni_attivo" },
  tetti: { archive: "tetti", feature: "modulo_tetti_attivo" },
  serramenti: { archive: "serramenti", feature: "modulo_serramenti_attivo" },
  ristrutturazione: { archive: "rst", feature: "modulo_ristrutturazione_attivo" },
  climatizzazione: { archive: "clm", feature: "modulo_climatizzazione_attivo" },
  elettrico: { archive: "elt", feature: "modulo_elettrico_attivo" },
  termoidraulico: { archive: "idr", feature: "modulo_termoidraulico_attivo" },
  pavimenti: { archive: "pav", feature: "modulo_pavimenti_attivo" },
  piscine: { archive: "psc", feature: "modulo_piscine_attivo" },
  fotovoltaico: { archive: "fv", feature: "modulo_fotovoltaico_attivo" },
};
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export function publishedModel(value: unknown, companyId: string, modelId: string): {
  revision: string; template: Record<string, unknown>;
} {
  if (!object(value) || value.version !== 1 || value.companyId !== companyId || value.moduleId !== modelId ||
    typeof value.savedAt !== "string" || !Number.isFinite(Date.parse(value.savedAt)) ||
    !object(value.template) || value.template.company_id !== companyId ||
    !object(value.template.pdf_blocchi) || value.template.pdf_blocchi.modulo_intervento !== modelId) {
    throw new Error("Il modello pubblicato è incompleto, non valido o appartiene a un’altra azienda. Nessun modello generico usato.");
  }
  return { revision: value.savedAt, template: value.template };
}
export function modelArchiveKey(module: string, companyId: string, modelId: string): string {
  const spec = Object.hasOwn(MODEL_ARCHIVES, module) ? MODEL_ARCHIVES[module] : undefined;
  if (!spec || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(modelId)) throw new Error("Modulo o modello non valido.");
  if (module === "tetti" || module === "serramenti") return `eic:local-module-template:v1:${encodeURIComponent(companyId)}:${module}:${modelId}`;
  return `eic:full-${spec.archive}-module:v1:${encodeURIComponent(companyId)}:${modelId}`;
}

/** Capability is explicit: a published template is not a working generation path. */
export function modelWorkflowCapabilities(module: string, modelId: string) {
  if (!Object.hasOwn(MODEL_ARCHIVES, module)) throw new Error("Modulo non valido.");
  const automated = module === "bagni" && ["completo", "vasca-doccia", "doccia", "sanitari", "accessibilita", "rinnovo"].includes(modelId);
  const draftAvailable = isEdileDraftModel(module, modelId);
  let area = module === "ristrutturazione" ? "ristrutturazioni" : module === "termoidraulico" ? "termoidraulica" : module;
  if (module === "ristrutturazione") {
    if (["tinteggiatura-interna", "carta-da-parati", "cartongesso", "controsoffitti", "decorativi", "umidita", "acustica"].includes(modelId)) area = "pareti-soffitti";
    if (["pergola-bioclimatica", "pergola-telo", "tende-sole", "vetrate", "carport"].includes(modelId)) area = "pergole";
    if (["cappotto", "rifacimento", "balconi", "tinteggiatura", "interno", "riparazioni", "ventilata", "pietra", "pulizia"].includes(modelId)) area = "facciate";
  }
  if (module === "pavimenti" && ["giardino", "verde", "irrigazione", "recinzioni"].includes(modelId)) area = "giardini";
  return {
    workflow: automated ? "bathroom_reviewed_document" : draftAvailable ? "edile_reviewed_draft" : "app_required",
    project_creation_tool: automated ? "invia_preventivo_bagno" : draftAvailable ? "prepara_preventivo_modello" : null,
    pdf_generation_tool: automated ? "genera_pdf_modello_bagno" : null,
    self_send_tool: automated ? "invia_pdf_modello_bagno" : null,
    customer_send_available: false,
    app_path: `/azienda/marketing/preventivi?tab=moduli&area=${encodeURIComponent(area)}&modello=${encodeURIComponent(modelId)}`,
    constraints: automated
      ? ["Bozza e revisioni da confermare", "Computo convertibile senza perdita", "Immagini compatibili e verificabili", "PDF da controllare prima dell’invio", "Solo al numero dell’operatore"]
      : draftAvailable
        ? ["Bozza, voci, revisioni e impronte da confermare", "Solo computo compatibile senza perdita", "Dati tecnici e condizioni da completare nell’app", "PDF dedicato da verificare nell’app", "Nessun documento inviato"]
        : ["Creazione e PDF del modello da completare nell’app", "Nessuna sostituzione con un PDF classico"],
  };
}
