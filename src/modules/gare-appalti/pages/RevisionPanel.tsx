import {useState} from 'react';
import {blockerTarget} from './blocker-target';
import { ArrowRight,CheckCircle2,Clock3,Download,History } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '../WorkspaceContext';
import { Panel,Status } from '../components';
import{JourneyCommunications}from'../journey/JourneyCommunications';
import { downloadBlob } from '../api';
import type { Participation,Tender } from '../types';

interface Props {
 hideCommunications?:boolean;participation:Participation;tender:Tender;
 blockers:{data?:string[];isPending:boolean;isError:boolean};busy:boolean;
 run:(action:()=>Promise<unknown>,message:string)=>Promise<void>;
 onModal:(name:string)=>void;onTab:(name:string)=>void;
}
export function RevisionPanel({participation:p,tender,blockers,busy,run,onModal,onTab,hideCommunications=false}:Props){
 const{api,data,canEdit}=useWorkspace();const navigate=useNavigate();
 const packages=data.exports.filter(e=>e.participation_id===p.id).sort((a,b)=>b.created_at.localeCompare(a.created_at));
 const related=new Set([p.id,tender.id,...data.documents.filter(d=>d.tender_id===tender.id).map(d=>d.id),...data.requirements.filter(r=>r.participation_id===p.id).map(r=>r.id),...data.tasks.filter(t=>t.participation_id===p.id).map(t=>t.id),...packages.map(e=>e.id)]);
 const audit=data.audit.filter(a=>related.has(a.entity_id)||!!a.details?.source_document_id&&related.has(a.details.source_document_id)).slice(0,25);
 const [showAll,setShowAll]=useState(false);
 const messages=blockers.data||[];
 function resolve(message:string){const target=blockerTarget(message,p,tender,data,canEdit);return{...target,action:()=>{if(target.modal)onModal(target.modal);else if(target.url)navigate(target.url);else if(target.tab)onTab(target.tab);}};}

 return <div className="ga-revision-workspace grid items-start gap-4 xl:grid-cols-12">
  <div className="min-w-0 space-y-4 xl:col-span-7">
   <Panel title="Controlli della bozza" description={blockers.data?.length?`${blockers.data.length} ${blockers.data.length===1?'controllo da completare':'controlli da completare'}`:'Verifica della versione corrente del fascicolo'}>
    {blockers.isPending?<p role="status" className="text-sm">Verifica in corso…</p>:blockers.isError?<p role="alert" className="text-sm text-destructive">Verifica non riuscita. Aggiorna i dati e riprova.</p>:blockers.data?.length?<div className="ga-blocker-list">{(showAll?messages:messages.slice(0,4)).map((message,i)=>{const next=resolve(message);return <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-950"><Clock3 className="h-4 w-4 shrink-0"/><span className="min-w-[160px] flex-1">{message}</span>{next&&<Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-amber-950" onClick={next.action}>{next.label}<ArrowRight className="h-3.5 w-3.5"/></Button>}</div>;})}{messages.length>4&&<button className="ga-show-more" onClick={()=>setShowAll(v=>!v)}>{showAll?'Mostra meno':`Mostra tutti i ${messages.length} controlli`}</button>}</div>:<div className="flex items-start gap-2 rounded-md bg-emerald-50 p-3 text-xs leading-5 text-emerald-900"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/>Controlli registrati completi. L’approvazione finale rimane una responsabilità dell’impresa.</div>}
    {canEdit&&<div className="mt-3 flex flex-wrap gap-2 border-t pt-3"><Button size="sm" variant="outline" disabled={busy||p.stage==='presentata'} onClick={()=>run(()=>api.update('participations',p.id,{stage:'in_revisione'},p.revision),'Passaggio in revisione registrato')}>Passa in revisione</Button></div>}
   </Panel>
   <Panel title="Pacchetti esportati" description="File e versioni conservati. Formati da verificare sul portale." action={canEdit&&<div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={()=>run(async()=>{const result=await api.buildExport(p.id,true);downloadBlob(result.blob,result.name);},'Bozza esportata')}><Download/>Esporta bozza</Button></div>}>
    {packages.length?<div className="max-h-80 space-y-2 overflow-auto">{packages.map(e=><div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">Pacchetto {e.id.slice(0,8)}</p><Status tone={e.draft?'warning':'success'}>{e.draft?'BOZZA':'Finale'}</Status></div><p className="mt-1 text-[11px] text-muted-foreground">{new Date(e.created_at).toLocaleString('it-IT')} · {e.manifest.documents.length} file</p></div><Button variant="ghost" size="sm" disabled={busy} onClick={()=>run(async()=>{const result=await api.exportBlob(e);downloadBlob(result.blob,result.name);},'Pacchetto scaricato')}><Download/>Scarica snapshot</Button></div>)}</div>:<p className="py-1 text-xs text-muted-foreground">Nessun pacchetto preparato. Puoi esportare una bozza anche durante la revisione.</p>}
   </Panel>
  </div>
  <div className="min-w-0 space-y-4 xl:col-span-5">
   {!hideCommunications&&<JourneyCommunications participation={p}/>}<details className="group rounded-lg border bg-card shadow-sm"><summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><History className="h-4 w-4 text-muted-foreground"/>Registro delle operazioni <span className="ml-auto text-xs font-normal text-muted-foreground">{audit.length} eventi · <span className="group-open:hidden">mostra</span><span className="hidden group-open:inline">chiudi</span></span></summary><div className="max-h-72 overflow-auto border-t px-4 py-1">{audit.length?audit.map(a=><p key={a.id} className="border-b py-2 text-[11px] leading-5 text-muted-foreground last:border-0">{new Date(a.created_at).toLocaleString('it-IT')} · {a.action==='INSERT'?'Creazione':'Aggiornamento'} · {a.entity_type==='gare_review_checks'?'Controlli e consegna alla revisione':a.entity_type==='gare_source_reviews'?'Controllo del testo':a.entity_type.replace('gare_','')} · {a.actor?`autore ${a.actor.slice(0,8)}…`:'seed dimostrativo'}</p>):<p className="py-3 text-xs text-muted-foreground">Nessuna operazione registrata.</p>}</div></details>
  </div>
 </div>;
}
