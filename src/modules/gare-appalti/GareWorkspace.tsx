import { createContext,useContext,useEffect,useRef,useState,type ReactNode } from 'react';
import { Link,Navigate,useLocation } from 'react-router-dom';
import { ArrowLeft,Gavel,Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useWorkspace } from './WorkspaceContext';
import { currentGareSection,gareRoot,gareSections,sectionHref,type GareSection } from './navigation';

interface Navigation {section:GareSection;href:(section:GareSection)=>string;backTo:string;backLabel:string}
const Context=createContext<Navigation|null>(null);
const backLabels:Record<GareSection,string>={opportunita:'Torna alle opportunità',partecipazioni:'Torna alle partecipazioni',scadenze:'Torna alle scadenze',fascicolo:'Torna al fascicolo impresa',fonti:'Torna alle fonti'};
export function useGareNavigation(){const nav=useContext(Context);if(!nav)throw Error('Navigazione Gare non disponibile');return nav;}
export function LegacyGareSection({section}:{section:GareSection}){const location=useLocation();return <Navigate to={sectionHref(section,new URLSearchParams(location.search))} replace/>;}

export function GareWorkspace({children}:{children:ReactNode}){
 const{data,canEdit}=useWorkspace();const location=useLocation();
 const routeSection=currentGareSection(location.pathname,location.search);
 const isHub=location.pathname===gareRoot||location.pathname===gareRoot+'/';
 const [navigation,setNavigation]=useState<{
  remembered:Partial<Record<GareSection,string>>;
  origin:{section:GareSection;url:string}|null;
 }>({remembered:{},origin:null});
 const section=isHub?routeSection:navigation.origin?.section||routeSection;
 const content=useRef<HTMLDivElement>(null);const tabs=useRef<HTMLElement>(null);const previousView=useRef('');
 const view=isHub?section:location.pathname;
 useEffect(()=>{
  if(!isHub)return;
  const url=sectionHref(section,new URLSearchParams(location.search));
  const timer=setTimeout(()=>setNavigation(previous=>previous.origin?.url===url?previous:{
   remembered:{...previous.remembered,[section]:url},origin:{section,url},
  }),0);
  return ()=>clearTimeout(timer);
 },[isHub,section,location.search]);
 useEffect(()=>{
  if(previousView.current&&previousView.current!==view){window.scrollTo({top:0,behavior:'instant'});content.current?.focus({preventScroll:true});}
  previousView.current=view;
 },[view]);
 useEffect(()=>{
  const nav=tabs.current;const active=nav?.querySelector<HTMLElement>('[aria-current="page"]');
  if(nav&&active)nav.scrollTo({left:Math.max(0,active.offsetLeft-(nav.clientWidth-active.offsetWidth)/2),behavior:'instant'});
 },[section]);
 const href=(destination:GareSection)=>isHub&&destination===section?sectionHref(section,new URLSearchParams(location.search)):navigation.remembered[destination]||sectionHref(destination);
 const backTo=navigation.origin?.url||sectionHref(section);
 const activeParticipations=data.participations.filter(p=>!['non_partecipare','ritirata','esito'].includes(p.stage)).length;
 const guidedDeadlines=(data.communications||[]).filter(c=>c.due_date&&c.status!=='chiusa').length+(data.journeys||[]).reduce((n,j)=>n+j.extras.filter(e=>e.due_date&&!['done','na'].includes(j.confirmations[e.id]?.status)).length,0);
 const openDeadlines=guidedDeadlines+data.tenders.filter(t=>t.deadline_date&&t.kind!=='esito').length+data.tasks.filter(t=>!t.completed).length+data.documentRequests.filter(r=>r.due_date&&!data.documents.some(d=>d.id===r.fulfilled_by&&d.status==='approvato'&&!d.archived)).length;
 const counts:Partial<Record<GareSection,number>>={opportunita:data.tenders.length,partecipazioni:activeParticipations,scadenze:openDeadlines};
 return <Context.Provider value={{section,href,backTo,backLabel:backLabels[navigation.origin?.section||section]}}>
  <div className="ga-workspace overflow-hidden rounded-xl border bg-white shadow-sm">
   <div className="ga-workspace-heading flex items-center justify-between gap-3 px-4 py-3 sm:px-5"><div className="flex min-w-0 items-center gap-3"><span className="hidden rounded-xl bg-secondary p-2 text-white sm:block"><Gavel className="h-5 w-5"/></span><div><h1 className={cn('font-semibold tracking-tight text-secondary',isHub?'text-xl sm:text-2xl':'text-lg')}>Gare e appalti</h1><span className="inline-block rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">Pilota · Bozze</span>{isHub&&(section==='fascicolo'||section==='fonti')&&<p className="mt-1 hidden text-[11px] leading-5 text-muted-foreground sm:block">Opportunità, fascicoli e scadenze della tua impresa, in un unico spazio.</p>}</div></div>{isHub&&canEdit&&<Button size="sm" asChild className="shrink-0"><Link to={`${gareRoot}/nuova`}><Plus className="h-4 w-4"/>Nuova gara</Link></Button>}</div>
   <nav ref={tabs} aria-label="Schede Gare e appalti" className="relative flex gap-0.5 overflow-x-auto border-t bg-slate-50/60 px-2 sm:px-3">{gareSections.map(item=>{const selected=section===item.id;return <Link key={item.id} to={href(item.id)} aria-current={selected?'page':undefined} className={cn('relative flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',selected?'border-primary bg-white text-secondary':'border-transparent text-muted-foreground hover:bg-white hover:text-secondary')}><item.icon className="h-3.5 w-3.5"/>{item.title}{counts[item.id]!==undefined&&<span title={item.id==='scadenze'?'Termini e attività da completare':item.id==='partecipazioni'?'Partecipazioni attive':'Opportunità in archivio'} className={cn('rounded px-1.5 py-0.5 text-[10px] tabular-nums',selected?'bg-accent text-secondary':'bg-slate-100 text-slate-500')}>{counts[item.id]}</span>}</Link>;})}</nav>
  </div>
  <div ref={content} tabIndex={-1} id="gare-workspace-content" aria-label="Contenuto Gare e appalti" className="min-w-0 pt-4 outline-none">{children}</div>
 </Context.Provider>;
}
export function BackToGare(){const{backTo,backLabel}=useGareNavigation();return <Link to={backTo} className="mb-3 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-secondary"><ArrowLeft className="h-3.5 w-3.5"/>{backLabel}</Link>;}
