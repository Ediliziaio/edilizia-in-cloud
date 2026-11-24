import { useId, useMemo, useState } from 'react';
import { FoldPanel } from '../ui/FoldPanel';
import{SearchWatch}from'../dossier/SearchWatch';
import{watchedTenders}from'../dossier/search-watch';
import { Link,useSearchParams } from 'react-router-dom';
import { Search,ArrowRight,X,GitBranch,List,Ellipsis,SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWorkspace } from '../WorkspaceContext';
import { Panel,Status,Empty,GoLink } from '../components';
import { activeTenderDocuments, requirementOpen } from '../tender-ux';
import { deadlineState } from '../operations';
import { money,dateLabel } from '../domain';
import { stageLabels,type Tender,type Participation } from '../types';
import { concludedStages } from '../portfolio';
import { NaturalSearch } from '../ai/NaturalSearch';
import { SavedSearches,PreferenceActions } from './SearchTools';
import { PortfolioMetrics } from '../ui/GareVisuals';
import{CommercialProfile,MatchExplanation}from'../journey/CommercialProfile';
import { TodayActions } from './TodayActions';
import { PipelineSummary, ParticipationBoard, ParticipationCard, type ParticipationListRow } from './PortfolioPipeline';

const opportunityKinds: Record<string, string> = {
 gara_aperta:'Gara aperta', manifestazione:'Manifestazione d’interesse', albo:'Albo fornitori',
 invito:'Invito privato', esito:'Esito / aggiudicazione',
};
const opportunityFilters: Record<string, string> = {
 q:'Ricerca', territorio:'Territorio', tipo:'Tipologia', importo_min:'Base minima',
 importo_max:'Base massima', entro:'Presentazione entro', fonte:'Fonte',
 salvate:'Solo salvate', escluse:'Incluse non pertinenti',
};

