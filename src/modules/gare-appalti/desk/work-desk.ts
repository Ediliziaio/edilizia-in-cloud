import { activeTenderDocuments, requirementOpen, requestComplete, tenderParams } from '../tender-ux';
import { deadlineState } from '../operations';
import { blockerTarget, type BlockerTarget } from '../pages/blocker-target';
import { reviewOperator, reviewTitle } from '../review/review-list';
import type { ReviewEntry } from '../review/types';
import type { OfficePlan } from '../office/types';
import type { Participation, Tender, Workspace } from '../types';

export const deskPhases = [
 { id: 'valuta', label: 'Valuta', description: 'Originali, requisiti e decisione' },
 { id: 'prepara', label: 'Prepara', description: 'AI, moduli e tre buste' },
 { id: 'revisiona', label: 'Revisiona', description: 'Leggi, controlla e approva' },
 { id: 'presenta', label: 'Presenta', description: 'Pacchetto e ricevute' },
 { id: 'esito', label: 'Segui l’esito', description: 'Comunicazioni e conclusione' },
] as const;
export type DeskPhase = typeof deskPhases[number]['id'];
export interface DeskTarget extends Partial<BlockerTarget> { phase?: DeskPhase; view?: string; action?: 'ai-start' }
export interface DeskItem { id: string; title: string; detail: string; phase: DeskPhase; area: string; owner: string; due: string | null; blocking: boolean; priority: number; target: DeskTarget; reasons: string[] }
export function deskPhase(value: string | null, fallback: DeskPhase): DeskPhase { return deskPhases.some(p => p.id === value) ? value as DeskPhase : fallback; }
export function workDeskParams(current: URLSearchParams, phase?: DeskPhase, view?: string) {
 const next = tenderParams(current, { tab: 'panoramica', ...(phase ? { fase_lavoro: phase } : {}), ...(view ? { prepara_vista: view } : {}) });
 ['correggi_documento', 'campo', 'revisiona', 'request', 'caso', 'domanda'].forEach(key => next.delete(key));
 return next;
}
const closed = (p: Participation) => ['esito', 'ritirata', 'non_partecipare'].includes(p.stage);
const areaPhase = (area: string): DeskPhase => /Decisione|Requisiti|Lotti|Scadenza|Fonti/.test(area) ? 'valuta' : /Documenti|Operatori|Offerta|Piano|Attività/.test(area) ? 'prepara' : /Comunicazioni/.test(area) ? 'esito' : 'revisiona';

