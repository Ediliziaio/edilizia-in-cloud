import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Search, X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { OfficeSelect } from './OfficeSelect';
import type { ContestoIncassiUnificati } from './FinancialSummary';
import type { FatturaCommessa } from '@/lib/orders/fattureCommessa';
import { riepilogoFattureCommessa } from '@/lib/orders/fattureCommessa';
import { incassoQuotaCommessa } from '@/lib/fatturazione/incassoQuotaCommessa';
import { ripartoIncassiScadenze } from '@/lib/fatturazione/scadenzeFattura';
import { isDocumentoEmesso, isNotaCredito, isTipoVendita } from '@/lib/fatturazione/registroVendite';
import { vociIncassi, statoVoceIncasso, voceAttiva, type VoceIncasso } from '@/lib/orders/elencoIncassi';
import { formatCurrency } from '@/lib/formatters';
import { useT } from '@/lib/campo/lingua/LinguaCampo';

export interface FattureIncassiDati {
  documents: FatturaCommessa[]; loading?: boolean; error?: boolean;
  documentUrl?: (f: FatturaCommessa) => string; canDownload?: boolean;
  onRetry: () => void; onDownload: (f: FatturaCommessa) => void; actions?: ReactNode;
}
const tipiDocumento: Record<string,string> = {fattura:'Fattura',fattura_pa:'Fattura PA',parcella:'Parcella',fattura_accompagnatoria:'Fattura accompagnatoria',acconto_fattura:'Fattura di acconto',acconto_parcella:'Acconto parcella',fattura_differita_b:'Fattura differita',fattura_riepilogativa:'Fattura riepilogativa',nota_credito:'Nota di credito',nota_debito:'Nota di debito',ddt:'DDT',proforma:'Proforma',preventivo:'Preventivo',invoice:'Fattura',credit_note:'Nota di credito'};
const dataIt = (v?: string | null) => v ? v.slice(0,10).split('-').reverse().join('/') : '—';
const urlDocumentoIncasso = (d: FatturaCommessa) => d.origine === 'importata' ? `/azienda/documenti/importata/${d.id}` : `/azienda/documenti/${d.id}/dettaglio`;

