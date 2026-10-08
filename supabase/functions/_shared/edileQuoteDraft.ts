/** Core interventions verified against the app's schemas and model constraints.
 * Engineering inputs and PDFs remain app-reviewed; this is NOT a renderer.
 */
export const EDILE_DRAFT_MODULES = {
  climatizzazione: { prefix: "clm", models: { monosplit: "nuovo_impianto", multisplit: "nuovo_impianto", canalizzato: "nuovo_impianto", sostituzione: "sostituzione", manutenzione: "manutenzione_ordinaria", vmc: "nuovo_impianto" } },
  elettrico: { prefix: "ele", models: { completo: "nuovo_impianto", adeguamento: "adeguamento_norma", punti: "ampliamento", quadro: "adeguamento_norma", domotica: "domotica", videocitofonia: "ampliamento", ricarica: "ampliamento" } },
  termoidraulico: { prefix: "idr", models: { caldaia: "sostituzione_generatore", "pompa-calore": "sostituzione_generatore", ibrido: "sostituzione_generatore", radiante: "nuovo_impianto", terminali: "ampliamento", idrico: "rifacimento", "acqua-calda": "sostituzione_generatore", manutenzione: "manutenzione_straordinaria" } },
  pavimenti: { prefix: "pav", models: { sovrapposizione: "sovrapposizione", rifacimento: "rifacimento", resina: "resina_microcemento", parquet: "levigatura_lucidatura", pareti: "nuova_posa", esterni: "nuova_posa" } },
  piscine: { prefix: "pis", models: { nuova: "nuova_costruzione", ristrutturazione: "ristrutturazione", rivestimento: "ristrutturazione", impianti: "impianto_trattamento", accessori: "copertura", manutenzione: "manutenzione" } },
  ristrutturazione: { prefix: "rst", models: { completa: "ristrutturazione_completa", parziale: "ristrutturazione_parziale", commerciale: "ristrutturazione_completa", spazi: "ristrutturazione_parziale", computo: "altro" } },
} as const;
export type EdileDraftModule = keyof typeof EDILE_DRAFT_MODULES;
export const HASH = /^[a-f0-9]{64}$/;
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const isRevision = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
export function isEdileDraftModel(module: unknown, model: unknown): module is EdileDraftModule {
  return typeof module === "string" && Object.hasOwn(EDILE_DRAFT_MODULES, module) &&
    typeof model === "string" && Object.hasOwn(EDILE_DRAFT_MODULES[module as EdileDraftModule].models, model);
}
export function edileProjectPath(module: EdileDraftModule, projectId: string): string {
  if (!UUID.test(projectId) || !Object.hasOwn(EDILE_DRAFT_MODULES, module)) throw new Error("invalid_project_path");
  // The actual wizard routes use singular source module slugs, not sales-area IDs.
  // These wizards resume their own first incomplete step; they do not support
  // an external ?step=computo override. Avoid a misleading deep-link parameter.
  return `/azienda/${module}/${encodeURIComponent(projectId)}/modifica`;
}
export function validEdileReview(value: unknown, company: string, quote: string, module: string, model: string): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  return r.company_id === company && r.quote_id === quote && r.module_id === module && r.model_id === model &&
    isRevision(r.revisione_modello) && isRevision(r.revisione_preventivo) &&
    typeof r.impronta_preventivo === "string" && HASH.test(r.impronta_preventivo) &&
    typeof r.impronta_modello === "string" && HASH.test(r.impronta_modello) &&
    Array.isArray(r.voci_da_mostrare) && r.voci_da_mostrare.length >= 1 && r.voci_da_mostrare.length <= 200 &&
    r.voci_da_mostrare.every((item: unknown) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const i = item as Record<string, unknown>;
      const text = typeof i.description === "string" && i.description.trim() ? i.description : i.name;
      return i.company_id === company && i.quote_id === quote && typeof text === "string" && text.trim().length > 0 &&
        typeof i.quantity === "number" && Number.isFinite(i.quantity) && i.quantity > 0 &&
        typeof i.unit_price === "number" && Number.isFinite(i.unit_price) && i.unit_price >= 0 &&
        typeof i.vat_rate === "number" && Number.isFinite(i.vat_rate) && i.vat_rate >= 0 && i.vat_rate <= 100 &&
        (i.prezzo_acquisto == null || (typeof i.prezzo_acquisto === "number" && Number.isFinite(i.prezzo_acquisto) && i.prezzo_acquisto >= 0));
    }) &&
    typeof r.totale === "number" && Number.isFinite(r.totale) && r.totale >= 0 &&
    r.pdf_generato === false && r.dati_tecnici_da_completare === true;
}
