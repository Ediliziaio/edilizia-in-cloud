import { activeTenderDocuments } from '../tender-ux';
import type { GareDocument, PreparationRun } from '../types';

export function preparationSources(documents: GareDocument[], tenderId: string) {
 return activeTenderDocuments(documents.filter(doc => doc.tender_id === tenderId && doc.category === 'fonte'));
}

export function preparationSourceChanges(saved: PreparationRun['snapshot']['sources'], current: GareDocument[]) {
 const seen = new Map(saved.map(source => [source.id, source.sha256]));
 const latest = new Map(current.map(source => [source.id, source.sha256]));
 return {
  added: current.filter(source => seen.get(source.id) !== source.sha256),
  removed: saved.filter(source => latest.get(source.id) !== source.sha256),
 };
}
