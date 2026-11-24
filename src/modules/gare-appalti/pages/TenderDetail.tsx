import { workDeskParams } from '../desk/work-desk';
import { useState } from 'react';
import { useParams,useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useWorkspace } from '../WorkspaceContext';
import { BackToGare } from '../GareWorkspace';
import { ActionForm,EditorDialog,Empty,Notice,TextField,value } from '../components';
import { type GareDocument,type Requirement } from '../types';
import { DecisionForm,DocumentForm,RequirementForm,StartForm,TaskForm } from './DetailForms';
import { AiPanel } from '../ai/AiPanel';
import { RevisionPanel } from './RevisionPanel';
import { OfferWorkspace } from './OfferWorkspace';
import { TenderDesk } from '../desk/TenderDesk';
import type { GareTask } from '../types';
import { activeTenderDocuments,requirementOpen,tenderParams,tenderTab } from '../tender-ux';
import { TenderHeader } from './TenderHeader';
import { TenderTabs } from './TenderTabs';
import { TenderOverview } from './TenderOverview';
import { RequirementsPanel } from './RequirementsPanel';
import { TenderDocuments,TenderFiles } from './TenderDocuments';
import { TenderTasks } from './TenderTasks';
import { TenderSummary } from '../ui/GareVisuals';

export function TenderDetailPage(){
 const{data,api,member,refresh}=useWorkspace();const{tenderId,participationId}=useParams();
 const p=data.participations.find(p=>participationId?p.id===participationId:p.tender_id===tenderId);
 const tender=data.tenders.find(t=>t.id===(p?.tender_id||tenderId));const[params,setParams]=useSearchParams();const tab=tenderTab(params.get('tab'),!!p);
 const[signatureRequired,setSignatureRequired]=useState(false);
 const[modal,setModal]=useState('');const[editingTask,setEditingTask]=useState<GareTask|undefined>();const[editingRequirement,setEditingRequirement]=useState<Requirement|undefined>();const[previous,setPrevious]=useState<GareDocument|undefined>();const[busy,setBusy]=useState(false);
 const blockers=useQuery({queryKey:['gare',member.company_id,'blockers',p?.id],enabled:!!p,queryFn:()=>api.blockers(p!.id)});
 async function run(action:()=>Promise<unknown>,message:string){setBusy(true);try{await action();await refresh();toast.success(message);}catch(e){toast.error(e instanceof Error?e.message:typeof e==='object'&&e&&'message'in e?String(e.message):String(e));}finally{setBusy(false);}}
 if(!tender)return <Empty title="Gara non disponibile">La gara non esiste oppure non appartiene all’azienda selezionata.</Empty>;
 const lots=data.lots.filter(l=>l.tender_id===tender.id);const selected=new Set(data.participationLots.filter(pl=>pl.participation_id===p?.id).map(pl=>pl.lot_id));
 const requirements=data.requirements.filter(r=>r.participation_id===p?.id);const tasks=data.tasks.filter(t=>t.participation_id===p?.id);
 const allDocs=data.documents.filter(d=>d.tender_id===tender.id&&(d.category==='fonte'||d.participation_id===p?.id));const docs=activeTenderDocuments(allDocs);
 const openModal=(name:string)=>{if(['submission','outcome','document:ricevuta'].includes(name))return;setSignatureRequired(false);setPrevious(undefined);setEditingRequirement(undefined);setEditingTask(undefined);setModal(name);};
 const changeTab=(id:string)=>{const[name,docView]=id.split(':');if(name==='panoramica'){setParams(workDeskParams(params));return;}setParams(tenderParams(params,{tab:name,...(docView?(name==='offerta'?{busta:docView}:{documenti_vista:docView}):{})}));};
 const openAI=(mode='analizza',category='tecnica')=>setParams(tenderParams(params,{tab:'ai',mode,category,fonti_confronto:''}));
 const fileActions={busy,run,onVersion:(d:GareDocument,required=false)=>{setSignatureRequired(required);setPrevious(d);setModal('document');},onArchive:(d:GareDocument)=>{setPrevious(d);setModal('archive');}};
 const documentList=(category?:string,onlyOffer=false)=><TenderFiles documents={onlyOffer?docs.filter(d=>!['fonte','ricevuta'].includes(d.category)&&!(/\.json$/i.test(d.name)&&d.generation_snapshot?.answers)):docs} category={category} {...fileActions}/>;
 const counts={requisiti:requirements.filter(requirementOpen).length,documenti:docs.length,attivita:tasks.filter(t=>!t.completed).length,ai:data.drafts.filter(d=>d.participation_id===p?.id).length,revisioni:blockers.data?.length};
 return <><BackToGare/><TenderHeader tender={tender} participation={p} lotCount={lots.length} selectedCount={selected.size} onModal={openModal}>{p&&<TenderSummary tender={tender} participation={p} documents={docs} onTab={changeTab}/>}</TenderHeader>
 {p?<details className="ga-expert-tools" open={tab!=='panoramica'?true:undefined}><summary><span>Tutti gli strumenti della gara</span><small>Requisiti, file, AI e storico</small></summary>{tab!=='panoramica'&&<button className="ga-return-desk" onClick={()=>changeTab('panoramica')}>{params.get('fase_lavoro')==='presenta'&&params.has('lotto_consegna')?'← Torna alla checklist del lotto':'← Torna al percorso della gara'}</button>}<TenderTabs active={tab} started counts={counts} onChange={changeTab}/></details>:<TenderTabs active={tab} started={false} counts={counts} onChange={changeTab}/>}
 <section id="gara-tab-content" role="tabpanel" aria-labelledby={p&&tab==='panoramica'?'ga-operating-title':`gara-tab-${tab}`} className="min-w-0">
 {tab==='panoramica'&&(p?<TenderDesk key={p.id} participation={p} tender={tender} documents={docs} blockers={blockers} busy={busy} run={run} onModal={openModal} onVersion={fileActions.onVersion} onTab={changeTab} onAI={category=>openAI('bozza',category)} onRequirement={r=>{setEditingRequirement(r);setModal('requirement');}} documentList={documentList}/>:<TenderOverview tender={tender} documents={docs} blockers={blockers} onTab={changeTab} onModal={openModal}/>)}
 {tab==='requisiti'&&p&&<RequirementsPanel participation={p} busy={busy} run={run} onAI={()=>openAI()} onEdit={r=>{setEditingRequirement(r);setModal('requirement');}}/>}
 {tab==='ai'&&(p?<AiPanel key={`${p.id}:${params.get('mode') || ''}:${params.get('fonti_confronto') || ''}:${params.get('elaborazione') || ''}`} participation={p} tender={tender}/>:<Empty title="Avvia prima una valutazione">L’assistente lavora sul fascicolo e sulle fonti di una partecipazione.</Empty>)}
 {tab==='documenti'&&<TenderDocuments tender={tender} participation={p} allDocuments={allDocs} onUpload={()=>openModal('document')} {...fileActions}/>}
 {tab==='offerta'&&(p?<OfferWorkspace participation={p} tender={tender} category={params.get('busta')||'amministrativa'} onCategory={id=>setParams(tenderParams(params,{tab:'offerta',busta:id}))} onAI={id=>openAI('bozza',id)} onUpload={id=>openModal(`document:${id}`)} documents={documentList}/>:<Empty title="Avvia la valutazione della gara">La preparazione dell’offerta appartiene a una partecipazione con lotti selezionati.</Empty>)}
 {tab==='attivita'&&p&&<TenderTasks participation={p} tender={tender} busy={busy} run={run} onEdit={t=>{setEditingTask(t);setModal('task');}}/>}
 {tab==='revisioni'&&p&&<RevisionPanel participation={p} tender={tender} blockers={blockers} busy={busy} run={run} onModal={openModal} onTab={changeTab}/>}
 {tab==='revisioni'&&!p&&<Empty title="Nessuna partecipazione da revisionare">Avvia la valutazione per preparare e controllare il fascicolo.</Empty>}
 </section>
 {modal&&<EditorDialog title={modal==='archive'?'Escludi documento':modal==='start'?'Avvia valutazione':modal==='decision'?'Decisione dell’impresa':modal==='requirement'?'Verifica un requisito':modal.startsWith('document')?(previous?'Carica nuova versione':'Carica documento'):modal==='task'?(editingTask?'Modifica attività':'Aggiungi attività'):modal==='submission'?'Registra presentazione':modal==='lots'?'Modifica lotti selezionati':'Registra esito o ritiro'} description="Le modifiche vengono salvate nel fascicolo aziendale del pilota." onClose={()=>setModal('')}>
 {modal==='archive'&&previous&&<ActionForm label="Escludi dal fascicolo" afterSave={()=>setModal('')} onSave={f=>api.update('documents',previous.id,{archived:true,archive_reason:value(f,'reason')})}><TextField name="reason" label="Motivo dell’esclusione dal fascicolo attivo" minLength={5} required/><Notice>Il file e lo storico rimangono conservati. Per riutilizzarlo carica una nuova versione revisionata.</Notice></ActionForm>}{modal==='start'&&<StartForm tender={tender} onClose={()=>setModal('')}/>}{modal==='decision'&&p&&<DecisionForm participation={p} onClose={()=>setModal('')}/>}{modal==='requirement'&&p&&<RequirementForm participation={p} requirement={editingRequirement} onClose={()=>setModal('')}/>}{modal.startsWith('document')&&<DocumentForm tender={tender} participation={p} previous={previous} defaultLotId={modal==='document:ricevuta'&&params.get('fase_lavoro')==='presenta'?params.get('lotto_consegna')||undefined:undefined} signatureRequired={signatureRequired} defaultCategory={modal.split(':')[1]||'fonte'} onClose={()=>setModal('')}/>}{modal==='task'&&p&&<TaskForm participation={p} task={editingTask} onClose={()=>setModal('')}/>}{modal==='lots'&&p&&<ActionForm afterSave={()=>setModal('')} onSave={async f=>{const{error}=await api.client.rpc('gare_select_lots',{pid:p.id,lot_ids:f.getAll('lots').map(String),expected_revision:p.revision});if(error)throw error;}}><Notice>La modifica riapre la revisione. I documenti già riferiti a un lotto impediscono di rimuoverlo finché non vengono revisionate le assegnazioni.</Notice><div className="space-y-3">{lots.map(l=><label key={l.id} className="flex gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" name="lots" value={l.id} defaultChecked={selected.has(l.id)} className="h-4 w-4 accent-primary"/>Lotto {l.code} · {l.title}</label>)}</div></ActionForm>}
 </EditorDialog>}
 </>;
}
