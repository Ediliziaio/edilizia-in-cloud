import type { GareDocument } from '../types';
import type { ReviewEntry } from './types';

export type ReviewFilter = 'tutti' | 'aperti' | 'inviati' | 'approvati';
export interface ReviewOperator { key: string; name: string; taxId: string; kind: string }
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it');
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};

export function reviewOperator(doc: GareDocument): ReviewOperator {
  const snapshot = record(doc.generation_snapshot?.subject_snapshot);
  const identity = record(doc.generation_snapshot?.identity);
  const name = text(snapshot.name) || text(identity.name);
  const taxId = text(snapshot.tax_id) || text(identity.tax_id);
  const id = text(snapshot.id);
  return { key: id ? `subject:${id}` : taxId ? `tax:${normalize(taxId)}` : name ? `name:${normalize(name)}` : 'participation', name: name || 'Documenti della partecipazione', taxId, kind: text(snapshot.kind) };
}
export function reviewTitle(doc: GareDocument) {
  if (/\.xml$/i.test(doc.name) && (doc.generation_snapshot?.dgue_case_id || doc.generation_snapshot?.answers)) return 'DGUE · Response XML';
  return doc.name.replace(/^BOZZA[ _-]*(?:compilata[ _-]*)?/i, '').replace(/^LAB[ _-]+/i, '').replace(/\.[a-z0-9]{1,6}$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim() || doc.name;
}
export function reviewRows(docs: GareDocument[], entries: ReviewEntry[], search: string, filter: ReviewFilter) {
  const query = normalize(search.trim());
  const checks = new Map(entries.map(entry => [entry.document_id, entry]));
  return docs.filter(doc => {
    const operator = reviewOperator(doc), check = checks.get(doc.id);
    const matches = !query || normalize(`${doc.name} ${reviewTitle(doc)} ${operator.name} ${operator.taxId}`).includes(query);
    return matches && (filter === 'tutti' || filter === 'inviati' && !!check?.handoff_current || filter === 'approvati' && doc.status === 'approvato' || filter === 'aperti' && (!check?.latest_current || !!check.latest?.report.blockers.length));
  });
}
export function reviewGroups(docs: GareDocument[]) {
  const groups = new Map<string, { operator: ReviewOperator; documents: GareDocument[] }>();
  for (const doc of docs) {
    const operator = reviewOperator(doc), existing = groups.get(operator.key);
    if (existing) existing.documents.push(doc); else groups.set(operator.key, { operator, documents: [doc] });
  }
  const order: Record<string, number> = { impresa: 0, partner: 1, consorzio: 2, consorziata: 3, ausiliaria: 4, subappaltatore: 5 };
  return [...groups.values()].sort((a, b) => (order[a.operator.kind] ?? 6) - (order[b.operator.kind] ?? 6) || a.operator.name.localeCompare(b.operator.name, 'it'));
}
export function reviewCheckLabel(entry?: ReviewEntry) {
  if (entry?.handoff_current) return { label: 'Controlli locali attuali', tone: 'success' as const };
  if (entry?.latest && !entry.latest_current) return { label: 'Da ricontrollare', tone: 'warning' as const };
  if (entry?.latest?.status === 'blocked') return { label: 'Punti da completare', tone: 'danger' as const };
  return { label: entry?.latest ? 'Controllato · da revisionare' : 'Controlli da eseguire', tone: 'neutral' as const };
}