export function DettaglioFatturaIncasso({ documento: d, onDownload, rataIncassata, documentUrl, canDownload = true }: {documentUrl?: (f: FatturaCommessa) => string; canDownload?: boolean; rataIncassata?: boolean; documento: FatturaCommessa; onDownload: (d:FatturaCommessa)=>void}) {
  const t = useT();
  const href = documentUrl?.(d) ?? urlDocumentoIncasso(d);
  const cash = isTipoVendita(d.tipo) && !isNotaCredito(d.tipo) && isDocumentoEmesso(d.stato) && d.stato !== 'stornata';
  const quota = incassoQuotaCommessa(d);
  const importo = Number(d.importo_associato ?? d.totale_documento ?? d.totale_da_pagare);
  const scadenze = Array.isArray(d.scadenze_pagamento) ? d.scadenze_pagamento.filter(Boolean) : [];
  const mostraScadenze = scadenze.length > 1 && isTipoVendita(d.tipo) && !isNotaCredito(d.tipo);
  // Ogni scadenza è della fattura intera, anche quando la commessa ne mostra solo una quota.
  const incassiPerScadenza = mostraScadenze && cash ? ripartoIncassiScadenze(scadenze, incassoQuotaCommessa({
    totale_da_pagare: d.totale_da_pagare, importo_pagato: d.importo_pagato, stornato: d.stornato,
  })) : null;
  return <div className="income-linked-document">
    <div className="income-linked-document-info"><Link to={href} className="inline-flex items-center gap-1 font-medium text-primary hover:underline"><FileText className="h-3.5 w-3.5" aria-hidden />{tipiDocumento[d.tipo] ? t(tipiDocumento[d.tipo]) : d.tipo} {d.numero || t("senza numero")}</Link><span className="text-xs text-muted-foreground">{dataIt(d.data_emissione)}{rataIncassata === undefined || statoVoceIncasso({key:d.id,documento:d}) !== (rataIncassata ? 'Incassata' : 'Da incassare') ? ` · ${t(statoVoceIncasso({key:d.id,documento:d}))}` : ''}</span>
      {!!d.copie_importate?.length && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">{d.copie_da_verificare ? t("Copie da verificare") : t("Altra copia del documento")}</summary>{d.copie_da_verificare && <p className="text-amber-800">{t("Numero, stato o incassi diversi: verifica gli originali. I totali leggono il documento nativo.")}</p>}{d.copie_importate.map(c=><Link className="block text-primary hover:underline" key={c.id} to={`/azienda/documenti/importata/${c.id}`}>{t("Apri copia importata {numero}", { numero: c.numero })}</Link>)}</details>}
    </div>
    <dl aria-label={t("Incassi fattura {numero}", { numero: d.numero })} className="income-linked-document-money" data-saldata={cash && quota.residuo <= 0 ? "" : undefined}><div><dt>{t("Importo fattura")}</dt><dd>{formatCurrency(isNotaCredito(d.tipo) ? -Math.abs(importo) : importo)}</dd></div><div><dt>{t("Incassato")}</dt><dd>{cash ? formatCurrency(quota.incassato) : '—'}</dd></div><div><dt>{t("Residuo")}</dt><dd data-due={cash && quota.residuo>0}>{cash ? formatCurrency(quota.residuo) : '—'}</dd></div></dl>
    <div className="income-linked-document-actions"><Button variant="outline" size="sm" asChild><Link to={href}>{cash ? (quota.residuo > 0 ? t("Registra incasso") : t("Vedi incassi")) : t("Apri")}</Link></Button>{canDownload && d.origine!=='importata' && <Button type="button" variant="ghost" size="icon" aria-label={`PDF ${d.numero}`} onClick={()=>onDownload(d)}><Download className="h-4 w-4" aria-hidden /></Button>}</div>
    {mostraScadenze && (
      <div className="income-invoice-schedule">
        <span className="text-muted-foreground">{t("Scadenze della fattura")}</span>
        <ul aria-label={t("Scadenze fattura {numero}", { numero: d.numero })} className="flex flex-wrap gap-1.5">
          {scadenze.map((scadenza, indice) => {
            const incasso = incassiPerScadenza?.get(indice);
            const residuo = incasso ? incasso.esigibile - incasso.incassato : 0;
            const stato = !incasso ? null : incasso.esigibile === 0 ? 'Stornata'
              : residuo === 0 ? 'Pagata' : incasso.incassato > 0 ? 'Parziale' : 'Da incassare';
            const importoScadenza = incasso && incasso.esigibile > 0 ? incasso.esigibile / 100 : scadenza.importo;
            return (
              <li key={indice} className="rounded border px-2 py-0.5 tabular-nums">
                <span className="text-muted-foreground">{dataIt(scadenza.data_scadenza)}</span>{' · '}
                <span className="font-medium">{formatCurrency(importoScadenza)}</span>
                {stato && <span className="income-invoice-due-status" data-status={stato}>
                  {t(stato)}{stato === 'Parziale' && ` · ${t("Restano {importo}", { importo: formatCurrency(residuo / 100) })}`}
                </span>}
              </li>
            );
          })}
        </ul>
      </div>
    )}
  </div>;
}
export function FattureIncassiElenco({ documents, loading, error, onRetry, onDownload, actions, piano, documentUrl, canDownload }: FattureIncassiDati & {piano: ContestoIncassiUnificati}) {
  const t = useT();
  const [search,setSearch] = useState('');
  const [filter,setFilter] = useState('attive');
  const [kind,setKind] = useState('tutti');
  const all = vociIncassi(piano.rate,documents);
  const stats = riepilogoFattureCommessa(documents);
  const incassatoEffettivo = piano.incassatoEffettivo ?? piano.incassatoPiano;
  const residuoPiano = piano.daIncassareEffettivo ?? piano.daIncassarePiano;
  const residuoVisibile = Math.max(residuoPiano, stats.residuo);
  const residuoContratto = Math.max(0, Math.round((piano.totalePiano-incassatoEffettivo)*100)/100);
  const fattureOltrePiano = stats.residuo > residuoContratto + 0.005;
  const fatturatoOltreContratto = Math.max(0, Math.round((stats.fatturato-piano.totalePiano)*100)/100);
  const incassatoOltreContratto = Math.max(0, Math.round((incassatoEffettivo-piano.totalePiano)*100)/100);
  const matchState = (v:VoceIncasso,key:string) => key==='tutte' || key==='attive' && voceAttiva(v) || key==='aperte' && ['Da incassare','Parziale'].includes(statoVoceIncasso(v)) || key==='incassate' && statoVoceIncasso(v)==='Incassata' || key==='annullate' && !voceAttiva(v);
  const counts = Object.fromEntries(['attive','aperte','incassate','annullate','tutte'].map(k=>[k,all.filter(v=>matchState(v,k)).length]));
  const shown = all.filter(v=>{
    const d=v.documento;
    const matchKind=kind==='tutti' || kind==='senza_fattura' && !!v.rata && !v.rata.documento_fiscale_id && !d || kind==='senza_rata' && !v.rata && !!d && isTipoVendita(d.tipo) && !isNotaCredito(d.tipo) || kind==='fatture' && ((!!d && isTipoVendita(d.tipo) && !isNotaCredito(d.tipo)) || !!v.rata?.documento_fiscale_id) || kind==='altri' && !!d && (!isTipoVendita(d.tipo) || isNotaCredito(d.tipo));
    return matchState(v,filter) && matchKind && `${v.rata?.label ?? ''} ${d?.numero ?? v.rata?.fattura?.numero ?? ''} ${dataIt(d?.data_emissione)} ${d?.data_emissione ?? ''} ${statoVoceIncasso(v)}`.toLocaleLowerCase('it').includes(search.trim().toLocaleLowerCase('it'));
  });
  const rounding=Math.round((piano.incassatoPiano-stats.incassato)*100)/100;
  return <section aria-label={t("Fatture e incassi della commessa")} className="income-documents-card income-unified rounded-xl border bg-background">
    <div className="income-documents-header"><div><h3 className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 text-primary" aria-hidden />{t("Fatture e incassi")}</h3><p className="mt-1 text-xs text-muted-foreground">{t("Rate, fatture anche senza rata e tutti i relativi incassi. Importi IVA inclusa.")}</p></div><div className="income-document-actions">{actions}{piano.comandiBanca}</div></div>
    {loading ? <Skeleton className="m-4 h-40" /> : error ? <div role="alert" className="m-4 rounded-lg border border-amber-300 p-3 text-sm">{t("Fatture e incassi non disponibili: riprova prima di gestire i collegamenti.")}<Button variant="outline" size="sm" onClick={onRetry}>{t("Riprova fatture")}</Button></div> : <>
      <dl aria-label={t("Riepilogo fatture e incassi")} className="income-documents-totals income-unified-totals"><div><dt>{t("Contratto")}</dt><dd>{formatCurrency(piano.totalePiano)}</dd><small>{t("Totale del piano cliente")}</small></div><div><dt>{t("Fatturato emesso")}</dt><dd>{formatCurrency(stats.fatturato)}</dd><small>{t("Al netto delle note di credito")}</small></div><div><dt>{t("Incassato")}</dt><dd>{formatCurrency(piano.incassatoEffettivo ?? piano.incassatoPiano)}</dd><small>{(piano.incassatoEffettivo ?? piano.incassatoPiano) !== stats.incassato ? t("Sulle fatture: {importo}", { importo: formatCurrency(stats.incassato) }) : t("Incassi effettivamente registrati")}</small></div><div><dt>{fattureOltrePiano ? t("Da incassare") : t("Da incassare sul piano")}</dt><dd data-due={residuoVisibile>0}>{formatCurrency(residuoVisibile)}</dd><small>{fattureOltrePiano && <>{t("Dal contratto: {importo}", { importo: formatCurrency(residuoContratto) })} · </>}{t("Su fatture emesse: {importo}", { importo: formatCurrency(stats.residuo) })}</small></div></dl>
      {(fatturatoOltreContratto>0 || incassatoOltreContratto>0 || stats.residuo>residuoPiano+0.005) && <section aria-label={t("Fatture e incassi aggiuntivi")} className="mx-4 mb-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-sm"><div className="flex flex-wrap gap-x-6 gap-y-2">{fatturatoOltreContratto>0 && <p>{t("Fatturato oltre il contratto:")} <strong>{formatCurrency(fatturatoOltreContratto)}</strong></p>}{incassatoOltreContratto>0 && <p>{t("Incassato oltre il contratto:")} <strong>{formatCurrency(incassatoOltreContratto)}</strong></p>}<p>{t("Residuo delle fatture emesse:")} <strong>{formatCurrency(stats.residuo)}</strong></p></div><p className="mt-1 text-xs text-muted-foreground">{t("Il contratto comprende le varianti approvate. Le fatture aggiuntive restano visibili e incassabili anche senza una rata collegata.")}</p></section>}
      <div className="income-documents-filters"><div className="income-document-tabs" role="group" aria-label={t("Filtra rate e fatture")}>{([['attive','Attive'],['aperte','Da incassare'],['incassate','Incassate'],['annullate','Annullate e stornate'],['tutte','Tutte']] as const).map(([k,label])=><button type="button" key={k} aria-pressed={filter===k} onClick={()=>setFilter(k)}>{t(label)}<span>{counts[k]}</span></button>)}</div><div className="flex flex-wrap gap-2"><div className="relative min-w-0 flex-1 basis-64"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden /><Input aria-label={t("Cerca rata o fattura")} value={search} onChange={e=>setSearch(e.target.value)} placeholder={t("Cerca rata, numero fattura o data…")} className="pl-9 pr-9"/>{search && <button type="button" aria-label={t("Cancella ricerca incassi")} className="absolute right-2 top-2 p-1" onClick={()=>setSearch('')}><X className="h-4 w-4" aria-hidden /></button>}</div><OfficeSelect label={t("Mostra rate e documenti")} value={kind} onValueChange={setKind} className="income-document-kind" options={[{value:'tutti',label:t("Rate e documenti")},{value:'senza_fattura',label:t("Rate senza fattura")},{value:'senza_rata',label:t("Fatture senza rata")},{value:'fatture',label:t("Con fattura")},{value:'altri',label:t("Altri documenti e note di credito")}]}/></div><p role="status" className="text-xs text-muted-foreground">{t("{n} di {totale} voci · ogni fattura è mostrata una sola volta", { n: shown.length, totale: all.length })}</p></div>
      {shown.length ? <ul aria-label={t("Rate e fatture del cliente")} className="income-unified-list">{shown.map(v=>v.rata ? piano.renderRata(v.rata,v.documento ? <DettaglioFatturaIncasso documentUrl={documentUrl} canDownload={canDownload} documento={v.documento} onDownload={onDownload} rataIncassata={v.rata.is_paid}/> : undefined) : <li key={v.key} className="income-unlinked-row"><p className="mb-2 text-xs text-muted-foreground">{t("Documento senza rata collegata")}</p><DettaglioFatturaIncasso documentUrl={documentUrl} canDownload={canDownload} documento={v.documento!} onDownload={onDownload}/></li>)}</ul> : <div className="m-4 rounded-lg border border-dashed p-5 text-center text-sm"><p>{t("Nessuna voce corrisponde ai filtri.")}</p><Button variant="link" size="sm" onClick={()=>{setFilter('tutte');setKind('tutti');setSearch('');}}>{t("Mostra tutte le voci")}</Button></div>}
      <details className="income-unified-plan"><summary className="cursor-pointer text-sm font-medium">{t("Come collegare fatture, rate e SAL")}</summary>
        <div className="space-y-2 pt-3 text-sm text-muted-foreground">
          <p><strong className="text-foreground">{t("Commessa:")}</strong> {t("collega la fattura al lavoro a cui si riferisce. Il collegamento non registra un pagamento.")}</p>
          <p><strong className="text-foreground">{t("Rata senza fattura:")}</strong> {t("resta nel piano previsto. «Collega fattura» abbina un documento già esistente della commessa; non ne crea uno nuovo.")}</p>
          <p><strong className="text-foreground">{t("Incassi parziali:")}</strong> {t("apri «Registra incasso» e indica ogni versamento sulla stessa fattura. Ad esempio, su 1.000 €: 300 € + 400 € incassati, 300 € ancora da incassare. Se il movimento è già registrato, abbina il bonifico a quello senza aggiungere un altro incasso.")}</p>
          <p><strong className="text-foreground">{t("Fattura unica:")}</strong> {t("può ricevere più versamenti. Usa «Ripartisci fattura su più rate»: scegli il documento e le rate che ne coprono il totale. Gli incassi coprono le quote nell’ordine del piano, senza creare altre fatture o pagamenti.")}</p>
          <p><strong className="text-foreground">SAL:</strong> {t("da «Fattura» scegli un verbale emesso. Si prepara una bozza per la quota nuova rispetto al SAL precedente, oppure per il netto del certificato di pagamento. Controlla la bozza prima dell’emissione; un SAL già fatturato non va fatturato nuovamente.")}</p>
        </div>
      </details>
      <details className="income-unified-plan"><summary className="cursor-pointer text-sm font-medium">{t("Contratto e dettagli del piano")}</summary>{piano.notePiano}</details>
      <p className="income-documents-footnote">{t("I totali restano riferiti all’intera commessa.")}{Math.abs(rounding)===0.01 && piano.rate.every(r=>r.is_paid && r.documento_fiscale_id) ? ` ${t("Il piano comprende {importo} di arrotondamento rispetto agli incassi sulle fatture.", { importo: formatCurrency(Math.abs(rounding)) })}` : ''}</p>
    </>}
  </section>;
}
