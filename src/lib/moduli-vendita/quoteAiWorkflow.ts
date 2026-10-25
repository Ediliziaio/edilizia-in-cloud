import { SALES_AREAS, type SalesArea, type SalesIntervention } from './areas';
import { quoteBuilder } from './quoteBuilders';

/** Capability is explicit for every registered intervention. Never guess another editor. */
export function quoteAiWorkflow(area: SalesArea, intervention: SalesIntervention) {
  const registered = SALES_AREAS.find(item => item.id === area.id && item.sourceModule === area.sourceModule);
  const entry = registered?.interventions.find(item => item.id === intervention.id);
  if (!registered || !entry) return { kind: 'unavailable' as const, engine: null, modelId: null };
  const builder = quoteBuilder(registered, entry);
  if (!builder?.connected) return { kind: 'unavailable' as const, engine: registered.sourceModule, modelId: entry.id };
  if (['bagni', 'climatizzazione', 'elettrico', 'termoidraulico', 'pavimenti', 'piscine', 'ristrutturazione', 'tetti'].includes(builder.engine)) return { kind: 'wizard-ai' as const, engine: builder.engine, modelId: builder.modelId };
  return { kind: ['serramenti', 'fotovoltaico'].includes(builder.engine) ? 'native-ai' as const : 'manual-only' as const, engine: builder.engine, modelId: builder.modelId };
}
