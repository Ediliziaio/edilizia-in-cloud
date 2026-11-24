import { preparationSourceChanges, preparationSources } from './preparation-sources';
import{DetailsHelp}from'../ui/DetailsHelp';
import{AIActivity}from'../ai/AIActivity';
import{useState}from'react';
import{Link,useNavigate}from'react-router-dom';
import{useQuery}from'@tanstack/react-query';
import{Sparkles,ArrowRight,Play,Square,RotateCcw}from'lucide-react';
import{Button}from'@/components/ui/button';
import{useWorkspace}from'../WorkspaceContext';
import{ActionForm,Check,EditorDialog,Notice,Panel,TextField,value}from'../components';
import { activeTenderDocuments } from '../tender-ux';
import type{AiJob,Participation,PreparationRun}from'../types';
import{toast}from'sonner';
const stepNames={inventory:'Originali',analysis:'Lettura AI',models:'Moduli',forms:'Valori e citazioni',dgue:'Operatori DGUE',matching:'Patrimonio e richieste',technical:'Struttura e controlli'};
export function PreparationPanel({participation:p}:{participation:Participation}){
 const{api,canEdit,refresh,data}=useWorkspace();const navigate=useNavigate();const base=`/azienda/gare/partecipazioni/${p.id}`;const[requested,setRequested]=useState(false);const[busy,setBusy]=useState(false);const[error,setError]=useState('');const[selected,setSelected]=useState('');const[review,setReview]=useState(false);
 const runs=useQuery({queryKey:['gare',api.companyId,'preparation',p.id],queryFn:async()=>{const{data,error}=await api.client.from('gare_preparation_runs').select('*').eq('participation_id',p.id).order('created_at',{ascending:false}).limit(20);if(error)throw error;return data as PreparationRun[];},refetchInterval:q=>q.state.data?.some(r=>['queued','running'].includes(r.status))?2000:false});
 const run=runs.data?.find(r=>r.id===selected)||runs.data?.[0];const result=run?.result;const warnings=[...new Set([...(result?.warnings||[]),...(result?.form_proposals||[]).flatMap(f=>f.warnings)])];
 const analyses=useQuery({queryKey:['gare',api.companyId,'preparation-analysis',run?.id,run?.status],enabled:!!result?.analysis_ids?.length,queryFn:async()=>{const{data,error}=await api.client.from('gare_ai_jobs').select('*').in('id',result!.analysis_ids!);if(error)throw error;return data as AiJob[];}});
 const working=runs.data?.find(r=>r.status==='queued'||r.status==='running');
 const active=run?.status==='queued'||run?.status==='running';
 const ready=run?.status==='waiting_review'||run?.status==='done';
 const currentSources=preparationSources(data.documents,p.tender_id);
 const changes=run?preparationSourceChanges(run.snapshot.sources,currentSources):null;
 const stale=!!(changes&&(changes.added.length||changes.removed.length));
 const currentReady=ready&&!stale;
 const hasSources=currentSources.length>0;
 const stage=run?.steps.inventory?.status!=='done'?0:run.steps.matching?.status==='done'?2:1;
 const savedDrafts=activeTenderDocuments(data.documents.filter(d=>d.participation_id===p.id&&!['fonte','ricevuta'].includes(d.category))).length>0;
 const next=savedDrafts?{label:'Completa i dati mancanti',to:`${base}?tab=panoramica&fase_lavoro=prepara&prepara_vista=dati`}
  :result?.contracts?.length?{label:'Compila i moduli',to:`${base}?tab=panoramica&fase_lavoro=prepara&prepara_vista=moduli`}
  :result?.dgue_inventory?.length?{label:'Apri DGUE per operatore',to:`${base}?tab=documenti&documenti_vista=dgue`}
  :{label:'Apri le analisi con le fonti',to:`${base}?tab=ai`};
 async function act(task:()=>Promise<unknown>,startsRun=false){
  setBusy(true);setRequested(startsRun);setError('');
  try{await task();await runs.refetch();await refresh();}
  catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);setRequested(false);}
 }

 return <Panel className="mb-4 ga-preparation-panel" title="Preparazione AI" description="Passaggi chiave degli atti, moduli e questionari DGUE."
  action={canEdit && !working && <Button variant={run?'outline':'default'} disabled={busy||runs.isPending||runs.isError||!hasSources} onClick={()=>act(async()=>{
   const r=await api.local<PreparationRun>('preparation','start',{participation_id:p.id,force:ready});setSelected(r.id);
  },true)}><Sparkles size={16}/> {stale?'Aggiorna analisi':run?'Nuova analisi':'Analizza e prepara'}</Button>}>
 {runs.isError&&<Notice>{runs.error.message} <button className="underline" onClick={()=>void runs.refetch()}>Riprova</button></Notice>}
 {error&&<p className="my-3 text-sm text-destructive" role="alert">{error}</p>}
 {!hasSources && <p className="text-sm">Acquisisci gli originali per iniziare. <Link className="font-semibold underline" to={`${base}?tab=documenti&documenti_vista=archivio`}>Apri archivio file</Link></p>}
 {!run&&!requested&&hasSources&&<DetailsHelp title="Che cosa prepara l’AI">Legge gli originali e raccoglie citazioni, requisiti e dati da proporre per i moduli. Puoi rivedere tutto prima di applicare le proposte.</DetailsHelp>}
 {working && working.id!==run?.id && <Button size="sm" variant="outline" onClick={()=>setSelected(working.id)}>Torna all’analisi in corso <ArrowRight size={14}/></Button>}
 {requested && !active && <AIActivity status="queued" labels={['Originali','Analisi','Proposte']} message="Avvio della preparazione locale."/>}
 {run&&(!requested || active)&&<>
 <AIActivity status={run.status} progress={run.progress} message={run.message} sourceCount={run.snapshot.sources.length}
  sourceNames={run.snapshot.sources.map(s=>s.name)} stage={stage} labels={['Originali','Analisi','Proposte']}/>
 {ready && stale && changes && <div className="ga-prep-stale" role="status">
  <strong>Originali cambiati dopo questa analisi</strong>
  <p>Aggiorna l’analisi per applicare le proposte agli atti correnti.</p>
  <details><summary>Vedi i file interessati</summary>
   {changes.added.map(source=><p key={`added-${source.id}`}>Corrente · {source.name}</p>)}
   {changes.removed.map(source=><p key={`removed-${source.id}`}>Dall’analisi precedente · {source.name}</p>)}
  </details>
 </div>}
 {currentReady && <div className="ga-prep-next">
  <div><strong>Prossimo passo</strong><p>{savedDrafts?'Controlla i campi delle bozze già salvate.':'Rivedi le proposte nei passaggi qui sotto.'}</p></div>
  <Button size="sm" asChild><Link to={next.to}>{next.label}<ArrowRight size={15}/></Link></Button>
 </div>}
 {canEdit && (active || ['error','interrupted','cancelled'].includes(run.status)) && <div className="my-3 flex gap-2">
  {active ? <Button size="sm" variant="outline" disabled={busy} onClick={()=>act(()=>api.local('preparation','cancel',{id:run.id}))}><Square size={14}/>Interrompi</Button>
   : <Button size="sm" disabled={busy} onClick={()=>act(()=>api.local('preparation','resume',{id:run.id,participation_id:p.id}),true)}><RotateCcw size={14}/>Riprendi dai passaggi salvati</Button>}
 </div>}
 <details className="ga-details-section"><summary>Fasi e risultati salvati · {Object.values(run.steps).filter(s=>s.status==='done').length}/{Object.keys(stepNames).length}</summary><div className="ga-prep-steps">{Object.entries(stepNames).map(([id,label],i)=><div key={id} data-status={run.steps[id]?.status||'waiting'}><span>{run.steps[id]?.status==='done'?'✓':i+1}</span><strong>{label}</strong><small>{run.steps[id]?.status==='done'?'Salvato':run.steps[id]?.status==='running'?'In corso':'In attesa'}</small></div>)}</div></details>
 {run.error&&<Notice>{run.error}</Notice>}
 {!!warnings.length&&<details className="my-3 rounded border p-3"><summary className="cursor-pointer text-xs font-semibold">Copertura e limiti della preparazione · {warnings.length}</summary><ul className="mt-2 list-disc space-y-1 pl-4 text-xs">{warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></details>}
 {(result?.questions||[]).length>0&&<section className="my-4"><h3 className="mb-2 text-sm font-semibold">Punti emersi dalla preparazione · {result!.questions!.length}</h3><DetailsHelp title="Quando sono stati rilevati">Risultati dell’elaborazione selezionata. Per i controlli aggiornati apri Prepara tutto.</DetailsHelp><div className="ga-prep-questions">{result!.questions!.slice(0,10).map(q=><div key={q.id}><strong>{q.title}</strong><details><summary>Dettagli</summary><p>{/criterio\s+[a-z]\d|criterio\s+tecnico/i.test(q.title)?'Completa la proposta tecnica, le prove pertinenti e gli impegni del criterio.':q.detail}</p></details><Link to={`/azienda/gare/partecipazioni/${p.id}${q.area==='dgue'?'?tab=documenti&documenti_vista=dgue':q.area==='moduli'?'?tab=documenti&documenti_vista=ufficio':q.area==='percorso'?'/prepara?vista=dati':q.area==='offerta'||/criterio\s+[a-z]\d|criterio\s+tecnico/i.test(q.title)?'?tab=offerta':'?tab=requisiti'}`}>Completa <ArrowRight size={12}/></Link></div>)}</div>{result!.questions!.length>10&&<p className="mt-2 text-xs text-muted-foreground">Le altre richieste sono disponibili nei moduli e nei requisiti collegati.</p>}</section>}
 {!!analyses.data?.length&&canEdit&&['waiting_review','done'].includes(run.status)&&<ActionForm label="Aggiungi al fascicolo le proposte selezionate" submitDisabled={stale} onSave={async f=>{for(const job of analyses.data!){const requirements=f.getAll('requirement').map(String).filter(id=>job.result?.requirements?.some(r=>r.id===id));const documents=f.getAll('document').map(String).filter(id=>job.result?.required_documents?.some(r=>r.id===id));if(requirements.length||documents.length){const{error}=await api.client.rpc('gare_apply_ai_proposals',{jid:job.id,requirement_ids:requirements,document_ids:documents});if(error)throw error;}}await refresh();toast.success('Proposte aggiunte, da verificare');}}><details className="rounded border p-3"><summary className="cursor-pointer text-sm font-semibold">Requisiti e documenti proposti · scegli cosa inserire</summary><div className="mt-3 space-y-3">{analyses.data.flatMap(j=>(j.result?.requirements||[]).filter(r=>r.citation.grounded).map(r=><div key={`${j.id}_${r.id}`}><Check name="requirement" value={r.id} label={r.description}/><p className="ml-6 mt-1 text-[11px] text-muted-foreground">{r.citation.document_name} · {r.citation.quote}</p></div>))}{analyses.data.flatMap(j=>(j.result?.required_documents||[]).filter(d=>d.citation.grounded).map(d=><div key={`${j.id}_${d.id}`}><Check name="document" value={d.id} label={`${d.category} · ${d.title}`}/><p className="ml-6 mt-1 text-[11px] text-muted-foreground">{d.citation.quote}</p></div>))}</div></details><Check name="confirmed" required label="Ho riletto gli estratti e selezionato soltanto le richieste pertinenti"/></ActionForm>}
 {!!result?.technical?.length&&canEdit&&['waiting_review','done'].includes(run.status)&&<ActionForm label="Crea la griglia tecnica selezionata" submitDisabled={stale} onSave={async f=>{await api.local('preparation','apply-criteria',{id:run.id,selected:f.getAll('criterion').map(String),confirmed:true});await refresh();}}><details className="rounded border p-3"><summary className="cursor-pointer text-sm font-semibold">Criteri tecnici estratti · {result.technical.length}</summary><div className="mt-3 space-y-3">{result.technical.map(c=><div key={c.id}><Check name="criterion" value={c.id} label={`${c.code} · ${c.title}${c.max_points?' · '+c.max_points+' punti':''}`}/><p className="ml-6 text-xs text-muted-foreground">{c.limits} · {c.citation.quote}</p></div>)}</div></details><Check name="confirmed" required label="Ho verificato codici, pesi e limiti nell’originale; i criteri esistenti non vengono sovrascritti"/></ActionForm>}
 {!!result?.matches?.length&&<details className="my-4 rounded border p-3"><summary className="cursor-pointer text-sm font-semibold">Patrimonio collegabile ai requisiti · {result.matches.length}</summary><div className="mt-3 space-y-3">{result.matches.map((m,i)=><div key={`${m.requirement_id}_${i}`} className="border-b pb-3 text-xs"><strong>{m.description}</strong>{m.candidates.length?m.candidates.map(a=><p key={a.id} className="mt-2">{a.title} · {a.status==='confermato'?'Dati riscontrati':'Da verificare'}<span className="mt-1 block text-muted-foreground">{a.reasons.join(' · ')}</span></p>):<p className="mt-1 text-muted-foreground">Nessuna scheda individuata. Puoi collegare una prova manualmente.</p>}</div>)}</div></details>}
 {!!result?.review?.length&&<details className="ga-validation-warnings"><summary>Punti per la revisione · {result.review.length}</summary>{result.review.map((r,i)=><p key={i}>{r.description}</p>)}</details>}
 <details className="ga-details-section"><summary>Altre azioni e bozze tecniche</summary><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" asChild><Link to={`${base}?tab=panoramica&fase_lavoro=prepara&prepara_vista=moduli`}>Apri moduli<ArrowRight/></Link></Button>{canEdit&&['waiting_review','done'].includes(run.status)&&!result?.draft_ids?.length&&<Button size="sm" variant="outline" disabled={busy||!!working||stale} onClick={()=>act(async()=>{const job=await api.local<AiJob>('preparation','technical-draft',{participation_id:p.id,confirmed:true});navigate(`${base}?tab=ai&elaborazione=${encodeURIComponent(job.id)}`);})}><Play/>Prepara bozza dalla griglia</Button>}{result?.draft_ids?.map(id=><Button key={id} size="sm" variant="outline" asChild><Link to={`/azienda/gare/partecipazioni/${p.id}/documenti/${id}`}>Apri la bozza tecnica coordinata<ArrowRight/></Link></Button>)}<Button size="sm" variant="ghost" asChild><Link to={`/azienda/gare/partecipazioni/${p.id}?tab=ai`}>Apri analisi e bozze</Link></Button>{canEdit&&run.status==='waiting_review'&&<Button size="sm" onClick={()=>setReview(true)}>Registra revisione dei risultati</Button>}</div></details>
 {review&&<EditorDialog title="Registra la revisione della preparazione" description="Questa registrazione riguarda i risultati AI. Requisiti, documenti, firma e invio conservano i propri controlli." onClose={()=>setReview(false)}><ActionForm label="Registra revisione" afterSave={()=>setReview(false)} onSave={async f=>{await api.local('preparation','complete',{id:run.id,note:value(f,'note'),confirmed:true});await runs.refetch();}}><TextField name="note" label="Risultati verificati, elementi applicati e attività ancora da completare" required minLength={10}/><Check name="confirmed" required label="Ho controllato i risultati; questa verifica non dichiara pronta o presentata l’offerta"/></ActionForm></EditorDialog>}
 </>}
 {(runs.data?.length||0)>1&&<details className="mt-4"><summary className="cursor-pointer text-xs text-muted-foreground">Preparazioni precedenti · {runs.data!.length-1}</summary><div className="mt-2 flex flex-wrap gap-2">{runs.data!.map(r=><Button key={r.id} size="sm" variant={r.id===run?.id?'default':'outline'} onClick={()=>setSelected(r.id)}>{new Date(r.created_at).toLocaleString('it-IT')} · {r.status}</Button>)}</div></details>}
 </Panel>;
}
