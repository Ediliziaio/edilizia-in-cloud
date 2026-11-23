/**
 * Il contratto letto dall'AI, come si guarda prima di applicarlo (17/11/2026, bozza approvata):
 * in testa chi, a chi e quanto (quattro numeri); a sinistra le schede (voci, rate, fasi, note a mano,
 * cliente); a destra UN elenco di cosa controllare e dove ogni valore sta nel PDF. Prima c'erano un
 * riassunto lungo, «Affidabilità 90%» (il voto che l'AI dà a sé stessa) e gli stessi avvisi due volte.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ModificaArticoli, ModificaDate, ModificaFasi, ModificaImporto, ModificaPagamento } from "./ModificaContratto";
import { ETICHETTA_PARTE, ORDINE_PARTI, partiPresenti, type ParteContratto } from "@/lib/orders/sceltaContratto";
import { AlertTriangle, Check, CheckCircle2, FileText, Pencil } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { articoliDalContratto, contractImponibile, contractSommaVoci, fasiDaCapitoli, vociDaComprare, type ContractExtract } from "@/lib/orders/contractExtract";
import { ETICHETTA_NATURA, siCompra } from "@/lib/orders/naturaVoce";
import type { VerificaNelTesto } from "@/lib/orders/contrattoNelTesto";
import { avvisiDaControllare } from "@/lib/orders/avvisiContratto";
import { cn } from "@/lib/utils";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
import { FasiDelDocumento } from "./FasiDelDocumento";
import { pianoOperativoContratto } from "@/lib/orders/pianoOperativoContratto";

const NATURA: Record<string, string> = {
  contratto_cliente: "Contratto", offerta_fornitore: "Offerta del fornitore", copia_commissione: "Copia commissione",
};

const data = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : null);

function Numero({ etichetta, valore, sotto }: { etichetta: string; valore: string; sotto?: string | null }) {
  return (
    <div className="min-w-0 rounded-md bg-muted/50 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{etichetta}</p>
      <p className="truncate text-base font-semibold tabular-nums">{valore}</p>
      {sotto && <p className="truncate text-[11px] text-muted-foreground">{sotto}</p>}
    </div>
  );
}

const SPIEGA: Record<ParteContratto, string> = {
  importo: "importo e IVA della commessa", lavorazioni: "diventano le fasi con le loro lavorazioni", articoli: "solo i materiali diventano articoli da ordinare",
  pagamento: "diventano le rate", date: "inizio e fine dei lavori", note: "nelle note interne", cliente: "anagrafica e indirizzo del cantiere",
};

export function RisultatoLettura({ extract, verifica, testoDocumento, daConfermare = [], dopoDati, extraAvvisi = [], scelte, onScelta, onModifica, pianoCollegato }: {
  pianoCollegato?: ReactNode;
  extract: ContractExtract;
  verifica: VerificaNelTesto | null;
  /** Il testo del PDF (null per le scansioni o le foto). */
  testoDocumento: string | null;
  /** Cosa si conferma dopo, nel modulo (cliente, fasi, date…). */
  daConfermare?: string[];
  /** Blocchi propri della destinazione (dati d'appalto, RDO), sotto le schede. */
  dopoDati?: ReactNode;
  extraAvvisi?: string[];
  /** Le parti che entrano nella commessa; senza, la finestra non chiede (sola lettura). */
  scelte?: ReadonlySet<ParteContratto>;
  onScelta?: (parte: ParteContratto, si: boolean) => void;
  /** Con questa, ogni scheda si può correggere prima di applicare. */
  onModifica?: (e: ContractExtract) => void;
}) {
  const tr = useT();
  const imponibile = contractImponibile(extract);
  const iva = extract.iva_pct != null && imponibile != null ? Math.round(imponibile * extract.iva_pct) / 100 : null;
  const totale = extract.importo_totale_ivato_eur ?? (imponibile != null && iva != null ? imponibile + iva : null);
  const somma = contractSommaVoci(extract);
  const note = extract.note_a_mano ?? [];
  const pos = extract.posizioni_allegato ?? [];
  const fasi = extract.fasi_lavoro ?? [];
  const avvisi = useMemo(() => avvisiDaControllare(extract, verifica, testoDocumento, extraAvvisi), [extract, verifica, testoDocumento, extraAvvisi]);
  const trovati = verifica && !verifica.senzaTesto ? verifica.campi.filter((c) => c.pagina != null) : [];
  // Chi può correggere vede anche le schede vuote che si riempiono a mano (fasi, date).
  const presenti = partiPresenti(extract);
  const parti = onModifica ? ORDINE_PARTI.filter((k) => presenti.includes(k) || k === "lavorazioni" || k === "date") : presenti;
  const [scheda, setScheda] = useState<ParteContratto | null>(null);
  const attiva = scheda && parti.includes(scheda) ? scheda : parti[0];
  const [inModifica, setInModifica] = useState(false);
  const capitoli = fasiDaCapitoli(extract.voci, extract.origine_lettura === "computo" ? 80 : 15, extract.origine_lettura === "computo" ? 1000 : 30);
  const etichetta = (k: ParteContratto) => k === "articoli" && extract.origine_lettura === "computo" ? tr("Voci di lavoro") : tr(ETICHETTA_PARTE[k]);
  const modificabile = !!onModifica && (["importo", "lavorazioni", "articoli", "pagamento", "date"] as ParteContratto[]).includes(attiva);
  const conteggi: Partial<Record<ParteContratto, string>> = {
    lavorazioni: fasi.length ? String(fasi.length) : undefined,
    // Si contano gli articoli che nascerebbero: i materiali, non lavori, servizi e sconti.
    articoli: extract.origine_lettura === "computo" ? String(extract.voci.length) : pianoCollegato ? String(pianoOperativoContratto(extract).materiali.length) : String((() => { const a = articoliDalContratto(extract); return a.posizioni.length + a.voci.length; })()),
    pagamento: extract.fasi_pagamento.length ? String(extract.fasi_pagamento.length) : undefined,
    note: note.length ? String(note.length) : undefined,
  };

  const durata = extract.data_inizio_lavori && extract.data_fine_lavori ? `${data(extract.data_inizio_lavori)} → ${data(extract.data_fine_lavori)}` : null;
  const tornano = imponibile != null && somma > 0 && Math.abs(somma - imponibile) <= Math.max(1, imponibile * 0.02);
  const piuGiorni = (iso: string, g: number) => { const d = new Date(`${iso.slice(0, 10)}T12:00:00`); d.setDate(d.getDate() + g); return d.toLocaleDateString(intlCampo(), { day: "2-digit", month: "2-digit", year: "numeric" }); };
  // Le date scritte nel documento (o ricavate da una data e dei giorni scritti): mai inventate.
  const date: [string, string][] = ([
    [tr("Documento"), data(extract.data_documento)],
    [tr("Firma"), extract.firma?.presente ? data(extract.firma.data) : null],
    [tr("Inizio lavori"), data(extract.data_inizio_lavori)],
    [tr("Fine lavori"), data(extract.data_fine_lavori)],
    [tr("Offerta valida fino al"), extract.data_documento && extract.validita_offerta_giorni ? `${piuGiorni(extract.data_documento, extract.validita_offerta_giorni)} (${tr("{n} gg", { n: extract.validita_offerta_giorni })})` : null],
    [tr("Consegna"), extract.consegna_giorni ? `${tr("{n} giorni", { n: extract.consegna_giorni })}${extract.data_documento ? ` · ${tr("circa il {data}", { data: piuGiorni(extract.data_documento, extract.consegna_giorni) })}` : ""}` : null],
  ] as [string, string | null][]).filter((x): x is [string, string] => !!x[1]);

  return (
    <div className="space-y-3">
      {/* Chi, a chi, quanto. */}
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h3 className="text-sm font-semibold">
            {tr(NATURA[extract.natura_documento ?? ""] ?? "Documento")}{data(extract.data_documento) ? ` ${tr("del {data}", { data: data(extract.data_documento) ?? "" })}` : ""}
            {extract.fornitore_emittente ? ` · ${extract.fornitore_emittente}` : ""}{extract.cliente.nome_completo ? ` → ${extract.cliente.nome_completo}` : ""}
          </h3>
          {extract.firma && (
            <span className={cn("ml-auto text-xs", extract.firma.presente ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300")}>
              {extract.firma.presente
                ? <><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" aria-hidden />{tr("firmato")}{extract.firma.firmatario ? ` ${tr("da {nome}", { nome: extract.firma.firmatario })}` : ""}{data(extract.firma.data) ? ` ${tr("il {data}", { data: data(extract.firma.data) ?? "" })}` : ""}</>
                : tr("firma del cliente non vista")}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Numero etichetta={tr("Imponibile")} valore={imponibile != null ? formatCurrency(imponibile) : "—"} />
          <Numero etichetta={tr("IVA")} valore={extract.iva_pct != null ? `${extract.iva_pct}%` : tr("non scritta")} sotto={iva != null ? formatCurrency(iva) : null} />
          <Numero etichetta={tr("Totale")} valore={totale != null ? formatCurrency(totale) : "—"} />
          <Numero etichetta={durata ? tr("Lavori") : tr("Pagamento")} valore={durata ?? (extract.fasi_pagamento.length ? tr("{n} rate", { n: extract.fasi_pagamento.length }) : extract.modalita_pagamento ?? tr("non scritto"))}
            sotto={durata ? null : extract.fasi_pagamento.length ? extract.modalita_pagamento : null} />
        </div>
      </header>

      <div className="grid gap-3 rounded-lg border lg:grid-cols-[minmax(0,1fr)_16rem]">
        <section aria-label={tr("Cosa ho letto")} className="min-w-0 space-y-2 p-3">
          <div role="tablist" aria-label={tr("Parti del documento")} className="flex flex-wrap gap-1.5">
            {parti.map((k) => {
              const sel = k === attiva;
              const applicata = !scelte || scelte.has(k);
              return (
                <button key={k} type="button" role="tab" aria-selected={sel} onClick={() => { setScheda(k); setInModifica(false); }}
                  className={cn("flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors", sel ? "border-primary/40 bg-primary/10 font-medium text-primary" : "hover:bg-muted", !applicata && "text-muted-foreground line-through decoration-muted-foreground/60")}>
                  {scelte && <span className={cn("h-1.5 w-1.5 rounded-full", applicata ? "bg-emerald-500" : "bg-muted-foreground/40")} aria-hidden />}
                  {etichetta(k)}{conteggi[k] ? <span className="font-normal text-muted-foreground">{conteggi[k]}</span> : null}
                </button>
              );
            })}
          </div>

          <div role="tabpanel" aria-label={etichetta(attiva)} className="space-y-2">
            {(scelte && onScelta) || modificabile ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs">
                {scelte && onScelta && (
                  <label className="flex flex-wrap items-center gap-2">
                    <Checkbox checked={scelte.has(attiva)} onCheckedChange={(v) => onScelta(attiva, v === true)} aria-label={tr("Applica alla commessa: {parte}", { parte: etichetta(attiva) })} />
                    <span className="font-medium">{tr("Applica alla commessa")}</span>
                    <span className="text-muted-foreground">{attiva === "articoli" && extract.origine_lettura === "computo" ? tr("le voci si scompongono nei materiali dopo la creazione") : tr(SPIEGA[attiva])}</span>
                  </label>
                )}
                {modificabile && (
                  <Button type="button" size="sm" variant={inModifica ? "default" : "outline"} className="ml-auto h-7 text-xs" onClick={() => setInModifica((v) => !v)}>
                    {inModifica ? <><Check className="mr-1 h-3.5 w-3.5" aria-hidden />{tr("Fatto")}</> : <><Pencil className="mr-1 h-3.5 w-3.5" aria-hidden />{tr("Modifica")}</>}
                  </Button>
                )}
              </div>
            ) : null}
            {onModifica && attiva === "lavorazioni" && capitoli.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed px-2.5 py-1.5 text-xs">
                <span className="min-w-0 flex-1">{tr("Gli articoli sono divisi in {n} capitoli: possono diventare le fasi, con le loro lavorazioni.", { n: capitoli.length })}</span>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => onModifica({ ...extract, fasi_lavoro: capitoli })}>
                  {tr("Crea le fasi dai capitoli")}
                </Button>
              </div>
            )}
            {inModifica && onModifica ? (
              attiva === "importo" ? <ModificaImporto extract={extract} onModifica={onModifica} />
                : attiva === "lavorazioni" ? <ModificaFasi extract={extract} onModifica={onModifica} />
                : attiva === "articoli" ? <ModificaArticoli extract={extract} onModifica={onModifica} />
                : attiva === "pagamento" ? <ModificaPagamento extract={extract} onModifica={onModifica} />
                : <ModificaDate extract={extract} onModifica={onModifica} />
            ) : <>
            {attiva === "importo" && (
              <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-xs">
                <dt className="text-muted-foreground">{tr("Imponibile")}</dt><dd className="tabular-nums">{imponibile != null ? formatCurrency(imponibile) : "—"}</dd>
                <dt className="text-muted-foreground">{tr("IVA")}</dt><dd className="tabular-nums">{extract.iva_pct != null ? `${extract.iva_pct}%${iva != null ? ` · ${formatCurrency(iva)}` : ""}` : tr("non scritta")}</dd>
                <dt className="text-muted-foreground">{tr("Totale")}</dt><dd className="tabular-nums">{totale != null ? formatCurrency(totale) : "—"}</dd>
                {extract.sconto_globale_pct != null && <><dt className="text-muted-foreground">{tr("Sconto")}</dt><dd>{extract.sconto_globale_pct}%</dd></>}
                {extract.altri_costi.map((c, i) => <div key={i} className="contents"><dt className="text-muted-foreground">{c.descrizione}</dt><dd className="tabular-nums">{formatCurrency(c.importo_eur)}</dd></div>)}
              </dl>
            )}
            {attiva === "lavorazioni" && pianoCollegato}
            {attiva === "lavorazioni" && !pianoCollegato && fasi.length === 0 && <p className="text-xs text-muted-foreground">{tr("Il documento non elenca fasi di lavoro: creale dai capitoli o con «Modifica».")}</p>}
            {attiva === "lavorazioni" && !pianoCollegato && fasi.length > 0 && (
              <FasiDelDocumento fasi={fasi} />
            )}
            {attiva === "articoli" && extract.origine_lettura === "computo" && <p className="rounded-md border bg-muted/40 p-3 text-xs">{tr("{n} voci di lavoro lette. I materiali da acquistare si ricavano da «Genera dal computo», dopo la creazione della commessa: le lavorazioni non sono una lista della spesa.", { n: extract.voci.length })}</p>}
            {attiva === "articoli" && pianoCollegato}
            {attiva === "articoli" && !pianoCollegato && extract.origine_lettura !== "computo" && (<>
              {extract.voci.length > 0 && (() => {
                const daComprare = vociDaComprare(extract.voci).length;
                const altre = extract.voci.length - daComprare;
                const art = articoliDalContratto(extract);
                const pezzi = art.posizioni.reduce((t, p) => t + p.quantita, 0);
                return (
                  <div className="space-y-1">
                    {art.posizioni.length > 0 && (
                      <p className="rounded-md bg-emerald-50 px-2 py-1.5 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
                        {tr("Diventano articoli da ordinare le {n} posizioni dell'allegato ({pezzi} pezzi), con quantità e misure. La riga a corpo resta il prezzo di vendita della commessa, non un articolo.", { n: art.posizioni.length, pezzi: pezzi.toLocaleString(intlCampo()) })}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{tr("{n} con materiale", { n: daComprare })}</span> {tr("(con o senza posa)")}
                      {altre > 0 && <> · {tr("{n} lavori, servizi, oneri o sconti: restano nelle fasi, non diventano articoli", { n: altre })}</>}
                    </p>
                    {extract.origine_lettura === "computo" && (
                      <p className="rounded-md bg-sky-50 px-2 py-1.5 text-xs text-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
                        {tr("È un computo: alla creazione diventa il computo della commessa, con fasi, lavorazioni e importi. I materiali da ordinare si calcolano poi da lì (Materiali › «Genera dal computo»), senza ricaricarlo.")}
                      </p>
                    )}
                  </div>
                );
              })()}
              {extract.voci.length > 0 && (
                <div className="max-h-72 overflow-y-auto rounded-md border">
                  <table className="w-full table-fixed text-xs">
                    <thead className="sticky top-0 bg-background">
                      <tr className="text-left text-muted-foreground">
                        <th className="px-2 py-1.5 font-medium">{tr("Descrizione")}</th>
                        <th className="w-28 px-2 py-1.5 font-medium">{tr("Cos'è")}</th>
                        <th className="w-14 px-2 py-1.5 text-right font-medium">{tr("Q.tà")}</th>
                        <th className="w-24 px-2 py-1.5 text-right font-medium">{tr("Unitario")}</th>
                        <th className="w-24 px-2 py-1.5 text-right font-medium">{tr("Totale")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extract.voci.map((v, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-2 py-1 align-top" title={v.descrizione}>
                            {/* Due righe al massimo, il resto con un clic: una voce «a corpo» è spesso un paragrafo intero. */}
                            <details className="group">
                              <summary className="cursor-pointer list-none break-words group-open:hidden [&::-webkit-details-marker]:hidden"><span className="line-clamp-2">{v.descrizione}</span></summary>
                              <span className="hidden break-words group-open:block">{v.descrizione}</span>
                            </details>
                          </td>
                          <td className="px-2 py-1 align-top">
                            <span className={cn("inline-block rounded px-1.5 py-0.5 text-[11px]",
                              siCompra(v.natura ?? "fornitura_e_posa") ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" : "bg-muted text-muted-foreground")}>
                              {tr(ETICHETTA_NATURA[v.natura ?? "fornitura_e_posa"])}
                            </span>
                          </td>
                          <td className="px-2 py-1 text-right align-top tabular-nums">{v.quantita.toLocaleString(intlCampo())}</td>
                          <td className="px-2 py-1 text-right align-top tabular-nums">{v.prezzo_unitario_eur ? formatCurrency(v.prezzo_unitario_eur) : "—"}</td>
                          <td className="px-2 py-1 text-right align-top font-medium tabular-nums">{formatCurrency((v.quantita || 1) * (v.prezzo_unitario_eur || 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {somma > 0 && (
                <p className={cn("text-xs", tornano ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300")}>
                  {tornano ? <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" aria-hidden /> : <AlertTriangle className="mr-1 inline h-3.5 w-3.5" aria-hidden />}
                  {imponibile == null ? tr("Le {n} voci fanno {somma}", { n: extract.voci.length, somma: formatCurrency(somma) })
                    : tornano ? tr("Le {n} voci fanno {somma}: tornano con l'imponibile", { n: extract.voci.length, somma: formatCurrency(somma) })
                    : tr("Le {n} voci fanno {somma}, l'imponibile è {imponibile}", { n: extract.voci.length, somma: formatCurrency(somma), imponibile: formatCurrency(imponibile) })}
                </p>
              )}
              {pos.length > 0 && (
                <div>
                  <p className="mb-1 text-[11px] text-muted-foreground">{tr("Posizioni dell'allegato tecnico · {n} pezzi, prezzo compreso nel totale a corpo", { n: pos.reduce((t, x) => t + x.quantita, 0).toLocaleString(intlCampo()) })}</p>
                  <ul className="divide-y rounded-md border text-xs">
                    {pos.map((x, i) => (
                      <li key={i} className="flex items-center gap-2 px-2 py-1">
                        <span className="min-w-0 flex-1 truncate">{x.codice}{x.descrizione ? <span className="text-muted-foreground"> · {x.descrizione}</span> : null}</span>
                        <span className="text-muted-foreground">{x.dimensioni ?? ""}</span>
                        <span className="w-10 text-right tabular-nums">× {x.quantita.toLocaleString(intlCampo())}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>)}
            {attiva === "pagamento" && (<>
            <p className="text-xs"><span className="text-muted-foreground">{tr("Modalità:")} </span>{extract.modalita_pagamento ?? tr("non scritta")}</p>
            {extract.fasi_pagamento.length > 0 ? (
              <ul className="divide-y rounded-md border text-xs">
                {extract.fasi_pagamento.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 px-2 py-1.5">
                    <span className="w-5 text-muted-foreground tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{f.descrizione}</span>
                    {f.percentuale != null && <span className="text-muted-foreground tabular-nums">{f.percentuale}%</span>}
                    <span className="w-24 text-right font-medium tabular-nums">{f.importo_eur != null ? formatCurrency(f.importo_eur) : "—"}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-muted-foreground">{tr("Nessuna rata scritta nel documento.")}</p>}
            </>)}
            {attiva === "date" && (<>
            {date.length > 0 ? (
              <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-xs">
                {date.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="tabular-nums">{v}</dd></div>)}
              </dl>
            ) : <p className="text-xs text-muted-foreground">{tr("Il documento non scrive date di inizio, fine o consegna.")}</p>}
            </>)}
            {attiva === "note" && (<>
              {extract.firma && <p className={cn("text-xs", extract.firma.presente ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300")}>{extract.firma.presente ? `${tr("Firmato")}${extract.firma.firmatario ? ` ${tr("da {nome}", { nome: extract.firma.firmatario })}` : ""}${data(extract.firma.data) ? ` ${tr("il {data}", { data: data(extract.firma.data) ?? "" })}` : ""}${extract.firma.pagine.length ? ` · ${tr("pagine {elenco}", { elenco: extract.firma.pagine.join(", ") })}` : ""}.` : tr("Firma del cliente non vista sul documento.")}</p>}
              {note.length > 0 && <ul className="space-y-1 text-xs">
                {note.map((n, i) => (
                  <li key={i} className={cn("rounded-md border px-2 py-1.5", n.contraddice && "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100")}>
                    {n.riferimento && <span className="font-medium">{n.riferimento}: </span>}«{n.testo}»
                    {n.pagina ? <span className="text-muted-foreground"> · {tr("pag. {n}", { n: n.pagina })}</span> : null}
                    {n.contraddice && <span className="block">{tr("Cambia lo stampato: {testo}", { testo: n.contraddice })}</span>}
                  </li>
                ))}
                <li className="text-muted-foreground">{tr("Finiscono nelle note interne della commessa.")}</li>
              </ul>}
            </>)}
            {attiva === "cliente" && (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">{tr("Cliente")}</dt><dd className="font-medium">{extract.cliente.nome_completo || "—"}</dd>
              {extract.cliente.codice_fiscale && <><dt className="text-muted-foreground">{tr("Codice fiscale")}</dt><dd>{extract.cliente.codice_fiscale}</dd></>}
              {extract.cliente.partita_iva && <><dt className="text-muted-foreground">{tr("Partita IVA")}</dt><dd>{extract.cliente.partita_iva}</dd></>}
              {(extract.cliente.email || extract.cliente.telefono) && <><dt className="text-muted-foreground">{tr("Contatti")}</dt><dd>{[extract.cliente.email, extract.cliente.telefono].filter(Boolean).join(" · ")}</dd></>}
              {extract.indirizzo_cantiere && <><dt className="text-muted-foreground">{tr("Cantiere")}</dt><dd>{extract.indirizzo_cantiere}</dd></>}
              <dt className="text-muted-foreground">{tr("Lavori")}</dt><dd>{extract.descrizione_lavori || "—"}</dd>
            </dl>
            )}
            </>}
          </div>
        </section>

        <aside aria-label={tr("Da controllare")} className="space-y-3 border-t p-3 text-xs lg:border-l lg:border-t-0">
          <div>
            <p className="mb-1.5 font-semibold">{avvisi.length ? tr("Da controllare · {n}", { n: avvisi.length }) : tr("Niente da controllare")}</p>
            {avvisi.length > 0 && (
              <ul className="space-y-1.5">
                {avvisi.map((a, i) => <li key={i} className="rounded-md bg-amber-50 px-2 py-1.5 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">{a}</li>)}
              </ul>
            )}
            {daConfermare.length > 0 && <p className="mt-1.5 text-muted-foreground">{tr("Confermi dopo, nel modulo: {elenco}.", { elenco: daConfermare.join(" · ") })}</p>}
          </div>
          {trovati.length > 0 && (
            <details>
              <summary className="cursor-pointer font-semibold text-emerald-700 dark:text-emerald-300">{tr("Ritrovati nel PDF · {n}", { n: trovati.length })}</summary>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {trovati.map((c) => <li key={c.chiave} title={c.citazione ?? undefined}><span className="text-foreground">{c.etichetta}</span> · {tr("pag. {n}", { n: c.pagina })}</li>)}
              </ul>
            </details>
          )}
          {verifica?.senzaTesto && <p className="text-muted-foreground">{tr("Scansione senza testo: i valori non si possono ritrovare nel PDF, guardali sul documento.")}</p>}
        </aside>
      </div>

      {dopoDati}
    </div>
  );
}
