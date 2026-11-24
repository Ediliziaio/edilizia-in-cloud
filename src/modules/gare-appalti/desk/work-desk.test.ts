import { describe, expect, it } from 'vitest';
import { buildWorkDesk, deskPhase, workDeskParams } from './work-desk';
import type { Participation, Tender, Workspace, GareDocument } from '../types';
import type { OfficePlan } from '../office/types';
import type { ReviewEntry } from '../review/types';
const now = new Date('2026-11-17T10:00:00Z');
const p = { id: 'p', tender_id: 't', stage: 'in_valutazione', decision: 'approfondisci', responsible: 'Anna' } as Participation;
const t = { id: 't', deadline_date: '2026-12-20', deadline_time: '12:00:00', timezone: 'Europe/Rome' } as Tender;
const source = { id: 'source', tender_id: 't', category: 'fonte', name: 'Disciplinare.pdf' } as GareDocument;
const workspace = (): Workspace => ({ tenders: [t], participations: [p], documents: [source], requirements: [], documentRequests: [], tasks: [], technicalCriteria: [], exports: [], submissions: [], participationLots: [], lots: [], evidence: [], drafts: [], audit: [], evidenceFiles: [], economicScenarios: [], savedSearches: [], preferences: [] });
const plan = { source_coverage: [{ id: 'source', complete: false }], latest_run: null } as unknown as OfficePlan;
const opts = { canEdit: true, canApprove: true, blockers: [] as string[], plan, now };
const doc = (id: string, name: string, actor: string) => ({ id, tender_id: 't', participation_id: 'p', name, category: 'amministrativa', status: 'bozza', mandatory: true, generation_snapshot: { subject_snapshot: { id: actor, name: actor } } }) as unknown as GareDocument;
describe('percorso unico della gara', () => {
 it('propone prima originali e analisi, poi la decisione e senza dichiarare completata una gara vuota', () => {
  const data = workspace(); data.documents = [];
  const desk = buildWorkDesk(data, p, t, opts);
  expect(desk.next?.id).toBe('sources'); expect(desk.approved).toBe(0); expect(desk.handed).toBeUndefined();
  expect(buildWorkDesk(workspace(), p, t, opts).next?.id).toBe('source-reading');
  expect(desk.items.some(i => i.id === 'decision')).toBe(true);
 });
 it('mantiene aperti i problemi anche se lo stato registrato è avanzato', () => {
  const desk = buildWorkDesk(workspace(), { ...p, stage: 'pronta' }, t, { ...opts, blockers: ['Verifica sconosciuta della gara'] });
  expect(desk.recommended).toBe('valuta'); expect(desk.items.some(i => i.title === 'Verifica sconosciuta della gara')).toBe(true);
 });
 it('raggruppa i controlli dello stesso requisito conservando le richieste del backend', () => {
  const data = workspace(); data.requirements = [{ id: 'r', participation_id: 'p', description: 'SOA OG1', status: 'da_verificare', mandatory: true }] as Workspace['requirements'];
  const desk = buildWorkDesk(data, p, t, { ...opts, blockers: ['Requisito da risolvere: SOA OG1'] });
  const item = desk.items.find(i => i.id === 'requirement:r')!;
  expect(desk.items.filter(i => i.id === 'requirement:r')).toHaveLength(1); expect(item.reasons).toContain('Requisito da risolvere: SOA OG1'); expect(item.target.url).toContain('requisito=r');
 });
 it('mantiene distinti tre DGUE omonimi di tre operatori e collega richieste al file esatto', () => {
  const data = workspace(); data.documents.push(...['main', 'partner', 'aux'].map(id => ({ ...doc(id, 'BOZZA_DGUE_Response.xml', id), unresolved_fields: 1 })));
  data.documentRequests = [{ id: 'request', participation_id: 'p', title: 'DGUE ausiliaria', category: 'amministrativa', fulfilled_by: 'aux', mandatory: true }] as Workspace['documentRequests'];
  const desk = buildWorkDesk(data, p, t, opts), docs = desk.items.filter(i => i.id.startsWith('document:'));
  expect(docs).toHaveLength(3); expect(docs.find(i => i.id === 'document:aux')?.reasons).toContain('Richiesta della gara: DGUE ausiliaria'); expect(docs.find(i => i.id === 'document:main')?.target.url).toContain('revisiona=main');
 });
 it('non confonde consegna corrente e approvazione e non conta consegne superate', () => {
  const data = workspace(); data.documents.push(doc('a', 'A.docx', 'main'), { ...doc('b', 'B.docx', 'aux'), status: 'approvato' });
  const reviews = [{ document_id: 'a', handoff_current: false }, { document_id: 'b', handoff_current: true }] as ReviewEntry[];
  const desk = buildWorkDesk(data, p, t, { ...opts, reviews });
  expect(desk.handed).toBe(1); expect(desk.approved).toBe(1); expect(desk.items.some(i => i.id === 'document:a')).toBe(true);
 });
 it('non riapre la preparazione dopo una presentazione: propone ricevute e comunicazioni', () => {
  const data = workspace(); data.submissions = [{ id: 's', participation_id: 'p', receipt_id: null, protocol: '123' }] as Workspace['submissions'];
  const desk = buildWorkDesk(data, { ...p, stage: 'presentata' }, t, opts);
  expect(desk.items.map(i => i.id)).toEqual(['receipt:s']); expect(desk.recommended).toBe('presenta');
  expect(buildWorkDesk(data, { ...p, stage: 'esito' }, t, opts).recommended).toBe('esito');
 });
 it('conserva i vincoli di firma richiesta e i criteri tecnici realmente approvati', () => {
  const data = workspace(); data.documents.push({ ...doc('a', 'A.docx', 'main'), status: 'approvato', signature_required: true, signature_declared: false });
  data.technicalCriteria = [{ id: 'c', participation_id: 'p', status: 'approvato', reviewed_by: 'reviewer', mandatory: true }] as Workspace['technicalCriteria'];
  const desk = buildWorkDesk(data, p, t, opts);
  expect(desk.items.find(i => i.id === 'document:a')?.target.url).toContain('documento=a'); expect(desk.items.some(i => i.id === 'criterion:c')).toBe(false);
 });
 it('non considera noto un controllo non ancora caricato e impedisce azioni di modifica in sola lettura', () => {
  const data = workspace(); data.documents = [];
  const desk = buildWorkDesk(data, p, t, { canEdit: false, canApprove: false, now });
  expect(desk.checksKnown).toBe(false); expect(desk.items.every(i => !i.target.modal && !i.target.action)).toBe(true);
 });
 it('mantiene ogni controllo ambiguo e sconosciuto senza associarlo arbitrariamente a un operatore', () => {
  const data = workspace(); data.documents.push(doc('a', 'DGUE.xml', 'main'), doc('b', 'DGUE.xml', 'partner'));
  const desk = buildWorkDesk(data, p, t, { ...opts, blockers: ['Documento da completare: DGUE.xml', 'Controllo particolare A', 'Controllo particolare B'] });
  expect(desk.items.filter(i => i.id.startsWith('control:'))).toHaveLength(3);
  expect(desk.items.find(i => i.id === 'control:0')?.target.url).toBeUndefined();
 });
 it('seleziona una fase valida senza scrivere lo stato della partecipazione', () => {
  const data = workspace(), before = JSON.stringify({ data, p }); buildWorkDesk(data, p, t, opts);
  expect(JSON.stringify({ data, p })).toBe(before); expect(deskPhase('non-esiste', 'valuta')).toBe('valuta'); expect(deskPhase('esito', 'valuta')).toBe('esito');
 });
});

