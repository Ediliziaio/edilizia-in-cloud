import { SourceDirectory } from '../sources/SourceDirectory';
import { FoldPanel } from '../ui/FoldPanel';
import{MarketInsights}from'../dossier/MarketInsights';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Database,Radio,AlertTriangle,Clock3 } from 'lucide-react';
import { useWorkspace } from '../WorkspaceContext';
import { ActionForm,Field,Notice,Panel,SelectField,Status,value } from '../components';
import { HubSummary } from '../ui/HubSummary';
import { MetricCard } from '../ui/GareVisuals';
import { dateLabel } from '../domain';
import { commercialMatch } from '../journey/CommercialProfile';
interface Source {id:string;key:string;name:string;owner:string;url:string;access_mode:string;coverage:string;license_note:string;enabled:boolean;last_attempt:string|null;last_success:string|null;last_error:string|null}
export interface NoticeVersion {id:string;fetched_at?:string;normalized:{publication_date?:string;title:string;authority:string;territories:string[];publication_number:string;notice_type:string;url:string;estimated_values:string[];currencies:string[];deadline_dates:string[];deadline_times:string[];coverage:string;demo?:boolean}}
interface SearchResult {notices:NoticeVersion[];total:number;partial:boolean;page:number;sample?:boolean}
export function SourcesPage(){
 const{api,member,canEdit}=useWorkspace();const[result,setResult]=useState<SearchResult|null>(null);const sources=useQuery({queryKey:['gare',member.company_id,'sources'],queryFn:()=>api.local<Source[]>('sources','status')});
 const lastSuccess=sources.data?.flatMap(s=>s.last_success?[s.last_success]:[]).sort().reverse()[0];
 return <><HubSummary title="Fonti e importazione" description="Fonti ufficiali e importazioni da revisionare.">
 <MetricCard primary label="Fonti censite" value={sources.data?.length??'—'} note="Canali configurati nell’ambiente" icon={<Database/>}/>
 <MetricCard label="Consultazioni live" value={sources.data?.filter(s=>s.enabled).length??'—'} note="Solo quelle abilitate" icon={<Radio/>}/>
 <MetricCard label="Fonti con errori" value={sources.data?.filter(s=>s.last_error).length??'—'} note="Ultimo tentativo registrato" icon={<AlertTriangle/>} tone="amber"/>
 <MetricCard label="Ultimo successo" value={lastSuccess?dateLabel(lastSuccess):sources.data?'Mai':'—'} note="Dai dati del connettore" icon={<Clock3/>}/>
 </HubSummary>
 <SourceDirectory tedEnabled={!!sources.data?.find(s=>s.key==='TED')?.enabled}/>
 {sources.data?.find(s=>s.key==='TED')?.enabled&&<div id="gare-ted-search"><Panel title="Consultazione pubblica TED" description="Solo lettura dalla API ufficiale: viene trasmessa la query di ricerca, senza documenti o anagrafica dell’impresa."><ActionForm label="Consulta API TED" onSave={async f=>{setResult(await api.local<SearchResult>('sources','ted-search',{query:value(f,'query'),scope:value(f,'scope'),page:Number(value(f,'page'))}));await sources.refetch();}}><Field name="query" label="Query esperta TED" defaultValue="CY=ITA AND PD>=20260101" required help="Verifica tipologia e termini: ACTIVE include anche albi e sistemi di qualificazione senza scadenza ordinaria."/><SelectField name="scope" label="Ambito TED" options={[{value:'ACTIVE',label:'ACTIVE · interpretazione da verificare'},{value:'ALL',label:'Tutti gli avvisi'},{value:'LATEST',label:'Ultimi avvisi'}]}/><Field name="page" label="Pagina · 10 avvisi per pagina" type="number" min="1" defaultValue="1" required/></ActionForm></Panel></div>}
 {result && <Panel title={result.sample ? 'Campione locale TED' : 'Risultati TED'}
  description={`${result.total} avvisi · pagina ${result.page}${result.partial ? ' · risposta parziale' : ''}`}>
  <div className="ga-notice-results">{result.notices.map(notice => <NoticeCard key={notice.id} notice={notice} profile={member.company.profile} canEdit={canEdit}/>)}</div>
  {!result.notices.length && <p className="text-sm text-muted-foreground">Nessun avviso in questa pagina. Modifica la ricerca o l’ambito.</p>}
 </Panel>}
 <FoldPanel title="Copertura e impostazioni dei connettori"><div className="mt-4 grid items-start gap-4 xl:grid-cols-2">{sources.isError&&<Notice>{sources.error.message}</Notice>}{sources.data?.map(s=><Panel key={s.id} className="ga-source-card" title={s.name} description={s.owner} action={<Status tone={s.enabled?'success':'neutral'}>{s.enabled?'API su richiesta':s.key==='TED'?'API disattivata':'Consultazione manuale'}</Status>}><p className="text-sm">{s.access_mode}</p>{s.url&&/^https?:\/\//.test(s.url)&&<a className="ga-text-action mt-3" href={s.url} target="_blank" rel="noopener noreferrer">Apri fonte ufficiale ↗</a>}<p className="mt-2 text-xs text-muted-foreground"><Link className="underline" to="/azienda/gare/nuova">Acquisisci gara e allegati</Link> dopo aver letto l’avviso ufficiale.</p><FoldPanel title="Copertura e aggiornamenti"><p className="text-xs leading-6">{s.coverage}</p><p className="mt-2 text-xs text-muted-foreground">{s.license_note}</p><p className="mt-3 text-xs">Ultimo tentativo: {s.last_attempt?new Date(s.last_attempt).toLocaleString('it-IT'):'mai'} · Ultima riuscita: {s.last_success?new Date(s.last_success).toLocaleString('it-IT'):'mai'}</p></FoldPanel>{s.last_error&&<p className="mt-3 text-xs text-destructive">{s.last_error}</p>}{s.key==='TED'&&member.role==='admin'&&<FoldPanel title="Configura consultazione live"><ActionForm label={s.enabled?'Disattiva consultazione live':'Abilita consultazione pubblica manuale'} onSave={async()=>{const{error}=await api.client.from('gare_sources').update({enabled:!s.enabled}).eq('id',s.id).eq('company_id',member.company_id);if(error)throw error;await sources.refetch();}}><p className="mt-3 text-xs">{s.enabled?'Abilitata solo su richiesta esplicita dalla schermata.':'Disattivata. Il campione locale funziona senza rete.'}</p></ActionForm></FoldPanel>}</Panel>)}</div></FoldPanel>
 <FoldPanel title="Analisi di mercato e ribassi" hint="Archivio, importazione e verifiche"><MarketInsights/></FoldPanel>
 </>;
}

function NoticeCard({ notice, profile, canEdit }: { notice: NoticeVersion; profile: Record<string, string>; canEdit: boolean }) {
 const n = notice.normalized;
 const match = commercialMatch({ title: n.title, description: '', territory: n.territories.join(', '), base_amount: 0 }, profile);
 const publicationDate = n.publication_date?.slice(0, 10) || '';
 return <article className="ga-source-impact">
  <div className="ga-assessment-head">
   <div><p>{n.publication_number} · {n.notice_type || 'Tipo da verificare'}</p><h3>{n.title}</h3></div>
   {n.demo && <Status tone="warning">Campione storico</Status>}
  </div>
  <p>{n.authority}</p>
  <dl className="ga-assessment-pair">
   <div><dt>Pubblicazione TED</dt><dd>{/^\d{4}-\d{2}-\d{2}$/.test(publicationDate) && Number.isFinite(Date.parse(publicationDate)) ? dateLabel(publicationDate) : 'Data da verificare'}</dd></div>
   <div><dt>Prima acquisizione locale</dt><dd>{notice.fetched_at ? dateLabel(notice.fetched_at) : 'Data da verificare'}</dd></div>
   <div><dt>Presentazione riportata</dt><dd>{n.deadline_dates.map(dateLabel).join(' · ') || 'Da leggere negli atti'}</dd></div>
   <div><dt>Valore stimato nell’avviso</dt><dd>{n.estimated_values.join(' · ') || 'Da verificare'} {n.currencies.join(', ')}</dd></div>
  </dl>
  {match.configured && <details className="ga-match-explanation"><summary>{match.reasons[0] || 'Pertinenza da valutare'}</summary>
   {[...match.reasons.slice(1), ...match.gaps].map(reason => <p key={reason}>{reason}</p>)}
  </details>}
  <div className="ga-desk-actions">
   <Status tone="warning">Disciplinare e allegati da acquisire</Status>
   {/^https?:\/\//.test(n.url) && <a href={n.url} target="_blank" rel="noopener noreferrer">Avviso ufficiale ↗</a>}
   {canEdit && <Link to={`/azienda/gare/nuova?avviso=${notice.id}`}>Rivedi dati e importa ↗</Link>}
  </div>
  {n.demo && <p>{n.coverage}</p>}
 </article>;
}