/** A live work list, independent from the manually registered participation stage. */
export function buildWorkDesk(data: Workspace, p: Participation, tender: Tender, options: { canEdit: boolean; canApprove: boolean; blockers?: string[]; plan?: OfficePlan; reviews?: ReviewEntry[]; now?: Date }) {
 const { canEdit, canApprove, plan } = options;
 const base = `/azienda/gare/partecipazioni/${p.id}`, now = options.now || new Date();
 const documents = activeTenderDocuments(data.documents.filter(d => d.tender_id === tender.id && (d.category === 'fonte' || d.participation_id === p.id)));
 const sources = documents.filter(d => d.category === 'fonte');
 const output = documents.filter(d => d.participation_id === p.id && !['fonte', 'ricevuta'].includes(d.category) && !(/\.json$/i.test(d.name) && d.generation_snapshot?.answers));
 const checks = new Map((options.reviews || []).map(r => [r.document_id, r]));
 const selectedOutput = data.journeys?.find(j => j.participation_id === p.id)?.selected_document_ids || [];
 const requirements = data.requirements.filter(r => r.participation_id === p.id);
 const requests = data.documentRequests.filter(r => r.participation_id === p.id);
 const submitted = p.stage === 'presentata' || closed(p);
 const items = new Map<string, DeskItem>();
 const add = (item: Omit<DeskItem, 'owner' | 'due' | 'reasons'> & Partial<Pick<DeskItem, 'owner' | 'due' | 'reasons'>>) => {
  const old = items.get(item.id);
  if (old) { old.reasons = [...new Set([...old.reasons, ...(item.reasons || []), item.detail].filter(Boolean))]; old.blocking ||= item.blocking; old.priority = Math.min(old.priority, item.priority); return; }
  items.set(item.id, { owner: p.responsible || 'Da assegnare', due: null, reasons: [], ...item });
 };
 const aiTarget: DeskTarget = { phase: 'prepara', view: 'ai', label: canEdit ? 'Analizza e prepara' : 'Consulta preparazione', ...(canEdit && !plan?.latest_run ? { action: 'ai-start' as const } : {}) };
 const aiActive = !!plan?.latest_run && ['queued', 'running'].includes(plan.latest_run.status);
 if (!submitted) {
  const due = deadlineState(tender, now);
  if (due.unknown || due.expired) add({ id: 'deadline', title: due.expired ? 'Verifica il termine trascorso' : 'Conferma data e ora di presentazione', detail: 'Confronta l’ultimo avviso ufficiale.', phase: 'valuta', area: 'Scadenza', blocking: true, priority: 0, due: tender.deadline_date, target: canEdit ? { url: `/azienda/gare/procedure/${tender.id}/modifica`, label: 'Verifica termine' } : { tab: 'panoramica', label: 'Consulta termine' } });
  if (!sources.length) add({ id: 'sources', title: 'Acquisisci disciplinare e allegati', detail: 'Parti dagli originali della procedura.', phase: 'valuta', area: 'Originali', blocking: true, priority: 1, target: canEdit ? { modal: 'document:fonte', label: 'Carica originali' } : { tab: 'documenti:archivio', label: 'Consulta originali' } });
  else if (plan && plan.source_coverage.some(s => !s.complete)) add({ id: 'source-reading', title: aiActive ? 'Segui la lettura degli originali' : 'Completa l’analisi degli originali', detail: `${plan.source_coverage.filter(s => s.complete).length}/${plan.source_coverage.length} letture complete · confronto visivo da verificare`, phase: 'valuta', area: 'Originali', blocking: true, priority: 2, target: aiTarget });
  if (!requirements.length) add({ id: 'requirements', title: 'Definisci i requisiti da verificare', detail: 'Rivedi le proposte AI e collegale alle prove dell’impresa.', phase: 'valuta', area: 'Requisiti', blocking: true, priority: 3, target: sources.length ? { ...aiTarget, label: plan?.latest_run ? 'Rivedi requisiti proposti' : aiTarget.label } : { tab: 'requisiti', label: 'Apri requisiti' } });
  for (const r of requirements.filter(requirementOpen)) add({ id: `requirement:${r.id}`, title: r.description, detail: r.status === 'incompatibilita' ? 'Possibile incompatibilità da risolvere con la fonte e la prova.' : 'Confronta condizione, fonte e prova aziendale.', phase: 'valuta', area: 'Requisiti', blocking: r.mandatory, priority: r.status === 'incompatibilita' ? 2 : 4, target: { url: `${base}?tab=requisiti&requisito=${encodeURIComponent(r.id)}`, label: canEdit ? 'Verifica requisito' : 'Consulta requisito' } });
  if (p.decision === 'approfondisci') add({ id: 'decision', title: 'Conferma la decisione di partecipare', detail: 'Valuta prima originali, requisiti e prove disponibili.', phase: 'valuta', area: 'Decisione', blocking: true, priority: 8, target: canEdit ? { modal: 'decision', label: 'Registra decisione' } : { tab: 'requisiti', label: 'Consulta valutazione' } });
  for (const d of output) {
   const check = checks.get(d.id), operator = reviewOperator(d);
   const required = requests.some(r => r.mandatory && r.fulfilled_by === d.id) || (selectedOutput.length > 0 ? selectedOutput.includes(d.id) : d.mandatory);
   if (d.status === 'approvato' && !d.unresolved_fields && (!d.signature_required || d.signature_declared)) continue;
   const approval = !!check?.handoff_current && !d.unresolved_fields && d.status !== 'approvato';
   const signatures = d.status === 'approvato' && d.signature_required && !d.signature_declared;
   add({ id: `document:${d.id}`, title: reviewTitle(d), detail: `${operator.name} · ${signatures ? 'Firma richiesta da registrare e verificare' : d.unresolved_fields ? d.generation_snapshot?.dgue_case_id && d.unresolved_fields===1 ? 'Profilo DGUE del portale da verificare' : `${d.unresolved_fields} ${d.unresolved_fields===1?'punto aperto':'punti aperti'}` : approval ? 'Consegnato al revisore · approvazione ancora da registrare' : 'Apri il documento e confronta fonti e controlli'}`, phase: 'revisiona', area: 'Documenti', blocking: required, priority: d.unresolved_fields ? 6 : 9, target: approval && canApprove || signatures ? { url: `${base}?tab=offerta&busta=${d.category}&documento=${d.id}`, label: approval ? 'Rivedi e approva' : 'Verifica firma richiesta' } : { url: `${base}?tab=documenti&documenti_vista=preparazione&revisiona=${d.id}`, label: 'Apri revisione' } });
  }
  for (const r of requests.filter(r => !requestComplete(r, documents))) {
   const linked = output.find(d => d.id === r.fulfilled_by);
   add({ id: linked && items.has(`document:${linked.id}`) ? `document:${linked.id}` : `request:${r.id}`, title: r.title, detail: `Richiesta: ${r.title} · ${r.category}`, phase: 'prepara', area: 'Documenti', blocking: r.mandatory, priority: 6, owner: r.responsible || p.responsible || 'Da assegnare', due: r.due_date || null, target: { tab: 'documenti:checklist', label: 'Completa richiesta' }, reasons: [`Richiesta della gara: ${r.title}`] });
  }
  for (const c of data.technicalCriteria.filter(c => c.participation_id === p.id && (!c.reviewed_by || c.status !== 'approvato'))) add({ id: `criterion:${c.id}`, title: `${c.code} · ${c.title}`, detail: 'Proposta tecnica, prove e impegni da revisionare.', phase: 'prepara', area: 'Offerta', blocking: c.mandatory, priority: 7, target: { url: `${base}?tab=offerta&busta=tecnica&criterio=${c.id}`, label: 'Apri criterio' } });
  for (const task of data.tasks.filter(t => t.participation_id === p.id && !t.completed)) add({ id: `task:${task.id}`, title: task.title, detail: task.kind, phase: 'prepara', area: 'Attività', blocking: task.mandatory, priority: task.due_date && task.due_date <= now.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' }) ? 1 : 8, owner: task.responsible || 'Da assegnare', due: task.due_date, target: { tab: 'attivita', label: 'Gestisci attività' } });
  for (const [index, message] of (options.blockers || []).entries()) {
   const target = blockerTarget(message, p, tender, data, canEdit);
   let id = `control:${index}`;
   if (target.modal === 'decision' || /decisione di partecipare/i.test(message)) id = 'decision';
   else if (/registrare.*requisit/i.test(message)) id = 'requirements';
   else if (/data e ora|termine.*scadut/i.test(message)) id = 'deadline';
   else if (target.url) {
    const u = new URL(target.url, 'http://localhost'), q = u.searchParams;
    if (q.has('requisito')) id = `requirement:${q.get('requisito')}`;
    else if (q.has('revisiona')) id = `document:${q.get('revisiona')}`;
    else if (q.has('criterio')) id = `criterion:${q.get('criterio')}`;
   }
   add({ id, title: message, detail: message, phase: areaPhase(target.area), area: target.area, priority: 10, blocking: true, target, reasons: [message] });
  }
 }
 const submissions = data.submissions.filter(s => s.participation_id === p.id);
 const missingReceipts = submissions.filter(s => !s.receipt_id);
 for (const s of missingReceipts) add({ id: `receipt:${s.id}`, title: 'Collega la ricevuta della presentazione', detail: `Protocollo ${s.protocol || 'da registrare'} · controlla l’esito effettivo sul portale`, phase: 'presenta', area: 'Ricevute', blocking: false, priority: 1, target: { phase: 'presenta', label: 'Apri presentazione' } });
 for (const c of (data.communications || []).filter(c => c.participation_id === p.id && c.status !== 'chiusa')) add({ id: `communication:${c.id}`, title: c.title, detail: c.status === 'in_attesa' ? 'In attesa di risposta o terzi' : 'Comunicazione da gestire', phase: 'esito', area: 'Comunicazioni', blocking: c.blocking, priority: c.blocking ? 0 : 8, owner: c.responsible || p.responsible || 'Da assegnare', due: c.due_date, target: { phase: 'esito', label: 'Gestisci comunicazione' } });
 const list = [...items.values()].sort((a, b) => a.priority - b.priority || (a.due || '9999').localeCompare(b.due || '9999') || a.id.localeCompare(b.id));
 const next = list.find(i => i.blocking) || (submitted ? list[0] : undefined);
 const recommended: DeskPhase = closed(p) ? 'esito' : p.stage === 'presentata' ? missingReceipts.length ? 'presenta' : 'esito' : next?.phase || 'presenta';
 return { items: list, next, recommended, sources, output, requirements, requests, sourceRead: plan?.source_coverage.filter(s => s.complete).length, handed: options.reviews ? output.filter(d => checks.get(d.id)?.handoff_current).length : undefined, approved: output.filter(d => d.status === 'approvato').length, signaturesDeclared: output.filter(d => d.signature_required && d.signature_declared).length, submissions, missingReceipts, aiActive, checksKnown: options.blockers !== undefined, closed: closed(p) };
}
