import { SALES_AREAS, matchesSalesArea, type SalesArea, type SalesIntervention } from "@/lib/moduli-vendita/areas";
import type { ModuloVenditaView } from "@/lib/moduli-vendita";
import { MODULES_SETTINGS_HREF } from "@/lib/moduli-vendita/presentation";
import { quoteBuilder } from "@/lib/moduli-vendita/quoteBuilders";

// I link di creazione portano il contesto CRM, mai filtri o parametri dell'editor.
export function quoteCreationHref(path: string, params: URLSearchParams, model?: string) {
  const next = new URLSearchParams();
  if (model) next.set("modello", model);
  for (const key of ["contact_id", "opportunity_id"]) {
    const value = params.get(key);
    if (value) next.set(key, value);
  }
  return next.size ? `${path}?${next}` : path;
}

// Solo ingressi UI pilota; i contenuti restano nel registry aree.
export function pilotHref(area: SalesArea, item: SalesIntervention, params: URLSearchParams) {
  const builder = quoteBuilder(area, item);
  return builder?.connected ? quoteCreationHref(builder.path, params, builder.modelId) : null;
}

export function modelSettingsHref(area: SalesArea, item: SalesIntervention) {
  // ModuleTemplateLibrary risolve modulo tramite sourceModule e modello tramite
  // interventions. Non confondere area.id con lo slug della route impostazioni.
  const registered = SALES_AREAS.find(candidate => candidate.id === area.id);
  if (!registered || !registered.interventions.some(candidate => candidate.id === item.id)) return null;
  return `${MODULES_SETTINGS_HREF}&modulo=${registered.sourceModule}&modello=${item.id}&section=page_cover`;
}

export function matchesIntervention(area: SalesArea, item: SalesIntervention, query: string) {
  // Un risultato corrisponde all'intervento, non a tutti i suoi fratelli.
  return matchesSalesArea({ ...area, summary: "", interventions: [item] }, query);
}

export function hasAreaAccess(view?: ModuloVenditaView) {
  return !!view && !view.isError && !view.isLoading && view.stato === "attivo";
}
