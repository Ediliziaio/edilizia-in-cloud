import { sectionHref } from '../navigation';

type ReturnView = 'fascicolo' | 'moduli' | 'ufficio' | 'dgue';
const contextKeys = {
 fascicolo: ['operatore_gara'],
 moduli: ['correggi_documento', 'campo', 'operatore_moduli'],
 ufficio: ['correggi_documento', 'campo'],
 dgue: ['request', 'caso', 'domanda'],
} as const;

function carryContext(view: ReturnView, from: URLSearchParams, to: URLSearchParams) {
 for (const key of contextKeys[view]) {
  const value = from.get(key);
  if (value) to.set(key, value);
 }
}

export function dossierHref(participationId: string, view: ReturnView, context: URLSearchParams, subjectId?: string) {
 const params = new URLSearchParams({ fascicolo_vista: 'operatori', gara: participationId, riprendi: view });
 carryContext(view, context, params);
 if (subjectId) params.set('operatore', subjectId);
 return sectionHref('fascicolo', params);
}

export function dossierReturn(params: URLSearchParams, participationIds: ReadonlySet<string>) {
 const id = params.get('gara');
 const view = params.get('riprendi');
 if (!id || !participationIds.has(id) || (view !== 'fascicolo' && view !== 'moduli' && view !== 'ufficio' && view !== 'dgue')) return null;
 const context = new URLSearchParams(view === 'moduli' || view === 'fascicolo'
  ? { tab: 'panoramica', fase_lavoro: 'prepara', prepara_vista: view }
  : { tab: 'documenti', documenti_vista: view, ...(view === 'ufficio' ? { ufficio: 'moduli' } : {}) });
 carryContext(view, params, context);
 return {
  id, subjectId: params.get('operatore') || undefined,
  label: view === 'dgue' ? 'Torna al DGUE' : view === 'fascicolo' ? 'Torna al fascicolo della gara' : 'Torna ai moduli',
  href: `/azienda/gare/partecipazioni/${encodeURIComponent(id)}?${context}`,
 };
}
