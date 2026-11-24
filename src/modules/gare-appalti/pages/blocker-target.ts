import type { Participation, Tender, Workspace } from '../types';

export interface BlockerTarget { label: string; tab?: string; modal?: string; url?: string; area: string }
export function blockerTarget(message: string, p: Participation, tender: Tender, data: Workspace, canEdit: boolean): BlockerTarget {
  const base = `/azienda/gare/partecipazioni/${p.id}`;
  if (/nuovo avviso|fonti o archivio aggiornati/i.test(message)) return { label: 'Apri aggiornamento', area: 'Fonti', url: `${base}?tab=panoramica&fase_lavoro=valuta` };
  const requirements = data.requirements.filter(r => r.participation_id === p.id && message.endsWith(r.description));
  if (/requisit/i.test(message) && requirements.length === 1) return { label: 'Apri requisito', area: 'Requisiti', url: `${base}?tab=requisiti&requisito=${encodeURIComponent(requirements[0].id)}` };
  const files = data.documents.filter(d => d.participation_id === p.id && !d.archived && !data.documents.some(n => n.previous_id === d.id) && message.endsWith(d.name));
  if (/document|bozza/i.test(message) && files.length === 1) return { label: 'Apri documento', area: 'Documenti', url: `${base}?tab=documenti&documenti_vista=preparazione&revisiona=${encodeURIComponent(files[0].id)}` };
  if (/comunicazione/i.test(message)) return { label: 'Apri richiesta', area: 'Comunicazioni', url: `${base}/prepara?vista=comunicazioni` };
  if (/decisione/i.test(message)) return canEdit ? { label: 'Conferma decisione', area: 'Decisione', modal: 'decision' } : { label: 'Consulta requisiti', area: 'Decisione', tab: 'requisiti' };
  if (/selezionare.*lott|lotti.*selezion/i.test(message)) return canEdit ? { label: 'Scegli lotti', area: 'Lotti', modal: 'lots' } : { label: 'Consulta lotti', area: 'Lotti', tab: 'panoramica' };
  if (/data e ora|termine.*scadut/i.test(message)) return { label: 'Verifica termine', area: 'Scadenza', ...(canEdit ? { url: `/azienda/gare/procedure/${tender.id}/modifica` } : { tab: 'panoramica' }) };
  const criteria = data.technicalCriteria.filter(c => c.participation_id === p.id && message.endsWith(`${c.code} ${c.title}`));
  if (/criteri|critero|tecnic/i.test(message) && criteria.length === 1) return { label: 'Apri criterio', area: 'Offerta', url: `${base}?tab=offerta&busta=tecnica&criterio=${encodeURIComponent(criteria[0].id)}` };
  if (/criteri|critero|tecnic/i.test(message)) return { label: 'Apri offerta tecnica', area: 'Offerta', tab: 'offerta:tecnica' };
  if (/requisit|evidenz|prova/i.test(message)) return { label: 'Apri requisiti', area: 'Requisiti', tab: 'requisiti' };
  if (/attivit/i.test(message)) return { label: 'Apri attività', area: 'Attività', tab: 'attivita' };
  if (/checklist/i.test(message)) return { label: 'Apri checklist', area: 'Documenti', tab: 'documenti:checklist' };
  if (/soggett|firmatari/i.test(message)) return { label: 'Apri fascicoli', area: 'Operatori', url: '/azienda/gare?sezione=fascicolo' };
  if (/document|bozza/i.test(message)) return { label: 'Apri documenti', area: 'Documenti', tab: 'documenti:preparazione' };
  return { label: 'Apri percorso', area: 'Piano', url: `${base}/prepara` };
}
