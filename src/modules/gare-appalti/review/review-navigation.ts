import type { GareDocument } from '../types';

export function correctionUrl(doc: GareDocument, field = '') {
  if (!doc.participation_id) return null;
  if (doc.ai_draft_id) return `/azienda/gare/partecipazioni/${doc.participation_id}/documenti/${doc.ai_draft_id}`;
  const snapshot = doc.generation_snapshot || {};
  const params = new URLSearchParams({ tab: 'documenti' });
  if (snapshot.dgue_case_id || snapshot.answers) {
    params.set('documenti_vista', 'dgue');
    if (typeof snapshot.source_id === 'string') params.set('request', snapshot.source_id);
    if (typeof snapshot.dgue_case_id === 'string') params.set('caso', snapshot.dgue_case_id);
    if (field) params.set('domanda', field);
  } else if (doc.template_contract_id) {
    params.set('documenti_vista', (snapshot.subject_snapshot as { id?: string } | undefined)?.id ? 'ufficio' : 'modelli');
    params.set('ufficio', 'moduli');
    params.set('correggi_documento', doc.id);
    if (field) params.set('campo', field);
  } else {
    params.set('documenti_vista', 'archivio');
    params.set('documento', doc.id);
  }
  return `/azienda/gare/partecipazioni/${doc.participation_id}?${params}`;
}
