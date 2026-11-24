import { ArrowUpRight, FileCheck2, FolderOpen, Upload } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '../WorkspaceContext';
import { Notice, Panel, Status } from '../components';
import { deadlineState } from '../operations';
import { categoryLabels, type Participation, type Tender } from '../types';
import { reviewOperator, reviewTitle } from '../review/review-list';
import { lotDelivery, type DeliveryRow } from './lot-delivery';

const files: Record<DeliveryRow['file'], string> = { mancante:'File mancante', ricollega:'Versione da ricollegare', bozza:'Bozza da rivedere', revisione:'Al revisore', incompleto:'Dati da completare', profilo_dgue:'Profilo DGUE da verificare', approvato:'Approvato' };
const signatures: Record<DeliveryRow['signature'], string> = { da_firmare:'Da firmare', dichiarata:'Firma dichiarata', non_indicata:'Firma non indicata' };
const uploads: Record<DeliveryRow['upload'],string> = { da_completare:'In attesa dei controlli', da_esportare:'Esporta il pacchetto', in_pacchetto:'Nel pacchetto finale', dichiarato:'Presentazione registrata', con_ricevuta:'Con ricevuta registrata' };

function portalHref(value: string | null | undefined) {
 if (!value) return '';
 try {
  const url = new URL(value);
  return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password ? url.href : '';
 } catch { return ''; }
}

export function LotDelivery({ participation, tender, onLots }: { participation: Participation; tender: Tender; onLots: () => void }) {
 const { data,canEdit } = useWorkspace();
 const [params,setParams] = useSearchParams();
 const base = `/azienda/gare/partecipazioni/${participation.id}`;
 const lots = data.lots.filter(l=>l.tender_id===tender.id&&data.participationLots.some(p=>p.participation_id===participation.id&&p.lot_id===l.id));
 const lot = lots.find(l=>l.id===params.get('lotto_consegna'))||lots[0];
 const journey = data.journeys?.find(j=>j.participation_id===participation.id);
 const portal = portalHref(journey?.configuration.portal_url)||portalHref(tender.official_url);
 const deadline = deadlineState(tender,new Date());
 const delivery = lot?lotDelivery(data,participation,lot):null;
 const sections = ['amministrativa','tecnica','economica'] as const;
 const instructions = lot&&journey?.configuration.lot_data?.[lot.id]?.instructions;
 const selectLot = (id: string) => setParams(current => {
  const next = new URLSearchParams(current);
  next.set('lotto_consegna', id);
  return next;
 }, { replace: true, preventScrollReset: true });
 const documentHref = (view: 'checklist' | 'preparazione', context: Record<string, string>) => `${base}?${new URLSearchParams({
  tab:'documenti',documenti_vista:view,fase_lavoro:'presenta',...(lot?{lotto_consegna:lot.id}:{}),...context,
 })}`;
 const requestHref = (id?:string) => documentHref('checklist', {
  ...(lot?{lotto_richiesta:lot.id}:{}),...(id?{richiesta:id}:{}),
 });

 return <Panel className="ga-lot-delivery" title="Checklist per lotto" description="Controlla file, firma richiesta e destinazione prevista."
  action={canEdit&&<Button variant="outline" size="sm" onClick={onLots}>Gestisci lotti</Button>}>
  {deadline.expired&&<Notice>Termine registrato trascorso. La checklist è consultabile per la revisione d’archivio.</Notice>}
  {!lot||!delivery ? <p className="py-3 text-sm text-muted-foreground">Seleziona un lotto per vedere la relativa consegna.</p> : <>
   <label className="ga-delivery-lot-select"><span>Lotto della consegna</span>
    <select aria-label="Lotto della consegna" value={lot.id} onChange={e=>selectLot(e.target.value)}>{lots.map(l=><option key={l.id} value={l.id}>{l.code} · {l.title}</option>)}</select>
   </label>
   <div className="ga-delivery-portal">
    <Upload size={17}/><div><strong>Destinazione sul portale</strong><p>{portal ? new URL(portal).hostname : 'Collegamento ufficiale da confermare in Dati gara'}{instructions&&` · ${instructions}`}</p></div>
    {portal&&<Button variant="outline" size="sm" asChild><a href={portal} target="_blank" rel="noopener noreferrer">{deadline.expired?'Consulta procedura':'Apri procedura'} <ArrowUpRight size={13}/></a></Button>}
   </div>
   {delivery.requests===0&&<p className="ga-delivery-note">Richieste del lotto da censire. Qui compaiono i file già salvati e i loro stati.</p>}
   {delivery.unassignedSubmissions&&<p className="ga-delivery-note">Ci sono registrazioni di presentazione con lotto da verificare.</p>}
   {sections.map(category=>{
    const rows=delivery.rows.filter(row=>row.category===category);
    if(!rows.length)return null;
    return <section key={category} className="ga-delivery-envelope">
     <h3><FolderOpen size={15}/>{categoryLabels[category]} <span>{rows.length}</span></h3>
     {rows.map(row=><article key={row.id} className="ga-delivery-file">
      <div className="ga-delivery-doc"><strong>{!row.request&&row.document ? reviewTitle(row.document) : row.title}</strong>
       {row.request&&<p>{row.request.lot_id?'Specifico del lotto':'Comune ai lotti selezionati'} · {row.request.mandatory?'Obbligatorio':'Facoltativo'}</p>}
       {row.document&&<p>{row.request?row.document.name+' · ':''}v{row.document.version}{reviewOperator(row.document).key!=='participation'&&` · ${reviewOperator(row.document).name}`}</p>}
       {row.sourceChanged&&<Status tone="warning">Fonte da aggiornare</Status>}
      </div>
      <dl className="ga-delivery-status">
       <div><dt>File</dt><dd><Status tone={row.file==='approvato'?'success':'warning'}>{files[row.file]}</Status></dd></div>
       <div><dt>Firma</dt><dd><Status tone={row.signature==='da_firmare'?'warning':'neutral'}>{signatures[row.signature]}</Status></dd></div>
       <div><dt>Caricamento</dt><dd><Status tone={row.upload==='con_ricevuta'?'success':'neutral'}>{uploads[row.upload]}</Status></dd></div>
      </dl>
      <div className="ga-delivery-file-actions">
       {row.document&&<Link to={documentHref('preparazione',{revisiona:row.document.id})}><FileCheck2 size={13}/> {row.file==='profilo_dgue'?'Apri controlli DGUE':'Controlla file'}</Link>}
       {row.request&&<Link to={requestHref(row.request.id)}>{row.file==='ricollega'?'Ricollega la versione':'Apri richiesta'}</Link>}
      </div>
     </article>)}
    </section>;
   })}
   {!delivery.rows.length&&<p className="py-3 text-sm text-muted-foreground">File e richieste di questo lotto appariranno qui man mano che li acquisisci.</p>}
   <div className="ga-desk-actions"><Button size="sm" variant="outline" asChild><Link to={requestHref()}>Gestisci documenti richiesti</Link></Button></div>
  </>}
 </Panel>;
}