export function OpportunitiesPage() {
 const { data } = useWorkspace();
 const [params,setParams] = useSearchParams();
 const search=params.get('q')||'';
 const set=(key:string,value:string)=>setParams(current=>{
  const next=new URLSearchParams(current);
  if(value)next.set(key,value);
  else next.delete(key);
  return next;
 },{replace:true});
 const activeFilters=[...params].filter(([key,value])=>opportunityFilters[key]&&value);
 const detailFilters=activeFilters.filter(([key])=>!['q','territorio','tipo'].includes(key));
 const tenders=watchedTenders(data,params);
 const participants=new Map(data.participations.map(p=>[p.tender_id,p]));
 const originalsByTender=useMemo(()=>{
  const byTender=new Map<string, ReturnType<typeof activeTenderDocuments>>();
  for(const doc of activeTenderDocuments(data.documents.filter(d=>d.category==='fonte'))){
   const originals=byTender.get(doc.tender_id)||[];
   originals.push(doc);
   byTender.set(doc.tender_id,originals);
  }
  return byTender;
 },[data.documents]);

 return <div className="ga-opportunity-layout">
  <TodayActions compact/>
  <Panel className="ga-opportunity-archive" title="Archivio opportunità"
   action={<Button size="sm" variant="outline" asChild><Link to="/azienda/gare?sezione=fonti">Cerca nelle fonti <ArrowRight size={14}/></Link></Button>}>
   <div className="ga-opportunity-filters">
    <div className="ga-opportunity-search">
     <Search size={16} aria-hidden="true"/>
     <Input aria-label="Cerca gare" placeholder="Cerca per oggetto, ente o CIG" value={search} onChange={e=>set('q',e.target.value)}/>
    </div>
    <select aria-label="Filtra territorio" value={params.get('territorio')||''} onChange={e=>set('territorio',e.target.value)}>
     <option value="">Tutti i territori</option>
     {Array.from(new Set(data.tenders.map(t=>t.territory))).sort().map(t=><option key={t}>{t}</option>)}
    </select>
    <select aria-label="Tipo di opportunità" value={params.get('tipo')||''} onChange={e=>set('tipo',e.target.value)}>
     <option value="">Tutte le tipologie</option>
     {Object.entries(opportunityKinds).map(([value,label])=><option key={value} value={value}>{label}</option>)}
    </select>
   </div>
   <div className="ga-opportunity-toolbar">
    <div className="ga-opportunity-utilities">
     <NaturalSearch/>
     <SavedSearches/>
     <details className="ga-opportunity-more">
      <summary><SlidersHorizontal size={13} aria-hidden="true"/>Altri filtri</summary>
      <div>
       <label>Base minima (€)<Input type="number" min="0" value={params.get('importo_min')||''} onChange={e=>set('importo_min',e.target.value)}/></label>
       <label>Base massima (€)<Input type="number" min="0" value={params.get('importo_max')||''} onChange={e=>set('importo_max',e.target.value)}/></label>
       <label>Presentazione entro<Input type="date" value={params.get('entro')||''} onChange={e=>set('entro',e.target.value)}/></label>
       <label>Fonte<select value={params.get('fonte')||''} onChange={e=>set('fonte',e.target.value)}>
        <option value="">Tutte le fonti</option>
        {Array.from(new Set(data.tenders.map(t=>t.source))).map(s=><option key={s}>{s}</option>)}
       </select></label>
      </div>
     </details>
    </div>
    <div className="ga-opportunity-count">
     {!!activeFilters.length&&<button type="button" onClick={()=>setParams(current=>{
      const next=new URLSearchParams(current);
      activeFilters.forEach(([key])=>next.delete(key));
      return next;
     },{replace:true})}>Azzera filtri</button>}
     <span role="status">{tenders.length} {tenders.length===1?'risultato':'risultati'}</span>
    </div>
   </div>
   {!!detailFilters.length&&<div aria-label="Filtri attivi" className="ga-opportunity-filter-chips">
    {detailFilters.map(([key,value])=><button type="button" key={key} aria-label={`Rimuovi filtro ${opportunityFilters[key]}`} onClick={()=>set(key,'')}>
     <span>{opportunityFilters[key]}{['salvate','escluse'].includes(key)?'':` · ${key==='entro'?dateLabel(value):value}`}</span>
     <X size={12} aria-hidden="true"/>
    </button>)}
   </div>}
   {tenders.length===0?<Empty title="Nessuna opportunità trovata">Modifica i filtri oppure cerca nelle fonti.</Empty>:<>
    <div className="ga-opportunity-columns" aria-hidden="true"><span>Gara</span><span>Base di gara</span><span>Scadenza</span><span>Azioni</span></div>
    <ul className="ga-opportunity-list" aria-label="Risultati delle opportunità">
     {tenders.map(t=><OpportunityRow key={t.id} tender={t} participation={participants.get(t.id)} originals={originalsByTender.get(t.id)||[]}/>)}
    </ul>
   </>}
  </Panel>
  <div className="ga-opportunity-tools">
   <FoldPanel title="Portafoglio e pipeline" hint={`${data.participations.length} partecipazioni`}>
    <PortfolioMetrics title="Stato dei fascicoli" description=""/>
    <PipelineSummary/>
   </FoldPanel>
   <FoldPanel title="Preferenze e monitoraggio"><CommercialProfile/><SearchWatch/></FoldPanel>
  </div>
 </div>;
}

