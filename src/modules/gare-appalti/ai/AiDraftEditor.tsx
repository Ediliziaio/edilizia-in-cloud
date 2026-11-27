import { useEffect,useRef,useState } from 'react';
import { useNavigate,useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft,Download,CheckCircle2,Columns2,Eye,FileText,PenLine,ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWorkspace } from '../WorkspaceContext';
import { Empty,Notice,Status } from '../components';
import { categoryLabels,type AiDraft,type AiJob,type Citation,type GareDocument } from '../types';
import { downloadBlob } from '../api';
import { CitationRow,SourceDialog } from './AiPanel';
import { useDraftAutosave } from './useDraftAutosave';
import { DraftPaper,DraftPdfPreview } from './DraftPreview';
import{DraftAiReview}from'../dossier/DraftAiReview';
import { DraftCompanyData } from './DraftCompanyData';
import { draftMarkers } from './draft-review';
import { cn } from '@/lib/utils';
import { messaggioErrore } from "@/lib/messaggioErrore";

type View='split'|'write'|'preview'|'pdf';
const views=[{id:'write',label:'Scrittura',icon:PenLine},{id:'split',label:'Affiancati',icon:Columns2},{id:'preview',label:'Anteprima testo',icon:Eye},{id:'pdf',label:'PDF',icon:FileText}] as const;
const reviewTabs=[{id:'checks',label:'Controlli'},{id:'data',label:'Dati impresa'},{id:'sources',label:'Fonti'},{id:'history',label:'Storico'}] as const;
export function AiDraftEditorPage(){const{data}=useWorkspace();const{draftId,participationId}=useParams();const draft=data.drafts.find(d=>d.id===draftId&&d.participation_id===participationId);return draft?<DraftEditor key={draft.id} draft={draft}/>:<Empty title="Bozza non disponibile">La bozza non esiste oppure non appartiene all’azienda selezionata.</Empty>;}
function DraftEditor({draft}:{draft:AiDraft}){
 const{api,data,member,canEdit,refresh}=useWorkspace();
 const{body,title,revision,saveState,error,setBody:setDraftBody,setTitle:setDraftTitle,persist,retry,dirty}=useDraftAutosave(draft,api,canEdit);
 const[confirmed,setConfirmed]=useState(false),[exporting,setExporting]=useState(false),[source,setSource]=useState<Citation|null>(null),[historyBody,setHistoryBody]=useState<string|null>(null);
 const[view,setView]=useState<View>(()=>window.matchMedia('(min-width: 1024px)').matches?'split':'write'),[reviewTab,setReviewTab]=useState<typeof reviewTabs[number]['id']>('checks');
 const navigate=useNavigate();
 function setBody(value:string){setConfirmed(false);setDraftBody(value);}
 function setTitle(value:string){setConfirmed(false);setDraftTitle(value);}
 const textarea=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>{const media=window.matchMedia('(min-width: 1024px)');const adapt=()=>{if(!media.matches)setView(current=>current==='split'?'write':current);};media.addEventListener('change',adapt);return()=>media.removeEventListener('change',adapt);},[]);
 const job=useQuery({queryKey:['gare',member.company_id,'ai-job',draft.job_id],queryFn:async()=>{const{data,error}=await api.client.from('gare_ai_jobs').select('*').eq('id',draft.job_id).eq('company_id',member.company_id).single();if(error)throw error;return data as AiJob;}});
 const versions=useQuery({queryKey:['gare',member.company_id,'draft-history',draft.id,revision],queryFn:async()=>{const{data,error}=await api.client.from('gare_ai_draft_versions').select('id,revision,body,created_at').eq('company_id',member.company_id).eq('draft_id',draft.id).order('revision',{ascending:false}).limit(30);if(error)throw error;return data as {id:string;revision:number;body:string;created_at:string}[];}});
 const factCheck=useQuery({queryKey:['gare',member.company_id,'draft-facts',draft.id],queryFn:async()=>{const{data,error}=await api.client.rpc('gare_ai_facts_current',{did:draft.id});if(error)throw error;return !!data;}});
 const missing=draftMarkers(body);
 const stale=factCheck.data===false||draft.source_snapshot.some(s=>!data.documents.some(d=>d.id===s.id&&d.sha256===s.sha256)||data.documents.some(d=>d.previous_id===s.id));
 const sections=job.data?.result?.sections||[];
 const citations=sections.flatMap(s=>s.citations);
 function selectMarker(marker:string){
  setView('write');
  requestAnimationFrame(()=>{
   const field=textarea.current;const start=body.indexOf(marker);if(!field||start<0)return;
   field.focus();field.setSelectionRange(start,start+marker.length);
   // Measure wrapped text with the same typography so the selected point is
   // visible even when a narrow editor wraps a paragraph into many lines.
   const style=getComputedStyle(field);const mirror=document.createElement('div');
   Object.assign(mirror.style,{position:'fixed',left:'-99999px',visibility:'hidden',whiteSpace:'pre-wrap',overflowWrap:'break-word',font:style.font,lineHeight:style.lineHeight,letterSpacing:style.letterSpacing,width:`${field.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)}px`});
   mirror.textContent=body.slice(0,start);const point=document.createElement('span');point.textContent=marker;mirror.append(point);document.body.append(mirror);
   field.scrollTop=Math.max(0,point.getBoundingClientRect().top-mirror.getBoundingClientRect().top-field.clientHeight/3);mirror.remove();
   field.scrollIntoView({block:'nearest',behavior:'smooth'});
  });
 }
 async function exportFile(format:'docx'|'pdf'){
  setExporting(true);try{const result=await api.ai<{document:GareDocument;stale:boolean;missing_fields:string[]}>('export-draft',{draft_id:draft.id,format,revision,confirmed:true});await refresh();downloadBlob(await api.blob(result.document),result.document.name);toast.success(result.document.unresolved_fields?'Bozza salvata con dati da completare: approvazione bloccata':'Bozza salvata nel fascicolo per la revisione');}catch(e){toast.error(messaggioErrore(e));}finally{setExporting(false);}
 }
 return <>
  <button type="button" onClick={async()=>{if(await persist())navigate(`/azienda/gare/partecipazioni/${draft.participation_id}?tab=ai`);}} className="mb-3 inline-flex items-center gap-2 text-xs text-muted-foreground"><ArrowLeft className="h-3.5 w-3.5"/>Torna all’Assistente AI</button>
  <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold text-secondary">Editor della bozza</h2><p className="mt-1 text-[11px] text-muted-foreground">{categoryLabels[draft.category]} · revisione {revision} · {body.trim()?body.trim().split(/\s+/).length:0} parole</p></div><div className="flex flex-wrap items-center gap-2"><Status tone={missing.length?'warning':'neutral'}>{missing.length} punti aperti</Status><Status tone={saveState==='Salvato'&&!dirty?'success':'warning'}>{dirty&&saveState==='Salvato'?'Modifiche da salvare':saveState}</Status><a href="#draft-review" className="text-[11px] font-medium text-secondary underline xl:hidden">Controlli e fonti ↓</a></div></div>
  {error&&<div className="mb-4"><Notice>{error} Le modifiche locali rimangono nell’editor. Copiale prima di ricaricare la pagina per confrontarle con la versione salvata.<div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>void retry()}>Riprova salvataggio</Button></div></Notice></div>}
  <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_350px]">
   <section aria-label="Scrittura e anteprima" className="min-w-0 overflow-hidden rounded-xl border bg-white shadow-sm">
    <div className="border-b p-3"><label className="block text-[10px] font-medium text-muted-foreground" htmlFor="draft-title">Titolo del documento</label><Input id="draft-title" className="mt-1 h-9 border-0 bg-slate-50 px-2 text-sm font-semibold text-secondary shadow-none" value={title} onChange={e=>setTitle(e.target.value)} disabled={!canEdit}/></div>
    <div role="group" aria-label="Vista editor" className="flex flex-wrap gap-1 border-b bg-slate-50/70 p-2">{views.map(item=><button key={item.id} aria-pressed={view===item.id} onClick={()=>setView(item.id)} className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-2 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',item.id==='split'&&'hidden lg:flex',view===item.id?'bg-white text-secondary shadow-sm ring-1 ring-slate-200':'text-muted-foreground hover:bg-white')}><item.icon className="h-3.5 w-3.5"/>{item.label}</button>)}</div>
    <div className={cn('grid',view==='split'&&'lg:grid-cols-2')}>
     {(view==='write'||view==='split')&&<div className="min-w-0"><div className="flex items-center justify-between border-b px-3 py-2 text-[10px] text-muted-foreground"><label htmlFor="draft-body">Testo modificabile</label><span>{canEdit?'Salvataggio automatico':'Sola lettura'}</span></div><textarea id="draft-body" ref={textarea} aria-label="Testo della bozza" value={body} onChange={e=>setBody(e.target.value)} readOnly={!canEdit} spellCheck className="block h-[min(68vh,720px)] min-h-[420px] w-full resize-y border-0 bg-white px-4 py-5 font-sans text-[13px] leading-7 outline-none focus:ring-2 focus:ring-inset focus:ring-ring sm:px-5"/></div>}
     {(view==='preview'||view==='split')&&<div className={cn('min-w-0',view==='split'&&'border-t lg:border-l lg:border-t-0')}><div className="border-b px-3 py-2 text-[10px] text-muted-foreground">Anteprima immediata · tocca i segnaposto per modificarli</div><div className="h-[min(68vh,720px)] min-h-[420px] overflow-auto bg-slate-100 p-3"><DraftPaper title={title} body={body} revision={revision} onMarker={selectMarker}/></div></div>}
     {view==='pdf'&&<div className="h-[min(72vh,760px)] min-h-[540px] bg-slate-100"><DraftPdfPreview key={`${draft.id}:${revision}`} draftId={draft.id} revision={revision} dirty={dirty}/></div>}
    </div>
   </section>
   <aside id="draft-review" aria-label="Revisione della bozza" className="min-w-0 scroll-mt-4 space-y-3">
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm"><div role="group" aria-label="Strumenti di revisione" className="flex border-b bg-slate-50/70 p-1.5">{reviewTabs.map(item=><button key={item.id} aria-pressed={reviewTab===item.id} onClick={()=>setReviewTab(item.id)} className={cn('flex-1 rounded-md px-1 py-2 text-[10px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',reviewTab===item.id?'bg-white text-secondary shadow-sm ring-1 ring-slate-200':'text-muted-foreground hover:bg-white')}>{item.label}{item.id==='sources'&&` (${citations.length})`}</button>)}</div>
     <div className="max-h-[min(64vh,650px)] overflow-auto p-3 sm:p-4">
      {reviewTab==='checks'&&<div className="space-y-3"><h2 className="text-sm font-semibold text-secondary">Da completare nel testo</h2>{stale&&<div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-950">Fonti o dati aziendali cambiati. Confronta le versioni o prepara una nuova proposta. L’esportazione manterrà un bloccante.</div>}{factCheck.isError&&<p role="alert" className="text-xs leading-5 text-destructive">Non è stato possibile verificare l’attualità dei dati. Aggiorna prima della revisione finale.</p>}{missing.length?<><p className="text-[11px] leading-5 text-muted-foreground">Seleziona un punto per raggiungerlo nell’editor. Completa i dati dopo averli verificati.</p><ol className="space-y-2">{missing.map((marker,i)=><li key={marker}><button className="group flex w-full items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 p-3 text-left text-[11px] leading-5 text-amber-950 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600" onClick={()=>selectMarker(marker)}><span className="shrink-0 font-mono text-[10px] text-amber-600">{i+1}.</span><span className="min-w-0 break-words">{marker.replace(/^\[|\]$/g,'')}</span><ArrowUpRight className="ml-auto mt-0.5 h-3 w-3 shrink-0"/></button></li>)}</ol></>:<p className="flex items-start gap-2 text-xs leading-5 text-emerald-800"><CheckCircle2 className="h-4 w-4 shrink-0"/>Nessun segnaposto aperto. Restano necessarie verifica dei fatti e approvazione.</p>}</div>}
      {reviewTab==='checks'&&<DraftAiReview draftId={draft.id} revision={revision} dirty={dirty}/>}
      {reviewTab==='data'&&<DraftCompanyData draft={draft}/>}
      {reviewTab==='sources'&&<div className="space-y-3"><h2 className="text-sm font-semibold text-secondary">Fonti della proposta originale</h2><p className="text-[11px] leading-5 text-muted-foreground">Riferimenti associati alle sezioni generate. Le tue modifiche non vengono ricertificate dall’AI.</p>{job.isPending?<p role="status" className="text-xs">Caricamento fonti…</p>:job.isError?<p role="alert" className="text-xs text-destructive">Fonti non disponibili. Aggiorna e riprova.</p>:citations.length?sections.filter(s=>s.citations.length).map((section,i)=><div key={i}><h3 className="mb-2 text-xs font-semibold text-secondary">{section.heading}</h3>{section.citations.map((citation,index)=><CitationRow key={index} citation={citation} onOpen={setSource}/>)}</div>):<p className="text-xs leading-5 text-muted-foreground">Nessuna citazione restituita. Confronta la proposta con gli originali.</p>}</div>}
      {reviewTab==='history'&&<div className="space-y-2"><h2 className="mb-3 text-sm font-semibold text-secondary">Revisioni salvate</h2>{versions.isError?<p role="alert" className="text-xs text-destructive">Cronologia non disponibile.</p>:versions.isPending?<p role="status" className="text-xs">Caricamento revisioni…</p>:versions.data?.map(v=><button key={v.id} className="block w-full rounded-md border px-3 py-2 text-left text-[11px] leading-5 hover:bg-muted" onClick={()=>setHistoryBody(v.body)}>Revisione {v.revision}<span className="block text-[10px] text-muted-foreground">{new Date(v.created_at).toLocaleString('it-IT')}</span></button>)}{historyBody!==null&&<div className="mt-3"><p className="mb-2 text-xs font-semibold">Versione storica in consultazione</p><pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 font-sans text-[11px] leading-5">{historyBody}</pre><Button className="mt-3" size="sm" variant="outline" disabled={!canEdit} onClick={()=>{setBody(historyBody);setHistoryBody(null);setView('write');}}>Riprendi come nuova revisione</Button></div>}</div>}
     </div>
    </section>
    <section className="rounded-xl border bg-white p-3 shadow-sm sm:p-4"><h2 className="mb-2 text-xs font-semibold text-secondary">Salva nel fascicolo</h2><p className="mb-3 text-[11px] leading-5 text-muted-foreground">Bozza libera da revisionare. Se la gara impone un modello ufficiale, riporta e verifica il testo nel modello richiesto.</p>{canEdit?<><label className="flex items-start gap-2 text-[11px] leading-5"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-primary"/>Ho riletto il testo e identificato i dati e gli impegni ancora da confermare. Il file rimarrà una bozza da approvare.</label><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" disabled={exporting||!confirmed||dirty||saveState!=='Salvato'||!!error} onClick={()=>exportFile('docx')}><Download/>Salva DOCX</Button><Button size="sm" variant="outline" disabled={exporting||!confirmed||dirty||saveState!=='Salvato'||!!error} onClick={()=>exportFile('pdf')}><Download/>Salva PDF</Button></div></>:<p className="text-xs text-muted-foreground">Il tuo ruolo consente la consultazione della bozza.</p>}</section>
   </aside>
  </div>{source&&<SourceDialog citation={source} onClose={()=>setSource(null)}/>}
 </>;
}
