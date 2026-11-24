import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { CalendarClock,ChevronDown,Coins,Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '../WorkspaceContext';
import { Status } from '../components';
import { deadlineState } from '../operations';
import { deadlineLabel,money } from '../domain';
import { stageLabels,type Participation,type Tender } from '../types';

export function TenderHeader({tender,participation,lotCount,selectedCount,onModal,children}:{tender:Tender;participation?:Participation;lotCount:number;selectedCount:number;onModal:(name:string)=>void;children?:ReactNode}){
 const{canEdit}=useWorkspace();
 const deadline=deadlineState(tender,new Date());
 return <section aria-label="Riepilogo della gara" className="ga-tender-header ga-tender-header--compact mb-3 overflow-hidden rounded-xl border shadow-sm">
  <div className="ga-tender-heading flex flex-col items-start justify-between gap-3 px-4 py-4 sm:flex-row">
   <div className="min-w-0 w-full flex-1">
    <div className="mb-2 flex flex-wrap items-center gap-2"><Status tone={participation?.stage==='pronta'?'success':'blue'}>{participation?stageLabels[participation.stage]:tender.kind==='esito'?'Esito / aggiudicazione':'Da valutare'}</Status>{deadline.expired&&tender.kind!=='esito'&&<Status tone="warning">{deadline.label}</Status>}{tender.official_id&&<span className="ga-tender-code text-[10px]">{tender.official_id}</span>}</div>
    <h2 className="text-lg font-semibold leading-6">{tender.title}</h2>
    <p className="ga-tender-authority mt-1 text-xs leading-5">{tender.authority} · {tender.territory}</p>
   </div>
   <div className="ga-tender-actions flex w-full shrink-0 flex-wrap gap-2 sm:w-auto">{canEdit&&<Button size="sm" variant="outline" asChild><Link to={`/azienda/gare/procedure/${tender.id}/modifica`}><Pencil className="h-3.5 w-3.5"/>Dati gara</Link></Button>}{participation&&canEdit&&<Button size="sm" variant="outline" onClick={()=>onModal('decision')}>Decisione impresa</Button>}{!participation&&canEdit&&tender.kind!=='esito'&&<Button size="sm" onClick={()=>onModal('start')}>Avvia valutazione</Button>}</div>
  </div>
  <details className="ga-tender-extra group">
   <summary className="ga-tender-extra-summary"><span className="ga-tender-quick-facts"><span><CalendarClock aria-hidden="true"/><span>Presentazione: <strong>{deadlineLabel(tender)}</strong></span></span><span><Coins aria-hidden="true"/><span>Base: <strong>{money(tender.base_amount)}</strong></span></span></span><span className="ga-tender-extra-label">Indicatori e dettagli<ChevronDown aria-hidden="true"/></span></summary>
   <div className="ga-tender-extra-content"><dl className="ga-tender-extra-data"><div><dt>Responsabile</dt><dd>{participation?.responsible||'Da assegnare'}</dd></div><div><dt>Lotti</dt><dd>{participation?`${selectedCount} selezionati su ${lotCount}`:`${lotCount} disponibili`}</dd></div><div><dt>Fonte</dt><dd>{tender.source}</dd></div></dl>{children}</div>
  </details>
 </section>;
}
