import { useEffect,useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft,ChevronRight,FileText,LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '../WorkspaceContext';
import { isDraftMarker,markerParts } from './draft-review';

export function DraftPaper({title,body,revision,onMarker}:{title:string;body:string;revision:number;onMarker:(marker:string)=>void}){
 return <article aria-label="Anteprima immediata della bozza" className="mx-auto min-h-full max-w-[780px] break-words bg-white px-5 py-7 shadow-sm sm:px-8">
  <div className="mb-6 flex items-center justify-between gap-2 border-b pb-2 text-[8px] font-semibold tracking-wider text-slate-500"><span>EDILIZIA IN CLOUD</span><span>BOZZA DA REVISIONARE</span></div>
  <h2 className="mb-5 text-lg font-semibold leading-7 text-slate-800">{title||'Titolo da completare'}</h2>
  <div className="whitespace-pre-wrap text-[13px] leading-7 text-slate-700">{markerParts(body).map((part,i)=>isDraftMarker(part)?<button key={i} title="Seleziona questo punto nel testo" onClick={()=>onMarker(part)} className="rounded-sm bg-amber-100 px-0.5 text-left font-medium text-amber-950 underline decoration-amber-400 decoration-dotted underline-offset-4 hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600">{part}</button>:<span key={i}>{part}</span>)}</div>
  <footer className="mt-8 border-t pt-2 text-[9px] text-slate-500">Revisione {revision} · Anteprima del testo in modifica. Impaginazione finale nella vista PDF.</footer>
 </article>;
}
interface PreviewResult {name:string;content_type:string;base64:string;image_base64:string;page:number;page_count:number;revision:number;preview:true}
export function DraftPdfPreview({draftId,revision,dirty}:{draftId:string;revision:number;dirty:boolean}){
 const{api,member}=useWorkspace();const[resource,setResource]=useState<{revision:number;url:string}|null>(null);const[page,setPage]=useState(1);
 const pdf=useQuery({queryKey:['gare',member.company_id,member.user_id,'draft-preview',draftId,revision,page],queryFn:()=>api.ai<PreviewResult>('preview-draft',{draft_id:draftId,revision,page}),enabled:!dirty,staleTime:60_000,retry:false});
 useEffect(()=>{if(!pdf.data||pdf.data.revision!==revision)return;const bytes=Uint8Array.from(atob(pdf.data.base64),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));const timer=setTimeout(()=>setResource({revision,url}),0);return()=>{clearTimeout(timer);URL.revokeObjectURL(url);};},[pdf.data,revision]);
 if(dirty)return <div role="status" className="flex h-full min-h-60 items-center justify-center p-6 text-center text-xs leading-6 text-muted-foreground">Il PDF si aggiorna dopo il salvataggio. L’anteprima del testo mostra già le tue modifiche.</div>;
 if(pdf.isError)return <div role="alert" className="p-5 text-xs leading-6 text-destructive">{pdf.error.message}<Button className="mt-3 block" size="sm" variant="outline" onClick={()=>pdf.refetch()}>Riprova anteprima PDF</Button></div>;
 if(pdf.isPending||resource?.revision!==revision)return <div role="status" className="flex min-h-60 items-center justify-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin"/>Preparo il PDF locale…</div>;
 return <div className="flex h-full min-h-[540px] flex-col"><div className="flex flex-wrap items-center justify-between gap-2 border-b bg-white px-3 py-2 text-[10px] text-muted-foreground"><span className="flex items-center gap-1"><FileText className="h-3 w-3"/>PDF · revisione {revision}</span><div className="flex items-center gap-2"><Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Pagina PDF precedente" disabled={page===1} onClick={()=>setPage(n=>n-1)}><ChevronLeft className="h-3.5 w-3.5"/></Button><span aria-live="polite">{page} / {pdf.data!.page_count}</span><Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Pagina PDF successiva" disabled={page>=pdf.data!.page_count} onClick={()=>setPage(n=>n+1)}><ChevronRight className="h-3.5 w-3.5"/></Button></div><a className="font-medium text-secondary underline" href={resource.url} download={pdf.data!.name}>Scarica anteprima</a></div><div className="min-h-0 flex-1 overflow-auto p-3"><img src={`data:image/png;base64,${pdf.data!.image_base64}`} alt={`Pagina ${page} di ${pdf.data!.page_count} del PDF, revisione ${revision}`} className="mx-auto h-auto w-full max-w-[850px] bg-white shadow-sm"/></div></div>;
}
