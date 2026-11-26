import type { Workspace } from '../types';

function words(text: string) {
 return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

export function watchedTenders(data: Workspace, params: URLSearchParams) {
 const query = words(params.get('q') || '');
 const territory = params.get('territorio');
 const kind = params.get('tipo');
 const labels = new Map<string, string>();
 if (query.length) for (const lot of data.lots || []) {
  labels.set(lot.tender_id, `${labels.get(lot.tender_id) || ''} ${lot.code} ${lot.title}`);
 }
 return data.tenders.filter(t =>
  (params.get('escluse') === '1' || data.preferences.find(p => p.tender_id === t.id)?.state !== 'not_relevant')
  && (params.get('salvate') !== '1' || data.preferences.find(p => p.tender_id === t.id)?.state === 'saved')
  && (!params.get('fonte') || t.source === params.get('fonte'))
  && (!params.get('importo_min') || Number(t.base_amount) >= Number(params.get('importo_min')))
  && (!params.get('importo_max') || Number(t.base_amount) <= Number(params.get('importo_max')))
  && (!params.get('entro') || !!t.deadline_date && t.deadline_date <= params.get('entro')!)
  && (!query.length || matchesTender(query, `${t.title} ${t.authority} ${t.official_id || ''} ${labels.get(t.id) || ''}`))
  && (!territory || t.territory === territory)
  && (!kind || t.kind === kind)
 ).sort((a,b) => (a.deadline_date || '9999').localeCompare(b.deadline_date || '9999'));
}

function matchesTender(query: string[], text: string) {
 const indexed = words(text);
 return query.every(term => indexed.some(word => word.includes(term)));
}

export function watchDifference(previous:string[],current:string[]) {
 return { added:current.filter(id=>!previous.includes(id)), removed:previous.filter(id=>!current.includes(id)) };
}
