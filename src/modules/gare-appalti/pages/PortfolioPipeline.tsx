import { Link } from 'react-router-dom';
import { useState,type CSSProperties } from 'react';
import { ArrowUpRight,GitBranch } from 'lucide-react';
import { useWorkspace } from '../WorkspaceContext';
import { dateLabel } from '../domain';
import { Panel,Status } from '../components';
import { pipelineStages,concludedStages,stageCount } from '../portfolio';
import { stageLabels,type Participation,type Stage,type Tender } from '../types';

export function PipelineSummary(){
 const{data}=useWorkspace();
 const active=data.participations.filter(p=>!concludedStages.includes(p.stage));
 return <Panel className="ga-pipeline-summary" title="Pipeline delle partecipazioni" description="Dove si trovano i fascicoli dell’impresa, secondo lo stato registrato." action={<Link className="ga-text-action" to="/azienda/gare?sezione=partecipazioni&vista=pipeline">Apri pipeline <ArrowUpRight size={13}/></Link>}>
  <p className="ga-board-scroll-hint">Scorri le fasi →</p>
  <div className="ga-pipeline-track" aria-label="Fascicoli per fase">{pipelineStages.map((s,index)=>{const count=stageCount(active,s.id);return <Link key={s.id} to={`/azienda/gare?sezione=partecipazioni&vista=pipeline&stato=${s.id}`} className="ga-pipeline-step" style={{'--phase-color':s.color} as CSSProperties}><span className="ga-pipeline-phase"><span>{index+1}</span>{s.label}</span><strong>{count}</strong><span className="ga-pipeline-meter"><i style={{width:`${active.length?count/active.length*100:0}%`}}/></span><span className="ga-pipeline-caption">{count===1?'fascicolo':'fascicoli'} <ArrowUpRight size={12}/></span></Link>;})}</div>
  <div className="ga-pipeline-footer"><span><GitBranch size={13}/>{active.length} attive · {data.participations.length-active.length} concluse</span><span>Le fasi indicano lo stato, non una percentuale di completamento.</span></div>
  <div className="ga-pipeline-recent"><h3>Fascicoli da seguire</h3>{active.length?active.slice().sort((a,b)=>(data.tenders.find(t=>t.id===a.tender_id)?.deadline_date||'9999').localeCompare(data.tenders.find(t=>t.id===b.tender_id)?.deadline_date||'9999')).slice(0,3).map(p=>{const t=data.tenders.find(t=>t.id===p.tender_id);return <Link key={p.id} to={`/azienda/gare/partecipazioni/${p.id}`}><span><strong>{t?.title||'Fascicolo'}</strong><small>{stageLabels[p.stage]} · {p.responsible||'Da assegnare'}</small></span><span>{dateLabel(t?.deadline_date)}<ArrowUpRight size={13}/></span></Link>;}):<p>Nessun fascicolo attivo. Apri un’opportunità per avviare la valutazione.</p>}</div>
 </Panel>;
}

export interface ParticipationListRow {
 participation:Participation;
 tender:Tender;
 expired:boolean;
 next:string;
}

export function ParticipationCard({row,showStage=false}:{row:ParticipationListRow;showStage?:boolean}) {
 const {participation:p,tender,expired,next}=row;
 return <Link className={showStage?'ga-participation-record':'ga-pipeline-card'} to={`/azienda/gare/partecipazioni/${p.id}`}>
  <div className="ga-participation-name"><h3>{tender.title}</h3><p>{tender.authority}</p></div>
  {showStage&&<span className="ga-participation-stage"><Status tone={p.stage==='pronta'?'success':'blue'}>{stageLabels[p.stage]}</Status></span>}
  <div className="ga-participation-meta">
   <span>{p.responsible||'Da assegnare'}</span>
   <span className={expired?'ga-participation-expired':undefined}>
    {tender.deadline_date?<>
     <time dateTime={tender.deadline_date}>{dateLabel(tender.deadline_date)}</time>
     {tender.deadline_time?` · ${tender.deadline_time.slice(0,5)}`:' · Ora da verificare'}
    </>:'Data da verificare'}
   </span>
  </div>
  <span className="ga-participation-next">{next} <ArrowUpRight size={14} aria-hidden="true"/></span>
 </Link>;
}

export function ParticipationBoard({rows,selectedStage,onStage}:{rows:ParticipationListRow[];selectedStage:string;onStage:(value:string)=>void}) {
 const [showEmpty,setShowEmpty]=useState(false);
 const empty=pipelineStages.filter(s=>!rows.some(row=>row.participation.stage===s.id));
 const stages:Stage[]=selectedStage?[selectedStage as Stage]
  :pipelineStages.filter(s=>showEmpty||!empty.includes(s)).map(s=>s.id);
 const concluded=rows.filter(row=>concludedStages.includes(row.participation.stage));

 return <div className="ga-board">
  {!selectedStage&&empty.length>0&&<button type="button" className="ga-board-empty-toggle" aria-pressed={showEmpty}
   onClick={()=>setShowEmpty(value=>!value)}>{showEmpty?'Nascondi fasi vuote':`Mostra fasi vuote (${empty.length})`}</button>}
  <div className={`ga-board-columns ga-board-columns--compact${selectedStage?' ga-board-filtered':''}`} aria-label="Pipeline dei fascicoli">
   {stages.map(stage=>{
    const phase=pipelineStages.find(s=>s.id===stage);
    const label=phase?.label||stageLabels[stage];
    const items=rows.filter(row=>row.participation.stage===stage);
    return <section key={stage} className="ga-board-column" style={{'--phase-color':phase?.color||'#75839a'} as CSSProperties}>
     <div className="ga-board-column-heading"><h3>{selectedStage?label:
      <button type="button" onClick={()=>onStage(stage)} aria-label={`Filtra per ${label}`}>{label}</button>}</h3><span>{items.length}</span></div>
     {items.length?items.map(row=><ParticipationCard key={row.participation.id} row={row}/>):<p className="ga-board-empty">Nessun fascicolo</p>}
    </section>;
   })}
  </div>
  {!selectedStage&&<details className="ga-board-concluded">
   <summary>Partecipazioni concluse <Status>{concluded.length}</Status></summary>
   <div className="ga-board-concluded-cards">
    {concluded.length?concluded.map(row=><ParticipationCard key={row.participation.id} row={row}/>):<p className="text-xs text-muted-foreground">Nessun esito o ritiro registrato.</p>}
   </div>
  </details>}
  {selectedStage&&<button type="button" className="ga-text-action mt-3" onClick={()=>onStage('')}>Mostra tutte le fasi</button>}
 </div>;
}
