import { useEffect,useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight,CalendarClock,CheckCircle2,FileCheck2,ListChecks,ShieldAlert,Sparkles } from 'lucide-react';
import { useWorkspace } from '../WorkspaceContext';
import { calendarDate,todayPriorities } from '../operations';
import { cn } from '@/lib/utils';
import { FoldPanel } from '../ui/FoldPanel';

const icons={termine:CalendarClock,attivita:ListChecks,evidenza:ShieldAlert,documento:FileCheck2,requisito:ListChecks,decisione:ListChecks,comunicazione:CalendarClock};
export function TodayActions({compact=false}:{compact?:boolean}){
 const{data}=useWorkspace();const[now,setNow]=useState(()=>new Date());
 useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),60_000);return()=>clearInterval(timer);},[]);
 const priorities=todayPriorities(data,now);const first=priorities.slice(0,3);
 if(compact)return <FoldPanel title="Da fare oggi" className="ga-today-fold"
  hint={priorities.length===1?'1 azione aperta':`${priorities.length} azioni aperte`}>
  {first.length?<ul className="ga-today-actions">{first.map(item=>{
   const Icon=icons[item.kind];
   return <li key={item.id}><Link to={item.to} className="ga-today-action">
    <Icon size={16} className={item.urgent?'text-red-700':'text-secondary'} aria-hidden="true"/>
    <span><strong>{item.title}</strong><small>{item.context}</small><small>{item.detail}</small></span>
    <ArrowUpRight size={14} aria-hidden="true"/>
   </Link></li>;
  })}</ul>:<p className="text-sm text-muted-foreground">Nessuna urgenza rilevata.</p>}
 </FoldPanel>;
 return <section aria-labelledby="today-title" className="ga-priorities mb-4 overflow-hidden rounded-xl border bg-white shadow-sm">
  <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50/70 px-4 py-3"><div className="flex items-center gap-2"><span className="rounded-md bg-secondary p-1.5 text-white"><Sparkles className="h-3.5 w-3.5"/></span><h2 id="today-title" className="text-sm font-semibold text-secondary">Da fare oggi</h2><span className="hidden text-[11px] text-muted-foreground sm:inline">{new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long',timeZone:'Europe/Rome'}).format(now)}</span></div><span className="text-[11px] text-muted-foreground">{priorities.length?`${Math.min(3,priorities.length)} priorità · ${priorities.length} azioni aperte`:'Nessuna urgenza rilevata'}</span></div>
  {first.length?<div className="flex snap-x snap-mandatory divide-x overflow-x-auto lg:grid lg:grid-cols-3 lg:overflow-visible">{first.map((item,index)=>{const Icon=icons[item.kind];return <Link key={item.id} to={item.to} className="group flex w-[85%] min-w-0 shrink-0 snap-start flex-col gap-2 px-4 py-3.5 lg:w-auto transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"><div className="flex items-center justify-between gap-2"><span className={cn('flex items-center gap-1.5 text-[10px] font-semibold',item.urgent?'text-red-700':'text-amber-800')}><Icon className="h-3.5 w-3.5"/>{item.badge}</span><span className="font-mono text-[10px] text-slate-400">0{index+1}</span></div><h3 className="text-sm font-semibold leading-5 text-secondary">{item.title}</h3><p className="line-clamp-1 text-[11px] text-muted-foreground" title={item.context}>{item.context}</p><p className="line-clamp-2 text-[11px] leading-5 text-muted-foreground" title={item.detail}>{item.detail}</p><span className="mt-auto flex items-center gap-1 pt-1 text-xs font-semibold text-secondary group-hover:text-primary">{item.action}<ArrowUpRight className="h-3.5 w-3.5"/></span></Link>;})}</div>:<div className="flex items-center gap-3 p-4 text-xs leading-5 text-muted-foreground"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700"/>Nessuna attività urgente nei prossimi sette giorni o verifica aperta nei fascicoli attivi. Consulta comunque l’archivio e i termini ufficiali.</div>}
  <p className="border-t bg-slate-50/50 px-4 py-2 text-[10px] text-muted-foreground"><span className="mr-2 font-medium text-secondary lg:hidden">Scorri le priorità →</span>Priorità dai dati registrati · {calendarDate(now)} · Gli orari mancanti richiedono verifica.</p>
 </section>;
}
