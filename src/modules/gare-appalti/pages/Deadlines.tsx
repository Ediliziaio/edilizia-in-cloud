import { Link,useSearchParams } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { useWorkspace } from '../WorkspaceContext';
import { Panel,Status,Empty } from '../components';
import { dateLabel } from '../domain';
import { calendarDate } from '../operations';
import { upcomingDate,afterDays } from '../portfolio';
import { requestComplete } from '../tender-ux';

interface AgendaEntry {
 id:string;
 title:string;
 date:string;
 time:string|null;
 kind:string;
 owner:string;
 done:boolean;
 url:string;
}

const typeLabels:Record<string,string>={
 'Presentazione ufficiale':'Presentazione',
 'Preparazione documento':'Documento',
 interna:'Attività interna',
 sopralluogo:'Sopralluogo',
 chiarimenti:'Chiarimenti',
 presentazione:'Presentazione interna',
};
const displayType=(kind:string)=>typeLabels[kind]||kind;

export function DeadlinesPage() {
 const { data } = useWorkspace();
 const [params,setParams] = useSearchParams();
 const owner=params.get('responsabile')||'',kind=params.get('tipo')||'',period=params.get('periodo')||'';
 const includesCompleted=params.get('completate')==='1';
 const today=calendarDate(new Date());
 const tomorrow=afterDays(today,1);
 const participationByTender=new Map(data.participations.map(p=>[p.tender_id,p]));

 const allRows:AgendaEntry[]=[
  ...(data.communications||[]).filter(c=>c.due_date).map(c=>({
   id:c.id,title:c.title,date:c.due_date!,time:c.due_time,kind:`Comunicazione · ${c.kind}`,
   owner:c.responsible,done:c.status==='chiusa',url:`/azienda/gare/partecipazioni/${c.participation_id}/prepara?vista=comunicazioni`,
  })),
  ...(data.journeys||[]).flatMap(j=>j.extras.filter(e=>e.due_date).map<AgendaEntry>(e=>({
   id:`${j.id}:${e.id}`,title:e.title,date:e.due_date!,time:null,kind:'Passaggio guidato',
   owner:e.responsible||'Da assegnare',done:['done','na'].includes(j.confirmations[e.id]?.status),
   url:`/azienda/gare/partecipazioni/${j.participation_id}/prepara?fase=${e.stage}`,
  }))),
  ...data.tenders.filter(t=>t.deadline_date&&t.kind!=='esito').map(t=>({
   id:t.id,title:t.title,date:t.deadline_date!,time:t.deadline_time,kind:'Presentazione ufficiale',
   owner:participationByTender.get(t.id)?.responsible||'Da assegnare',done:false,url:`/azienda/gare/procedure/${t.id}`,
  })),
  ...data.tasks.map(task=>({
   id:task.id,title:task.title,date:task.due_date,time:task.due_time,kind:task.kind,owner:task.responsible,
   done:task.completed,url:`/azienda/gare/partecipazioni/${task.participation_id}?tab=attivita`,
  })),
  ...data.documentRequests.filter(d=>d.due_date).map<AgendaEntry>(d=>({
   id:d.id,title:d.title,date:d.due_date!,time:null,kind:'Preparazione documento',owner:d.responsible||'Da assegnare',
   done:requestComplete(d,data.documents),
   url:`/azienda/gare/partecipazioni/${d.participation_id}?tab=documenti&documenti_vista=checklist&richiesta=${encodeURIComponent(d.id)}`,
  })),
 ];
 const set=(key:string,value:string)=>setParams(current=>{
  const next=new URLSearchParams(current);
  if(value)next.set(key,value);
  else next.delete(key);
  return next;
 },{replace:true});
 const reset=()=>setParams(current=>{
  const next=new URLSearchParams(current);
  ['periodo','responsabile','tipo','completate'].forEach(key=>next.delete(key));
  return next;
 },{replace:true});
 const available=allRows.filter(r=>(!owner||r.owner===owner)&&(!kind||r.kind===kind)&&(includesCompleted||!r.done));
 const periods=[
  {id:'',label:'Tutte',matches:()=>true},
  {id:'7giorni',label:'Prossimi 7 giorni',matches:(r:AgendaEntry)=>upcomingDate(r.date,today,7)},
  {id:'trascorse',label:'Date trascorse',matches:(r:AgendaEntry)=>r.date<today},
  {id:'senza_orario',label:'Senza orario',matches:(r:AgendaEntry)=>!r.time},
 ];
 const activePeriod=periods.find(p=>p.id===period)||periods[0];
 const rows=available.filter(activePeriod.matches).sort((a,b)=>`${a.date}${a.time||''}`.localeCompare(`${b.date}${b.time||''}`));
 const days=new Map<string,AgendaEntry[]>();
 for(const row of rows){
  const entries=days.get(row.date)||[];
  entries.push(row);
  days.set(row.date,entries);
 }
 const owners=[...new Set(allRows.map(r=>r.owner).filter(Boolean))].sort();
 const kinds=[...new Set(allRows.map(r=>r.kind))].sort();

 return <Panel className="ga-deadlines-page" title="Agenda gare"
  action={<span className="ga-agenda-zone" title="Fuso di riferimento dell’agenda">Europe/Rome</span>}>
  <div className="ga-filter-pills" role="group" aria-label="Periodo delle scadenze">{periods.map(p=><button type="button" key={p.id}
   aria-pressed={activePeriod.id===p.id} onClick={()=>set('periodo',p.id)}>
   {p.label} <strong>{available.filter(p.matches).length}</strong>
  </button>)}</div>
  <div className="ga-agenda-filters">
   <select aria-label="Responsabile della scadenza" value={owner} onChange={e=>set('responsabile',e.target.value)}>
    <option value="">Tutti i responsabili</option>{owners.map(o=><option key={o}>{o}</option>)}
   </select>
   <select aria-label="Tipo di scadenza" value={kind} onChange={e=>set('tipo',e.target.value)}>
    <option value="">Tutti i tipi</option>{kinds.map(k=><option key={k} value={k}>{displayType(k)}</option>)}
   </select>
   <label className="ga-completed-toggle"><input type="checkbox" checked={includesCompleted}
    onChange={e=>set('completate',e.target.checked?'1':'')}/>Mostra completate</label>
   {(period||owner||kind||includesCompleted)&&<button className="ga-agenda-reset" type="button" onClick={reset}>Azzera filtri</button>}
  </div>
  {!rows.length?<Empty title="Nessuna scadenza trovata">Modifica i filtri per vedere altre voci.</Empty>
   :<div className="ga-agenda">{Array.from(days,([date,entries])=><section key={date} className="ga-agenda-day">
    <div className="ga-agenda-day-heading">
     <h3>{date===today?'Oggi':date===tomorrow?'Domani':dateLabel(date)}</h3>
     {date<today&&entries.some(r=>!r.done)&&<Status tone="warning">Data trascorsa</Status>}
    </div>
    <ul aria-label={dateLabel(date)}>{entries.map(r=><li key={r.id}>
     <Link to={r.url} className="ga-agenda-row">
      <span className="ga-agenda-time">{r.time?r.time.slice(0,5):'Ora da verificare'}</span>
      <div className="ga-agenda-entry"><strong>{r.title}</strong><p>{displayType(r.kind)} · {r.owner||'Da assegnare'}</p></div>
      <span className="ga-agenda-action">{r.done&&<Status tone="success">Completata</Status>}<ArrowUpRight size={14} aria-hidden="true"/></span>
     </Link>
    </li>)}</ul>
   </section>)}</div>}
 </Panel>;
}