it('ritorna al percorso mantenendo filtri e fase, senza riaprire una correzione precedente',()=>{
 const params=new URLSearchParams({tab:'documenti',fase_lavoro:'revisiona',documenti_q:'Modulo B',correggi_documento:'old',revisiona:'doc',request:'source',caso:'case',campo:'pec',domanda:'q'});
 const next=workDeskParams(params);
 expect(next.get('tab')).toBe('panoramica');expect(next.get('fase_lavoro')).toBe('revisiona');expect(next.get('documenti_q')).toBe('Modulo B');expect(next.has('correggi_documento')).toBe(false);expect(next.has('caso')).toBe(false);expect(params.get('correggi_documento')).toBe('old');
 expect(workDeskParams(params,'prepara','moduli').get('prepara_vista')).toBe('moduli');
});

it('le bozze alternative restano consultabili senza bloccare il percorso dopo la scelta dei documenti definitivi',()=>{
 const data=workspace(); data.requirements=[{id:'r',participation_id:'p',status:'compatibile',reviewed_by:'reviewer'}] as Workspace['requirements'];
 data.documents.push({...doc('final','A.docx','main'),status:'approvato'},doc('alternative','B.docx','main'));
 data.journeys=[{participation_id:'p',selected_document_ids:['final']}] as Workspace['journeys'];
 const desk=buildWorkDesk(data,{...p,decision:'partecipa'},t,{...opts,plan:{...plan,source_coverage:[{id:'source',complete:true}]} as OfficePlan});
 expect(desk.items.find(i=>i.id==='document:alternative')?.blocking).toBe(false);expect(desk.next).toBeUndefined();expect(desk.recommended).toBe('presenta');
});
