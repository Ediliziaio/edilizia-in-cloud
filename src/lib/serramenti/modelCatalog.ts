import type { TipologiaListino } from "@/lib/listino/lineeListino";
import type { SrQuoteModelId } from "./quoteModel";

// Keys refer to the canonical taxonomy, not to company-specific names or IDs.
// Sono i prodotti proposti per primi: «Tutto il listino dell'area» e la ricerca
// restano sempre aperti, e un preventivo «finestre» può avere anche porte o zanzariere.
const SUGGESTED_TYPES: Record<SrQuoteModelId, readonly string[]> = {
  finestre: ["Serramenti"],
  persiane: ["Persiane e scuri"],
  avvolgibili: ["Tapparelle", "Cassonetti", "Accessori"],
  zanzariere: ["Zanzariere"],
  "porte-ingresso": ["Porte blindate"],
  "porte-interne": ["Porte da interno"],
  combinato: ["Serramenti", "Persiane e scuri", "Zanzariere", "Tapparelle", "Cassonetti"],
};
export function suggestedModelTypes(types: TipologiaListino[], modelId?: SrQuoteModelId): TipologiaListino[] {
  if (!modelId) return [];
  const names = SUGGESTED_TYPES[modelId];
  return types.filter(t => t.attiva && t.collegamento !== "nessuno" && !!t.standard && names.includes(t.standard.nome))
    .sort((a, b) => names.indexOf(a.standard!.nome) - names.indexOf(b.standard!.nome));
}

export function modelCatalogTypes(types: TipologiaListino[], modelId: SrQuoteModelId | undefined, showAll: boolean): TipologiaListino[] {
  const suggested = suggestedModelTypes(types, modelId);
  return showAll || suggested.length === 0 ? types : suggested;
}
