import { useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, ChevronRight, Circle, FileText, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '../WorkspaceContext';
import { AIActivity } from '../ai/AIActivity';
import { Panel } from '../components';
import { LotDelivery } from './LotDelivery';
import { LotAssessment } from './LotAssessment';
import { OpenDocumentItems } from './OpenDocumentItems';
import { FoldPanel } from '../ui/FoldPanel';
import { SourceChanges } from '../pages/SourceChanges';
import { TenderOverview } from '../pages/TenderOverview';
import { PreparationPanel } from '../dossier/PreparationPanel';
import { TenderDossierGuide } from '../office/TenderDossierGuide';
import { OfficeForms } from '../office/OfficeForms';
import { ReviewDesk } from '../review/ReviewDesk';
import { RevisionPanel } from '../pages/RevisionPanel';
import { OfferWorkspace } from '../pages/OfferWorkspace';
import type { FileActions } from '../pages/TenderDocuments';
import type { ReviewEntry } from '../review/types';
import type { OfficePlan } from '../office/types';
import type { GareDocument, Participation, PreparationRun, Requirement, Tender } from '../types';
import { dateLabel, money } from '../domain';
import { tenderParams } from '../tender-ux';
import { buildWorkDesk, deskPhase, deskPhases, workDeskParams, type DeskItem, type DeskPhase, type DeskTarget } from './work-desk';
import { messaggioErrore } from "@/lib/messaggioErrore";

interface Props {
 participation: Participation; tender: Tender; documents: GareDocument[];
 blockers: { data?: string[]; isPending: boolean; isError: boolean }; busy: boolean;
 run: FileActions['run']; onVersion?: FileActions['onVersion']; onModal: (name: string) => void; onTab: (name: string) => void;
 onRequirement?: (r: Requirement) => void;
 onAI: (category: string) => void; documentList: (category?: string, onlyOffer?: boolean) => ReactNode;
}
export function TenderDesk({ participation: p, tender, documents, blockers, busy, run, onModal, onVersion, onTab, onAI, onRequirement, documentList }: Props) {
 const { api, data, canEdit, canApprove, refresh } = useWorkspace();
 const [params, setParams] = useSearchParams(), navigate = useNavigate();
 const [starting, setStarting] = useState(false), [error, setError] = useState('');
 const plan = useQuery({ queryKey: ['gare', api.companyId, 'office-plan', p.id], queryFn: () => api.local<OfficePlan>('office', 'plan', { participation_id: p.id }), refetchInterval: q => q.state.data?.latest_run && ['queued', 'running'].includes(q.state.data.latest_run.status) ? 2000 : 15000 });
 const reviews = useQuery({ queryKey: ['gare', api.companyId, 'review-desk', p.id], queryFn: () => api.local<ReviewEntry[]>('review', 'list', { participation_id: p.id }), retry: false });
 const desk = buildWorkDesk(data, p, tender, { canEdit, canApprove, blockers: blockers.data, plan: plan.data, reviews: reviews.data });
 const selectedPhase = deskPhase(params.get('fase_lavoro'), desk.recommended);
 const phase = selectedPhase === 'esito' ? 'presenta' : selectedPhase;
 const prepareView = params.get('prepara_vista') || (!desk.aiActive && plan.data?.models.length && plan.data.latest_run ? 'moduli' : 'ai');
 const showsPreparation = phase === 'prepara' && prepareView === 'ai';
 const latestRun = plan.data?.latest_run;
 const pending = blockers.isPending || plan.isPending;
 const hasErrors = blockers.isError || plan.isError;
 const phaseCount = (id: DeskPhase) => desk.items.filter(i => i.phase === id).length;
 const go = (id: DeskPhase, view?: string) => setParams(workDeskParams(params,id,view));
 async function execute(target: DeskTarget) {
  if (target.action === 'ai-start') {
   if (!canEdit || starting || pending) return;
   setStarting(true); setError('');
   try {
    await api.local<PreparationRun>('preparation', 'start', { participation_id: p.id, force: false });
    go('prepara', 'ai'); await refresh(); toast.success('Preparazione AI locale avviata');
   } catch (e) { setError(messaggioErrore(e)); }
   finally { setStarting(false); }
  } else if (target.modal) onModal(target.modal);
  else if (target.url) navigate(target.url);
  else if (target.phase) go(target.phase === 'esito' ? 'presenta' : target.phase, target.view);
  else if (target.tab) onTab(target.tab);
 }
 const nextTarget: DeskTarget = desk.next?.target || { phase: 'presenta', label: 'Apri checklist per lotto' };
 const nextTitle = pending ? 'Aggiorno il lavoro da completare…' : hasErrors ? 'Alcuni controlli non sono disponibili' : desk.next?.title || (desk.closed ? 'Consulta la conclusione della partecipazione' : p.stage === 'presentata' ? 'Segui comunicazioni ed esito' : 'Rivedi il fascicolo prima della presentazione');
 return <div className="ga-work-desk">
  <header className="ga-desk-title"><div><p className="ga-eyebrow">IL TUO UFFICIO GARE</p><h2 id="ga-operating-title">Continua questa gara</h2></div><button type="button" className="ga-text-action" onClick={() => go('prepara', 'fascicolo')}>Fascicolo per questa gara <ChevronRight size={14}/></button></header>
  <section className="ga-desk-next" aria-label="Prossima azione consigliata"><div><p>PROSSIMA AZIONE {desk.next && !pending && <span>· {deskPhases.find(s => s.id === desk.next!.phase)?.label}</span>}</p><h3>{nextTitle}</h3><small>{pending ? 'Dai dati e dai controlli salvati, senza modificare lo stato della gara.' : hasErrors ? 'Puoi consultare gli strumenti e riprovare il caricamento.' : desk.next ? `Responsabile: ${desk.next.owner}${desk.next.due ? ' · entro ' + dateLabel(desk.next.due) : ''}` : 'Il pacchetto esportato e la presentazione sul portale restano operazioni distinte.'}</small></div><Button disabled={pending || starting} onClick={() => hasErrors ? void Promise.all([plan.refetch(), refresh()]) : void execute(nextTarget)}>{starting && <Loader2 className="animate-spin"/>}{hasErrors ? 'Ricarica controlli' : nextTarget.label}<ArrowRight size={15}/></Button></section>
  {error && <p role="alert" className="ga-desk-error">{error}</p>}
  {plan.error && <p role="alert" className="ga-desk-error">Piano non disponibile: {plan.error.message}</p>}
  {reviews.error && <p role="alert" className="ga-desk-error">Consegne da ricontrollare: {reviews.error.message}</p>}
  <nav className="ga-desk-phases" aria-label="Percorso operativo della gara">{deskPhases.filter(step => step.id !== 'esito').map((s, i) => <button key={s.id} type="button" aria-current={phase === s.id ? 'step' : undefined} onClick={() => go(s.id)}><span className="ga-desk-phase-number">{i + 1}</span><span><strong>{s.id==='presenta'?'Checklist per lotto':s.label}</strong><small>{s.id==='presenta'?'Bozza e file per lotto':s.id==='revisiona'?'Controlli e consegna al revisore':s.description}</small></span>{phaseCount(s.id) > 0 && <span className="ga-desk-phase-count" title={`${phaseCount(s.id)} elementi da gestire`}>{phaseCount(s.id)}</span>}</button>)}</nav>
  {starting && !showsPreparation && <AIActivity compact status="queued" labels={['Originali','Analisi','Proposte']} message="Avvio della preparazione locale."/>}
  {desk.aiActive && !showsPreparation && latestRun && <div className="ga-ai-follow">
   <span><strong>Preparazione AI in corso</strong> · {latestRun.message}</span>
   <Button size="sm" variant="ghost" onClick={() => go('prepara', 'ai')}>Segui analisi <ArrowRight size={14}/></Button>
  </div>}
  <div className="ga-desk-delivery" aria-label="Avanzamento distinto dei documenti"><span><FileText size={15}/><strong>{desk.output.length}</strong> bozze salvate</span><span><strong>{desk.handed === undefined ? '…' : desk.handed}</strong> al revisore</span></div>
  <div className="ga-desk-layout"><section className="ga-desk-work" aria-label={`Lavoro della fase ${deskPhases.find(s => s.id === phase)?.label}`}>
   {phase === 'valuta' && <>
    <LotAssessment p={p} tender={tender} preparation={plan.data?.latest_run}
     onEdit={r => onRequirement ? onRequirement(r) : navigate(`/azienda/gare/partecipazioni/${p.id}?tab=requisiti&requisito=${r.id}`)}
     onLots={() => onModal('lots')} onAI={() => go('prepara', 'ai')}/>
    <FoldPanel title="Dati e azioni della valutazione" hint={plan.data ? `${desk.sourceRead}/${desk.sources.length} originali letti` : undefined}>
     <div className="ga-feasibility-facts"><div><span>Base di gara</span><strong>{money(tender.base_amount)}</strong></div><div><span>Presentazione</span><strong>{dateLabel(tender.deadline_date)}</strong></div><div><span>Originali letti</span><strong>{plan.data ? `${desk.sourceRead}/${desk.sources.length}` : 'Da verificare'}</strong></div><div><span>Esiti compatibili o non applicabili registrati</span><strong>{desk.requirements.length ? `${desk.requirements.filter(r => r.reviewed_by && ['compatibile', 'non_applicabile'].includes(r.status)).length}/${desk.requirements.length}` : 'Da censire'}</strong></div></div>
     <p className="ga-desk-scope">Letture e conteggi aiutano la valutazione. L’ammissibilità richiede il riscontro di requisiti, condizioni e prove.</p>
     <div className="ga-desk-actions"><Button size="sm" variant="outline" onClick={() => go('prepara', 'ai')}><Sparkles size={15}/>{plan.data?.latest_run ? 'Rivedi analisi e proposte AI' : 'Apri analisi AI'}</Button><Button size="sm" variant="outline" onClick={() => onTab('requisiti')}>Apri scheda requisiti</Button>{canEdit && <Button size="sm" onClick={() => onModal('decision')}>{p.decision === 'approfondisci' ? 'Registra decisione' : 'Rivedi decisione'}</Button>}</div>
    </FoldPanel>
    <SourceChanges tender={tender} participation={p}/>
    <FoldPanel title="Dati della procedura, lotti e grafici" hint="Originali e dettagli"><TenderOverview tender={tender} participation={p} documents={documents} blockers={blockers} onTab={onTab} onModal={onModal} showNext={false} showSources={false}/></FoldPanel>
   </>}
   {phase === 'prepara' && <>
    <div className="ga-desk-prepare-nav" role="group" aria-label="Lavoro di preparazione">{[{ id: 'ai', label: 'Preparazione AI' }, { id: 'fascicolo', label: 'Fascicolo guidato' }, { id: 'moduli', label: 'Compila i moduli' }, { id: 'dati', label: 'Dati da completare' }, { id: 'buste', label: 'Tre buste' }].map(v => <button key={v.id} aria-pressed={prepareView === v.id} onClick={() => go('prepara', v.id)}>{v.label}</button>)}<button onClick={() => onTab('documenti:dgue')}>DGUE per operatore <ChevronRight size={13}/></button></div>
    {prepareView === 'dati' && <OpenDocumentItems participationId={p.id} docs={documents.filter(d => d.participation_id === p.id && !['fonte', 'ricevuta'].includes(d.category))} reviews={reviews.data || []} cases={plan.data?.cases || []} loading={reviews.isPending || plan.isPending} unavailable={reviews.isError || plan.isError}/>}
    {prepareView === 'ai' && <PreparationPanel participation={p}/>}
    {prepareView === 'fascicolo' && (plan.data ? <TenderDossierGuide plan={plan.data}/> : <Panel title="Fascicolo per questa gara"><p role="status">{plan.isError ? 'Ricarica i controlli per aprire il fascicolo.' : 'Caricamento degli operatori…'}</p></Panel>)}
    {prepareView === 'moduli' && (plan.data ? <OfficeForms key={`${p.id}:desk:${params.get('operatore_moduli') || ''}`} plan={plan.data}/> : <Panel title="Moduli dell’impresa"><p role="status">{plan.isError ? 'Ricarica il piano per ritrovare modelli e operatori.' : 'Caricamento di modelli e operatori…'}</p></Panel>)}
    {prepareView === 'buste' && <OfferWorkspace participation={p} tender={tender} category={params.get('busta') || 'amministrativa'} onCategory={category => setParams(tenderParams(params, { tab: 'panoramica', fase_lavoro: 'prepara', prepara_vista: 'buste', busta: category }))} onAI={onAI} onUpload={category => onModal(`document:${category}`)} documents={documentList}/>}
   </>}
   {phase === 'revisiona' && <><ReviewDesk participation={p} onPrepare={() => go('prepara', 'moduli')}/>{canApprove && desk.output.some(d => d.status !== 'approvato') && <FoldPanel title="Approvazione delle versioni" hint={`${desk.approved}/${desk.output.length} approvate`}>{documentList(undefined,true)}</FoldPanel>}</>}
   {phase === 'presenta' && <><LotDelivery participation={p} tender={tender} onLots={() => onModal('lots')}/><RevisionPanel participation={p} tender={tender} blockers={blockers} busy={busy} run={run} onModal={onModal} onTab={onTab} hideCommunications/></>}
  </section><aside className="ga-desk-sidebar" aria-label="Lavoro da completare"><WorkList items={desk.items} phase={phase} loading={pending||starting} onOpen={execute}/><FoldPanel title="Operatori e documenti" hint={plan.data ? `${plan.data.subjects.length} operatori` : 'Caricamento'}>{plan.data?.subjects.map(s => <div className="ga-desk-operator" key={s.id}><strong>{s.name}</strong><small>{s.current ? 'Identità riscontrata' : 'Fascicolo da verificare'}</small></div>)}<Link className="ga-text-action" to="/azienda/gare?sezione=fascicolo">Apri fascicolo aziendale <ArrowRight size={13}/></Link></FoldPanel></aside></div>
 </div>;
}
function WorkList({ items, phase, loading, onOpen }: { items: DeskItem[]; phase: DeskPhase; loading: boolean; onOpen: (target: DeskTarget) => Promise<void> }) {
 const [all, setAll] = useState(false), [onlyPhase, setOnlyPhase] = useState(true);
 const filtered = onlyPhase ? items.filter(i => i.phase === phase) : items;
 return <section className="ga-work-list"><header><div><h3>Da completare</h3><p>{loading ? 'Aggiornamento…' : onlyPhase ? `${filtered.length} in questa fase · ${items.length} totali` : `${items.length} attività · ${items.filter(i => i.blocking).length} necessarie`}</p></div></header><label className="ga-work-list-filter"><input type="checkbox" checked={onlyPhase} onChange={e => setOnlyPhase(e.target.checked)}/>Solo questa fase</label>{(all ? filtered : filtered.slice(0, 4)).map(item => <article key={item.id}><span className="ga-work-area"><Circle size={7} fill="currentColor"/>{item.area}{!item.blocking && ' · facoltativa / seguito'}</span><h4>{item.title}</h4><p>{item.detail}</p><small>{item.owner}{item.due ? ` · ${dateLabel(item.due)}` : ''}</small>{item.reasons.length > 0 && <details><summary>Richieste e controlli collegati · {item.reasons.length}</summary>{item.reasons.map((r, i) => <p key={i}>{r}</p>)}</details>}<button type="button" disabled={loading} onClick={() => void onOpen(item.target)}>{item.target.label || 'Apri attività'}<ArrowRight size={13}/></button></article>)}{!loading && !filtered.length && <div className="ga-work-list-empty"><CheckCircle2 size={19}/><p>{onlyPhase ? 'Nessuna attività elencata per questa fase.' : 'Nessuna attività aperta nei dati caricati.'}</p><small>Controllo finale e stato sul portale restano separati.</small></div>}{filtered.length > 4 && <button className="ga-work-list-more" onClick={() => setAll(!all)}>{all ? 'Mostra meno' : `Mostra tutte le ${filtered.length} attività`}</button>}</section>;
}
