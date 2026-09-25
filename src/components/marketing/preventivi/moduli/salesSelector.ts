import { matchesSalesArea, type SalesArea, type SalesIntervention } from "@/lib/moduli-vendita/areas";
import type { ModuloVenditaView } from "@/lib/moduli-vendita";
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

export function matchesIntervention(area: SalesArea, item: SalesIntervention, query: string) {
  // Un risultato corrisponde all'intervento, non a tutti i suoi fratelli.
  return matchesSalesArea({ ...area, summary: "", interventions: [item] }, query);
}

export function hasAreaAccess(view?: ModuloVenditaView) {
  return !!view && !view.isError && !view.isLoading && view.stato === "attivo";
}