export function ParticipationsPage() {
 const { data } = useWorkspace();
 const [params,setParams] = useSearchParams();
 const search=params.get('q')||'',stage=params.get('stato')||'',owner=params.get('responsabile')||'';
 const view=params.get('vista')==='elenco'?'elenco':'pipeline';
 const now=new Date();
 const set=(key:string,value:string)=>setParams(current=>{
  const next=new URLSearchParams(current);
  if(value)next.set(key,value);
  else next.delete(key);
  return next;
 },{replace:true});
 const reset=()=>setParams(current=>{
  const next=new URLSearchParams(current);
  ['q','stato','responsabile'].forEach(key=>next.delete(key));
  return next;
 },{replace:true});
 const tenders=new Map(data.tenders.map(t=>[t.id,t]));
 const allRows:ParticipationListRow[]=data.participations.flatMap(participation=>{
  const tender=tenders.get(participation.tender_id);
  if(!tender)return [];
  const expired=participation.stage!=='presentata'&&!concludedStages.includes(participation.stage)&&deadlineState(tender,now).expired;
  const open=data.requirements.filter(r=>r.participation_id===participation.id&&requirementOpen(r)).length;
  const tasks=data.tasks.filter(t=>t.participation_id===participation.id&&!t.completed).length;
  return [{participation,tender,expired,next:nextParticipationAction(participation,expired,open,tasks)}];
 });
 const rows=allRows.filter(({participation:p,tender})=>
  (!stage||p.stage===stage)&&(!owner||p.responsible===owner)
  &&(!search||`${tender.title} ${tender.authority} ${p.responsible}`.toLocaleLowerCase('it').includes(search.toLocaleLowerCase('it')))
 ).sort((a,b)=>(a.tender.deadline_date||'9999').localeCompare(b.tender.deadline_date||'9999'));
 const owners=[...new Set(allRows.map(row=>row.participation.responsible).filter(Boolean))].sort();

 return <div className="ga-participation-layout">
  {!allRows.length?<Empty title="Nessun fascicolo" action={<Button asChild><Link to="/azienda/gare?sezione=opportunita">Apri le opportunità</Link></Button>}>
   Apri una gara per avviare la valutazione.
  </Empty>:<Panel className="ga-participation-list" title="Fascicoli dell’impresa" action={
   <div className="ga-view-switch" role="group" aria-label="Vista partecipazioni">
    <button type="button" aria-pressed={view==='pipeline'} onClick={()=>set('vista','pipeline')}><GitBranch size={14} aria-hidden="true"/>Pipeline</button>
    <button type="button" aria-pressed={view==='elenco'} onClick={()=>set('vista','elenco')}><List size={14} aria-hidden="true"/>Elenco</button>
   </div>
  }>
   <div className="ga-participation-filters">
    <div className="ga-opportunity-search"><Search size={16} aria-hidden="true"/>
     <Input aria-label="Cerca partecipazioni" placeholder="Cerca gara, ente o responsabile" value={search} onChange={e=>set('q',e.target.value)}/>
    </div>
    <select aria-label="Stato della partecipazione" value={stage} onChange={e=>set('stato',e.target.value)}>
     <option value="">Tutti gli stati</option>
     {Object.entries(stageLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
    </select>
    <select aria-label="Responsabile della partecipazione" value={owner} onChange={e=>set('responsabile',e.target.value)}>
     <option value="">Tutti i responsabili</option>
     {owners.map(value=><option key={value}>{value}</option>)}
    </select>
   </div>
   <div className="ga-participation-count">
    <span role="status">{rows.length===1?'1 fascicolo':`${rows.length} fascicoli`}</span>
    {(search||stage||owner)&&<button type="button" onClick={reset}>Azzera filtri</button>}
   </div>
   {!rows.length?<Empty title="Nessun fascicolo trovato">Modifica i filtri per ritrovare le partecipazioni.</Empty>
    :view==='pipeline'?<ParticipationBoard rows={rows} selectedStage={stage} onStage={value=>set('stato',value)}/>
    :<ul className="ga-participation-records" aria-label="Elenco partecipazioni">
     {rows.map(row=><li key={row.participation.id}><ParticipationCard row={row} showStage/></li>)}
    </ul>}
  </Panel>}
  <FoldPanel title="Riepilogo del portafoglio">
   <PortfolioMetrics title="Stato dei fascicoli" description=""/>
  </FoldPanel>
 </div>;
}

function nextParticipationAction(p:Participation,expired:boolean,open:number,tasks:number) {
 if(p.stage==='esito')return 'Leggi l’esito';
 if(p.stage==='presentata')return 'Controlla ricevuta ed esito';
 if(concludedStages.includes(p.stage))return 'Leggi la motivazione';
 if(expired)return 'Verifica la scadenza';
 if(p.decision==='approfondisci')return 'Conferma la decisione';
 if(open)return open===1?'Verifica 1 requisito':`Verifica ${open} requisiti`;
 if(tasks)return tasks===1?'Completa 1 attività':`Completa ${tasks} attività`;
 return 'Apri il controllo finale';
}

export { DeadlinesPage } from './Deadlines';

function OpportunityRow({tender,participation,originals}:{
 tender:Tender;
 participation?:Participation;
 originals:ReturnType<typeof activeTenderDocuments>;
}) {
 const [showDetails,setShowDetails]=useState(false);
 const detailsId=useId();
 const procedure=`/azienda/gare/procedure/${tender.id}`;
 const destination=participation?`/azienda/gare/partecipazioni/${participation.id}`:procedure;
 const kind=opportunityKinds[tender.kind]||tender.kind;
 const hasRules=originals.some(doc=>doc.document_kind==='disciplinare');
 const lastOriginal=originals.reduce<string|null>((last,doc)=>!last||last<doc.created_at?doc.created_at:last,null);
 const deadline=deadlineState(tender,new Date());
 const expired=deadline.expired&&tender.kind!=='esito';

 return <li className="ga-opportunity-item">
  <div className="ga-opportunity-name">
   <Link to={procedure}>{tender.title}</Link>
   <p>{[tender.authority,tender.territory].filter(Boolean).join(' · ')}</p>
   <div className="ga-opportunity-status">
    {participation?<Status tone="blue">{stageLabels[participation.stage]}</Status>:<Status>{kind}</Status>}
    {!hasRules&&tender.kind!=='esito'&&<span>Disciplinare da acquisire</span>}
   </div>
  </div>
  <div className="ga-opportunity-value">
   <span className="ga-opportunity-field-label">Base di gara</span><strong>{money(tender.base_amount)}</strong>
  </div>
  <div className="ga-opportunity-value ga-opportunity-date">
   <span className="ga-opportunity-field-label">Scadenza</span><strong>{dateLabel(tender.deadline_date)}</strong>
   {expired?<span className="ga-opportunity-expired">{deadline.unknown?'Scaduta · ora da verificare':'Scaduta'}{tender.deadline_time?` · ${tender.deadline_time.slice(0,5)}`:''}</span>
    :tender.deadline_date&&<span>{tender.deadline_time?.slice(0,5)||'Ora da verificare'}</span>}
  </div>
  <div className="ga-opportunity-row-actions">
   <GoLink to={destination}>{participation?'Continua':'Apri'}</GoLink>
   <PreferenceActions tenderId={tender.id}/>
   <Button type="button" variant="ghost" size="icon" title="Dettagli gara" aria-label={`Dettagli gara ${tender.title}`}
    aria-expanded={showDetails} aria-controls={detailsId} onClick={()=>setShowDetails(open=>!open)}>
    <Ellipsis aria-hidden="true"/>
   </Button>
  </div>
  <div id={detailsId} hidden={!showDetails} className="ga-opportunity-extra">
   <dl>
    <div><dt>Tipologia</dt><dd>{kind}</dd></div>
    <div><dt>Fonte</dt><dd>{tender.source||'Da indicare'}</dd></div>
    <div><dt>Acquisita il</dt><dd>{dateLabel(tender.created_at)}</dd></div>
    <div><dt>Originali</dt><dd>{originals.length} file{lastOriginal&&` · ultimo ${dateLabel(lastOriginal)}`}</dd></div>
    <div><dt>Disciplinare</dt><dd>{hasRules?'Acquisito':'Da acquisire'}</dd></div>
    <div><dt>Fuso orario</dt><dd>{tender.timezone}</dd></div>
   </dl>
   <MatchExplanation tender={tender}/>
  </div>
 </li>;
}
