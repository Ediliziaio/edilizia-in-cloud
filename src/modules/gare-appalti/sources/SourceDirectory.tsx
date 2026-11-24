import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, FileSpreadsheet, Radar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWorkspace } from '../WorkspaceContext';
import { Panel, Status } from '../components';
import { dateLabel, money } from '../domain';
import { matchingCatalogLots, portals, readAnacCatalog, tenderForCig } from './catalog';

export function SourceDirectory({ tedEnabled }: { tedEnabled: boolean }) {
 const { data, canEdit } = useWorkspace();
 const [catalog, setCatalog] = useState<ReturnType<typeof readAnacCatalog> | null>(null);
 const [filename, setFilename] = useState('');
 const [query, setQuery] = useState('');
 const [error, setError] = useState('');
 const [busy, setBusy] = useState(false);
 const [page, setPage] = useState(0);
 const rows = useMemo(() => catalog ? matchingCatalogLots(catalog.lots,query) : [],[catalog,query]);

 async function load(file: File) {
  setError(''); setBusy(true);
  try {
   if (file.size > 18_000_000) throw Error('File oltre 18 MB. Usa un estratto del catalogo.');
   const next = readAnacCatalog(await file.text());
   if (!next.lots.length) throw Error('Il file non contiene righe con CIG e oggetto validi.');
   setCatalog(next); setFilename(file.name); setQuery(''); setPage(0);
  } catch (e) { setError(e instanceof Error ? e.message : 'File non leggibile.'); }
  finally { setBusy(false); }
 }

 return <>
  <Panel className="mb-4" title="Cerca sulle fonti ufficiali" description="Apri la fonte, verifica l’avviso e acquisisci la procedura.">
   <div className="ga-discovery-sources">
    {portals.map(portal => <article key={portal.key}>
     <h3>{portal.label}</h3><p>{portal.description}</p>
     <div><a href={portal.url} target="_blank" rel="noopener noreferrer">Cerca sul portale <ArrowUpRight size={13}/></a>
      {canEdit && <Link to={`/azienda/gare/nuova?fonte=${portal.key}`}>Acquisisci gara</Link>}
     </div>
    </article>)}
    <article><h3>TED · Avvisi europei</h3><p>Avvisi pubblicati su TED, consultabili anche dal portale ufficiale.</p>
     <div><a href="https://ted.europa.eu/it/search/result" target="_blank" rel="noopener noreferrer">Cerca su TED <ArrowUpRight size={13}/></a>
      {tedEnabled && <a href="#gare-ted-search">Consulta API <Radar size={13}/></a>}
     </div>
    </article>
   </div>
  </Panel>
  <Panel className="mb-4" title="Cerca nel catalogo ANAC" description="Leggi un CSV scaricato dagli Open Data e scegli la gara da acquisire."
   action={<Button size="sm" variant="outline" asChild><a href="https://dati.anticorruzione.it/opendata" target="_blank" rel="noopener noreferrer">Apri Open Data <ArrowUpRight size={13}/></a></Button>}>
   <div className="ga-catalog-inputs">
    <label><span><FileSpreadsheet size={15}/>File CSV ANAC</span>
     <Input type="file" accept=".csv,text/csv" aria-label="File CSV ANAC" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void load(file);e.target.value='';}}/>
    </label>
    {catalog && <label><span>Cerca nel file</span><Input aria-label="Cerca nel catalogo per CIG o oggetto" value={query} placeholder="CIG, oggetto, ente o territorio" onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label>}
   </div>
   {busy&&<p role="status" className="mt-2 text-sm">Lettura del CSV…</p>}
   {error&&<p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
   {catalog&&<>
    <p className="ga-catalog-caption" role="status">{filename} · {rows.length} {rows.length===1?'risultato':'risultati'} su {catalog.lots.length}{catalog.discarded>0&&` · ${catalog.discarded} righe escluse per CIG duplicato o dati incompleti`}</p>
    {rows.slice(page*10,page*10+10).map(lot=>{
     const existing=tenderForCig(data,lot.cig);
     return <article className="ga-catalog-row" key={lot.cig}>
      <div><Status tone={existing?'success':'blue'}>{lot.cig}</Status><h3>{lot.tenderTitle}</h3>
       <p>{[lot.title!==lot.tenderTitle?lot.title:'',lot.authority,lot.territory,lot.amount?`${money(lot.amount)} per il lotto`:'',lot.deadline?`Termine riportato ${dateLabel(lot.deadline)}`:''].filter(Boolean).join(' · ')||'Leggi gli atti per completare i dati'}</p>
      </div>
      {existing ? <Button size="sm" variant="outline" asChild><Link to={`/azienda/gare/procedure/${existing.id}`}>Apri gara in archivio</Link></Button>
       : canEdit && <Button size="sm" variant="outline" asChild><Link to="/azienda/gare/nuova?fonte=ANAC_DATA" state={{ catalogLot: lot }}>Verifica e acquisisci</Link></Button>}
     </article>;
    })}
    {rows.length>10&&<div className="flex flex-wrap items-center gap-3 pt-3 text-xs">
     <Button variant="outline" size="sm" disabled={page===0} onClick={()=>setPage(page-1)}>Precedente</Button>
     <span>Pagina {page+1} di {Math.ceil(rows.length/10)}</span>
     <Button variant="outline" size="sm" disabled={(page+1)*10>=rows.length} onClick={()=>setPage(page+1)}>Successiva</Button>
    </div>}
   </>}
  </Panel>
 </>;
}
