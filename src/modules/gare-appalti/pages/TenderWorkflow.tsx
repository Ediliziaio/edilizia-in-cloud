import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useWorkspace } from '../WorkspaceContext';
import { workflowIndex,workflowSteps } from '../operations';
import type { Participation } from '../types';
import { cn } from '@/lib/utils';

export function TenderWorkflow({participation,blockers,onTab}:{participation:Participation;blockers?:string[];onTab:(tab:string)=>void}){
 const{data}=useWorkspace();const[expanded,setExpanded]=useState(false);const current=workflowIndex(participation);const steps=workflowSteps(data,participation,blockers);
 return <section aria-label="Percorso del fascicolo" className="ga-workflow ga-workflow--compact mb-3 rounded-lg border bg-white shadow-sm">
  <h2 className="sr-only">Percorso del fascicolo</h2>
  <button type="button" aria-expanded={expanded} aria-controls="tender-workflow-steps" onClick={()=>setExpanded(v=>!v)} className="ga-workflow-toggle"><span className="ga-workflow-phase"><span>Percorso del fascicolo</span><strong>{current<0?'Percorso interrotto':`${current+1}/5 · ${steps[current].label}`}</strong><span className="ga-workflow-current-detail">{current<0?'Consulta la decisione':steps[current].detail}</span></span><span className="ga-workflow-disclosure">{expanded?'Chiudi percorso':'Mostra percorso'}<ChevronDown className={cn('h-4 w-4 shrink-0',expanded&&'rotate-180')}/></span></button>
  <ol id="tender-workflow-steps" className={cn('ga-workflow-steps gap-1 sm:grid-cols-5',expanded?'mt-3 grid':'hidden')}>{steps.map((step,index)=><li key={step.label} className="min-w-0"><button onClick={()=>onTab(step.tab)} aria-current={index===current?'step':undefined} className={cn('flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',index===current?'border-secondary/25 bg-accent/70':'border-transparent hover:border-slate-200 hover:bg-slate-50')}><span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',index===current?'bg-secondary text-white':'bg-slate-100 text-slate-500')}>{index+1}</span><span className="min-w-0"><span className="block text-xs font-semibold text-secondary">{step.label}</span><span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{step.detail}</span></span></button></li>)}</ol>
 </section>;
}
