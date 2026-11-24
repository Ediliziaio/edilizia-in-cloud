import { activeTenderDocuments } from '../tender-ux';
import { reviewTitle } from '../review/review-list';
import type { GareDocument, Participation, Tender, Workspace } from '../types';

export interface SourceImpact {
 previous: GareDocument;
 replacement?: GareDocument;
 items: { title: string; area: string; to: string }[];
}

function savedSourceIds(doc: GareDocument) {
 const snapshot = doc.generation_snapshot;
 if (!snapshot) return [];
 const ids = [snapshot.source_id];
 for (const key of ['sources', 'form_sources']) {
  const entries = snapshot[key];
  if (!Array.isArray(entries)) continue;
  for (const entry of entries) {
   if (entry && typeof entry === 'object') ids.push(entry.document_id || entry.citation?.document_id || entry.id);
  }
 }
 return ids.filter((id): id is string => typeof id === 'string');
}

export function sourceImpact(data: Workspace, tender: Tender, p?: Participation) {
 const sources = data.documents.filter(d => d.tender_id === tender.id && d.category === 'fonte');
 const currentSources = activeTenderDocuments(sources);
 const activeIds = new Set(currentSources.map(d => d.id));
 const byId = new Map(sources.map(source => [source.id, source]));
 const impacts = new Map<string, SourceImpact>();

 for (const replacement of currentSources) {
  let previous = replacement.previous_id;
  const seen = new Set<string>();
  while (previous && !seen.has(previous)) {
   seen.add(previous);
   const old = byId.get(previous);
   if (!old) break;
   impacts.set(old.id, { previous: old, replacement, items: [] });
   previous = old.previous_id;
  }
 }
 if (p) {
  const base = `/azienda/gare/partecipazioni/${p.id}`;
  const add = (sourceId: string | null, item: SourceImpact['items'][number]) => {
   if (!sourceId || activeIds.has(sourceId)) return;
   const old = byId.get(sourceId);
   if (!old) return;
   const impact = impacts.get(sourceId) || { previous: old, items: [] };
   if (!impact.items.some(existing => existing.to === item.to && existing.area === item.area && existing.title === item.title)) impact.items.push(item);
   impacts.set(sourceId, impact);
  };
  for (const r of data.requirements.filter(r => r.participation_id === p.id)) {
   add(r.source_document_id, { title: r.description, area: 'Requisito', to: `${base}?tab=requisiti&requisito=${r.id}` });
  }
  for (const r of data.documentRequests.filter(r => r.participation_id === p.id)) {
   add(r.source_document_id, { title: r.title, area: 'Richiesta documentale', to: `${base}?tab=documenti&documenti_vista=checklist` });
  }
  for (const c of data.technicalCriteria.filter(c => c.participation_id === p.id)) {
   add(c.source_document_id, { title: `${c.code} · ${c.title}`, area: 'Criterio tecnico', to: `${base}?tab=offerta&busta=tecnica&criterio=${c.id}` });
  }
  const files = activeTenderDocuments(data.documents.filter(d => d.participation_id === p.id && d.category !== 'fonte' && d.category !== 'ricevuta'));
  for (const doc of files) for (const id of savedSourceIds(doc)) {
   add(id, { title: `${reviewTitle(doc)} · v${doc.version}`, area: 'Documento', to: `${base}?tab=documenti&documenti_vista=preparazione&revisiona=${doc.id}` });
  }
  for (const draft of data.drafts.filter(d => d.participation_id === p.id)) for (const source of draft.source_snapshot || []) {
   add(source.id, { title: draft.title, area: 'Bozza AI', to: `${base}/documenti/${draft.id}` });
  }
 }
 return [...impacts.values()].filter(impact => impact.items.length || impact.previous.id === impact.replacement?.previous_id);
}
