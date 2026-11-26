import type { ReactNode } from 'react';
import { FileText,ListChecks,Calculator,Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useWorkspace } from '../WorkspaceContext';
import { latestDocuments } from '../domain';
import { Panel } from '../components';
import { DocumentRequests } from '../ai/DocumentRequests';
import { TechnicalPanel } from './TechnicalPanel';
import { EconomicPanel } from './EconomicPanel';
import { categoryLabels,type Participation,type Tender } from '../types';
const categories=[{id:'amministrativa',label:'Amministrativa',icon:FileText},{id:'tecnica',label:'Tecnica',icon:ListChecks},{id:'economica',label:'Economica',icon:Calculator}] as const;
export function OfferWorkspace({participation:p,tender,category,onCategory,onAI,onUpload,documents}:{participation:Participation;tender:Tender;category:string;onCategory:(id:string)=>void;onAI:(id:string)=>void;onUpload:(id:string)=>void;documents:(category:string)=>ReactNode}){
 const{data,canEdit}=useWorkspace();const currentDocuments=latestDocuments(data.documents.filter(d=>d.participation_id===p.id)).filter(d=>!d.archived);const active=categories.find(c=>c.id===category)||categories[0];
 return <div className="ga-offer-workspace space-y-4"><div className="ga-envelope-switch grid grid-cols-3 gap-2" role="group" aria-label="Buste dell’offerta">{categories.map(c=>{const count=currentDocuments.filter(d=>d.category===c.id).length;return <button key={c.id} onClick={()=>onCategory(c.id)} aria-pressed={c.id===active.id} className={cn('flex min-h-14 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors sm:px-3 sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',c.id===active.id?'border-secondary bg-accent text-secondary':'bg-white text-muted-foreground hover:bg-muted/50')}><c.icon className="hidden h-4 w-4 shrink-0 sm:block"/><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{c.label}</span><span className="mt-0.5 block text-[11px] font-normal">{count} file</span></span></button>;})}</div>
 <div className="ga-offer-columns grid items-start gap-4"><div className="min-w-0 space-y-4">{active.id==='tecnica'&&<TechnicalPanel participation={p}/>} {active.id==='economica'&&<EconomicPanel participation={p} tender={tender}/>}<Panel title={`Documenti · ${categoryLabels[active.id]}`} description="Modelli della gara e bozze da revisionare." action={canEdit&&<div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={()=>onAI(active.id)}>Prepara con AI</Button><Button size="sm" onClick={()=>onUpload(active.id)}><Upload/>Carica documento</Button></div>}>{documents(active.id)}</Panel></div><div className="min-w-0"><DocumentRequests participation={p} category={active.id}/></div></div>
 </div>;
}
