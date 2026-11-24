import type { FormProposal } from '../dossier/FormAssistance';
import { missingValue } from '../dossier/placeholders.js';

export interface SharedQuestion { key: string; label: string; proposals: FormProposal[]; options?: string[] }
export interface ChosenValue { value: string; proposal?: FormProposal }
const identityFields = new Set(['ragione_sociale', 'partita_iva', 'codice_fiscale', 'pec', 'sede', 'rappresentante', 'cf_rappresentante', 'firmatario', 'referente', 'telefono', 'email', 'rea', 'camera_commercio']);
/** Explicit user action: only current subject facts, blank identity fields and one agreed value. */
export function reusableValues(questions: SharedQuestion[], values: Record<string, ChosenValue>, subject?: { id: string; revision: number; current?: boolean }) {
 if (!subject?.current) return [];
 return questions.flatMap(q => {
  if (!identityFields.has(q.key) || q.options?.length || values[q.key]?.value.trim()) return [];
  const candidates = q.proposals.filter(p => p.kind === 'fact' && p.fact_id === subject.id && p.revision === subject.revision && !missingValue(p.value));
  if (!candidates.length || new Set(candidates.map(p => p.value)).size !== 1) return [];
  return [{ key: q.key, label: q.label, proposal: candidates[0] }];
 });
}
