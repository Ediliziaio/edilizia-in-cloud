import { SALES_AREAS, type SalesArea, type SalesIntervention } from "./areas";
import { MODULI_VENDITA } from "./config";
import { isSrQuoteModelId } from "@/lib/serramenti/quoteModel";

/** One operational registry. A PDF editor is never a quote-creation destination. */
export function quoteBuilder(area: SalesArea, item: SalesIntervention) {
  const registered = SALES_AREAS.find(a => a.id === area.id);
  if (!registered?.interventions.some(i => i.id === item.id)) return null;
  const engine = MODULI_VENDITA.find(m => m.slug === registered.sourceModule);
  if (!engine || engine.availability !== "available") return null;
  const connected = registered.sourceModule === "tetti" ||
    (registered.sourceModule === "serramenti" && isSrQuoteModelId(item.id));
  return { areaId: registered.id, modelId: item.id, engine: registered.sourceModule,
    path: `${engine.href}/nuovo`, connected };
}
