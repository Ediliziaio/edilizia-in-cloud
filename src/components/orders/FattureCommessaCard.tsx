import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileText, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { OfficeSelect } from './OfficeSelect';
import { formatCurrency } from '@/lib/formatters';
import { incassoQuotaCommessa } from '@/lib/fatturazione/incassoQuotaCommessa';
import { documentoAnnullato, riepilogoFattureCommessa, statoIncassoDocumento, type FatturaCommessa } from '@/lib/orders/fattureCommessa';
import { isDocumentoEmesso, isNotaCredito, isTipoVendita } from '@/lib/fatturazione/registroVendite';
import type { Installment } from '@/lib/orderUtils';

const tipi: Record<string,string> = { fattura:'Fattura',fattura_pa:'Fattura PA',parcella:'Parcella',fattura_accompagnatoria:'Fattura accompagnatoria',acconto_fattura:'Fattura di acconto',acconto_parcella:'Acconto parcella',fattura_differita_b:'Fattura differita',fattura_riepilogativa:'Fattura riepilogativa',nota_credito:'Nota di credito',nota_debito:'Nota di debito',ddt:'DDT',proforma:'Proforma',preventivo:'Preventivo',invoice:'Fattura',credit_note:'Nota di credito' };
const dataIt = (v: string) => /^\d{4}-\d{2}-\d{2}/.test(v ?? '') ? v.slice(0,10).split('-').reverse().join('/') : '—';
export function FattureCommessaCard({ documents, installments, loading, error, onRetry, onDownload, actions, incassatoPiano }: {
  documents: FatturaCommessa[]; installments: Installment[]; loading?: boolean; error?: boolean;
  incassatoPiano?: number;
  onRetry: () => void; onDownload: (f: FatturaCommessa) => void; actions?: ReactNode;
}) {
  const [search,setSearch] = useState('');
  const [filter,setFilter] = useState('attive');
  const [kind,setKind] = useState('tutti');
  const stats = riepilogoFattureCommessa(documents);
  const deltaPiano = incassatoPiano == null ? 0 : Math.round((incassatoPiano - stats.incassato) * 100) / 100;
  const arrotondamento = Math.abs(deltaPiano) === 0.01 && installments.length > 0 && installments.every(i => i.is_paid && i.documento_fiscale_id);
  const copies = documents.reduce((n,f)=>n+(f.copie_importate?.length ?? 0),0);
  const counts = {
    attive: documents.filter(f=>!documentoAnnullato(f) && f.stato!=='stornata').length,
    aperte: documents.filter(f=>['Da incassare','Parziale'].includes(statoIncassoDocumento(f))).length,
    incassate: documents.filter(f=>statoIncassoDocumento(f)==='Incassata').length,
    bozze: documents.filter(f=>['bozza','draft'].includes(f.stato)).length,
    annullate: documents.filter(f=>documentoAnnullato(f) || f.stato==='stornata').length,
    tutti: documents.length,
  };
  const rows = [...documents].filter(f=>{
    const state = statoIncassoDocumento(f);
    const match = filter==='tutti' || filter==='attive' && !documentoAnnullato(f) && f.stato!=='stornata' || filter==='aperte' && ['Da incassare','Parziale'].includes(state) || filter==='incassate' && state==='Incassata' || filter==='bozze' && state==='Bozza' || filter==='annullate' && (documentoAnnullato(f) || f.stato==='stornata');
    const typeMatch = kind==='tutti' || kind==='fatture' && isTipoVendita(f.tipo) && !isNotaCredito(f.tipo) || kind==='credito' && isNotaCredito(f.tipo) || kind==='altri' && !isTipoVendita(f.tipo);
    const rate = installments.filter(i=>i.documento_fiscale_id===f.id).map(i=>i.label).join(' ');
    return match && typeMatch && `${f.numero} ${dataIt(f.data_emissione)} ${f.data_emissione} ${tipi[f.tipo] ?? f.tipo} ${state} ${rate}`.toLocaleLowerCase('it').includes(search.trim().toLocaleLowerCase('it'));
  }).sort((a,b)=>(b.data_emissione ?? '').localeCompare(a.data_emissione ?? '') || a.numero.localeCompare(b.numero, 'it', {numeric:true}) || a.id.localeCompare(b.id));
  const url = (f: FatturaCommessa) => f.origine==='importata' ? `/azienda/documenti/importata/${f.id}` : `/azienda/documenti/${f.id}/dettaglio`;
  return <section aria-label="Fatture e documenti del cliente" className="income-documents-card rounded-xl border bg-background">
    <div className="income-documents-header"><div><h3 className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 text-primary" aria-hidden />Fatture e documenti <span className="rounded-full border px-2 text-xs font-normal">{loading || error ? '—' : documents.length}</span></h3><p className="mt-1 text-xs text-muted-foreground">Documenti esistenti di questa commessa, con rate e incassi collegati.</p></div>{actions && <div className="income-document-actions">{actions}</div>}</div>
    {error ? <div role="alert" className="m-4 rounded-lg border border-amber-300 p-3 text-sm">Documenti non disponibili: i totali non sono stati calcolati.<Button variant="outline" size="sm" onClick={onRetry}>Riprova fatture</Button></div> : loading ? <Skeleton className="m-4 h-40" /> : <>
      <dl aria-label="Riepilogo fatture della commessa" className="income-documents-totals">
        <div><dt>Fatturato emesso</dt><dd>{formatCurrency(stats.fatturato)}</dd><small>IVA inclusa · al netto delle note di credito</small></div>
        <div><dt>Incassato sulle fatture</dt><dd>{formatCurrency(stats.incassato)}</dd><small>Già registrato sui documenti</small></div>
        <div><dt>Da incassare sulle fatture</dt><dd data-due={stats.residuo>0}>{formatCurrency(stats.residuo)}</dd><small>Escluse bozze e annullate</small></div>
      </dl>
      <div className="income-documents-filters">
        <div className="income-document-tabs" role="group" aria-label="Filtra fatture per stato">{([
          ['attive','Attive'],['aperte','Da incassare'],['incassate','Incassate'],['bozze','Bozze'],['annullate','Annullate e stornate'],['tutti','Tutte'],
        ] as const).map(([key,label])=><button type="button" key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}<span>{counts[key]}</span></button>)}</div>
        <div className="flex flex-wrap gap-2"><div className="relative min-w-0 flex-1 basis-64"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden /><Input aria-label="Cerca fattura della commessa" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cerca numero, data o rata…" className="pl-9 pr-8" />{search && <button type="button" className="absolute right-2 top-2 p-1" aria-label="Cancella ricerca fatture" onClick={()=>setSearch('')}><X className="h-4 w-4" aria-hidden /></button>}</div><OfficeSelect label="Tipo documento cliente" value={kind} onValueChange={setKind} className="income-document-kind" options={[{value:'tutti',label:'Tutti i documenti'},{value:'fatture',label:'Fatture e parcelle'},{value:'credito',label:'Note di credito'},{value:'altri',label:'Proforma, DDT e altri'}]} /></div>
        <p role="status" className="text-xs text-muted-foreground">{rows.length} di {documents.length} documenti{copies>0 ? ` · ${copies} copie importate riunite al documento corrispondente` : ''}</p>
      </div>
      {rows.length ? <div className="income-documents-table-wrap"><table className="income-documents-table"><caption className="sr-only">Fatture e documenti collegati alla commessa</caption><thead><tr><th>Documento</th><th>Rata collegata</th><th>Importo commessa</th><th>Incassato</th><th>Residuo</th><th><span className="sr-only">Azioni</span></th></tr></thead><tbody>{rows.map(f=>{
        const state=statoIncassoDocumento(f), quota=incassoQuotaCommessa(f), rates=installments.filter(i=>i.documento_fiscale_id===f.id);
        const cash = isTipoVendita(f.tipo) && !isNotaCredito(f.tipo) && isDocumentoEmesso(f.stato) && f.stato!=='stornata';
        const value=Number(f.importo_associato ?? f.totale_documento ?? f.totale_da_pagare);
        return <tr key={`${f.origine ?? 'nativa'}:${f.id}`} data-inactive={documentoAnnullato(f) || f.stato==='stornata'}>
          <td><Link className="font-medium text-primary hover:underline" to={url(f)}>{f.numero || 'Senza numero'}</Link><span className="mt-0.5 block text-xs text-muted-foreground">{tipi[f.tipo] ?? f.tipo} · {dataIt(f.data_emissione)}{f.origine==='importata' ? ' · importata' : ''}</span><span className="income-document-status" data-state={state}>{state}</span>{!!f.copie_importate?.length && <details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">{f.copie_da_verificare ? "Copie con dati diversi · verifica" : `Copia importata (${f.copie_importate.length})`}</summary>{f.copie_da_verificare && <p className="my-1 text-amber-800">Stato o incassi diversi tra le copie. I totali usano il documento nativo: verifica i due originali prima di registrare altri incassi.</p>}{f.copie_importate.map(copy=><Link className="mt-1 block text-primary hover:underline" key={copy.id} to={`/azienda/documenti/importata/${copy.id}`}>Apri {copy.numero}</Link>)}</details>}</td>
          <td>{rates.length ? rates.map(r=><span className="block" key={r.id}>{r.label}</span>) : <span className="text-xs text-muted-foreground">{isTipoVendita(f.tipo) && !isNotaCredito(f.tipo) ? 'Nessuna rata collegata' : '—'}</span>}</td>
          <td className="tabular-nums">{formatCurrency(isNotaCredito(f.tipo) ? -Math.abs(value) : value)}{f.importo_associato!=null && <small className="block text-xs text-muted-foreground">Quota della commessa</small>}</td>
          <td className="tabular-nums">{cash ? formatCurrency(quota.incassato) : '—'}</td><td className="tabular-nums" data-due={cash && quota.residuo>0}>{cash ? formatCurrency(quota.residuo) : '—'}</td>
          <td><div className="flex justify-end gap-1"><Button variant="outline" size="sm" asChild><Link to={url(f)}>Apri</Link></Button>{f.origine!=='importata' && <Button type="button" variant="ghost" size="icon" aria-label={`PDF ${f.numero}`} onClick={()=>onDownload(f)}><Download className="h-4 w-4" aria-hidden /></Button>}</div></td>
        </tr>;
      })}</tbody></table></div> : <div className="m-4 rounded-lg border border-dashed p-5 text-center text-sm"><p>{documents.length ? 'Nessun documento corrisponde ai filtri.' : 'Nessun documento fiscale collegato a questa commessa.'}</p>{documents.length>0 && <Button variant="link" size="sm" onClick={()=>{setFilter('tutti');setKind('tutti');setSearch('');}}>Mostra tutti i documenti</Button>}</div>}
      <p className="income-documents-footnote">{arrotondamento && <>Il piano rate include {formatCurrency(Math.abs(deltaPiano))} di arrotondamento rispetto agli incassi effettivi sulle fatture. </>}I totali leggono i documenti, indipendentemente dai filtri. Gli incassi sulle fatture e quelli del piano rate rappresentano gli stessi pagamenti e non si sommano.</p>
    </>}
  </section>;
}
