/**
 * Il contratto letto dall'AI, come si guarda prima di applicarlo (17/11/2026, bozza approvata):
 * in testa chi, a chi e quanto (quattro numeri); a sinistra le schede (voci, rate, fasi, note a mano,
 * cliente); a destra UN elenco di cosa controllare e dove ogni valore sta nel PDF. Prima c'erano un
 * riassunto lungo, «Affidabilità 90%» (il voto che l'AI dà a sé stessa) e gli stessi avvisi due volte.
 */
import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { contractImponibile, contractSommaVoci, type ContractExtract } from "@/lib/orders/contractExtract";
import type { VerificaNelTesto } from "@/lib/orders/contrattoNelTesto";
import { avvisiDaControllare } from "@/lib/orders/avvisiContratto";
import { cn } from "@/lib/utils";

type Scheda = "voci" | "rate" | "fasi" | "note" | "allegato" | "cliente";

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

export function RisultatoLettura({ extract, verifica, testoDocumento, daConfermare = [], dopoDati, extraAvvisi = [] }: {
  extract: ContractExtract;
  verifica: VerificaNelTesto | null;
  /** Il testo del PDF (null per le scansioni o le foto). */
  testoDocumento: string | null;
  /** Cosa si conferma dopo, nel modulo (cliente, fasi, date…). */
  daConfermare?: string[];
  /** Blocchi propri della destinazione (dati d'appalto, RDO), sotto le schede. */
  dopoDati?: ReactNode;
  extraAvvisi?: string[];
}) {
  const imponibile = contractImponibile(extract);
  const iva = extract.iva_pct != null && imponibile != null ? Math.round(imponibile * extract.iva_pct) / 100 : null;
  const totale = extract.importo_totale_ivato_eur ?? (imponibile != null && iva != null ? imponibile + iva : null);
  const somma = contractSommaVoci(extract);
  const note = extract.note_a_mano ?? [];
  const pos = extract.posizioni_allegato ?? [];
  const fasi = extract.fasi_lavoro ?? [];
  const avvisi = useMemo(() => avvisiDaControllare(extract, verifica, testoDocumento, extraAvvisi), [extract, verifica, testoDocumento, extraAvvisi]);
  const trovati = verifica && !verifica.senzaTesto ? verifica.campi.filter((c) => c.pagina != null) : [];

  const schede = ([
    ["voci", `Voci ${extract.voci.length}`, extract.voci.length > 0],
    ["rate", `Rate ${extract.fasi_pagamento.length}`, extract.fasi_pagamento.length > 0],
    ["fasi", `Fasi ${fasi.length}`, fasi.length > 0],
    ["note", `Note a mano ${note.length}`, note.length > 0],
    ["allegato", `Allegato ${pos.length}`, pos.length > 0],
    ["cliente", "Cliente e lavori", true],
  ] as [Scheda, string, boolean][]).filter(([, , c]) => c);
  const [scelta, setScelta] = useState<Scheda | null>(null);
  const attiva = schede.find(([k]) => k === scelta)?.[0] ?? schede[0][0];
  const durata = extract.data_inizio_lavori && extract.data_fine_lavori ? `${data(extract.data_inizio_lavori)} → ${data(extract.data_fine_lavori)}` : null;
  const tornano = imponibile != null && somma > 0 && Math.abs(somma - imponibile) <= Math.max(1, imponibile * 0.02);

  return (
    <div className="space-y-3">
      {/* Chi, a chi, quanto. */}
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h3 className="text-sm font-semibold">
            {NATURA[extract.natura_documento ?? ""] ?? "Documento"}{data(extract.data_documento) ? ` del ${data(extract.data_documento)}` : ""}
            {extract.fornitore_emittente ? ` · ${extract.fornitore_emittente}` : ""}{extract.cliente.nome_completo ? ` → ${extract.cliente.nome_completo}` : ""}
          </h3>
          {extract.firma && (
            <span className={cn("ml-auto text-xs", extract.firma.presente ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300")}>
              {extract.firma.presente
                ? <><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" aria-hidden />firmato{extract.firma.firmatario ? ` da ${extract.firma.firmatario}` : ""}{data(extract.firma.data) ? ` il ${data(extract.firma.data)}` : ""}</>
                : "firma del cliente non vista"}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Numero etichetta="Imponibile" valore={imponibile != null ? formatCurrency(imponibile) : "—"} />
          <Numero etichetta="IVA" valore={extract.iva_pct != null ? `${extract.iva_pct}%` : "non scritta"} sotto={iva != null ? formatCurrency(iva) : null} />
          <Numero etichetta="Totale" valore={totale != null ? formatCurrency(totale) : "—"} />
          <Numero etichetta={durata ? "Lavori" : "Pagamento"} valore={durata ?? (extract.fasi_pagamento.length ? `${extract.fasi_pagamento.length} rate` : extract.modalita_pagamento ?? "non scritto")}
            sotto={durata ? null : extract.fasi_pagamento.length ? extract.modalita_pagamento : null} />
        </div>
      </header>

      <div className="grid gap-3 rounded-lg border lg:grid-cols-[minmax(0,1fr)_16rem]">
        <section aria-label="Cosa ho letto" className="min-w-0 space-y-2 p-3">
          <div role="tablist" aria-label="Sezioni del documento" className="flex flex-wrap gap-1.5">
            {schede.map(([k, etichetta]) => (
              <button key={k} type="button" role="tab" aria-selected={k === attiva} onClick={() => setScelta(k)}
                className={cn("rounded-md border px-2.5 py-1 text-xs transition-colors", k === attiva ? "border-primary/40 bg-primary/10 font-medium text-primary" : "hover:bg-muted")}>
                {etichetta}
              </button>
            ))}
          </div>

          {attiva === "voci" && (
            <>
              <div className="max-h-72 overflow-y-auto rounded-md border">
                <table className="w-full table-fixed text-xs">
                  <thead className="sticky top-0 bg-background">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-2 py-1.5 font-medium">Descrizione</th>
                      <th className="w-14 px-2 py-1.5 text-right font-medium">Q.tà</th>
                      <th className="w-20 px-2 py-1.5 text-right font-medium">Unitario</th>
                      <th className="w-24 px-2 py-1.5 text-right font-medium">Totale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extract.voci.map((v, i) => (
                      <tr key={i} className="border-t">
                        <td className="truncate !whitespace-nowrap px-2 py-1" title={v.descrizione}>{v.descrizione}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{v.quantita.toLocaleString("it-IT")}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{v.prezzo_unitario_eur ? formatCurrency(v.prezzo_unitario_eur) : "—"}</td>
                        <td className="px-2 py-1 text-right font-medium tabular-nums">{formatCurrency((v.quantita || 1) * (v.prezzo_unitario_eur || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {somma > 0 && (
                <p className={cn("text-xs", tornano ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300")}>
                  {tornano ? <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" aria-hidden /> : <AlertTriangle className="mr-1 inline h-3.5 w-3.5" aria-hidden />}
                  Le {extract.voci.length} voci fanno {formatCurrency(somma)}{imponibile != null ? (tornano ? ": tornano con l'imponibile" : `, l'imponibile è ${formatCurrency(imponibile)}`) : ""}
                </p>
              )}
            </>
          )}

          {attiva === "rate" && (
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
          )}

          {attiva === "fasi" && (
            <ol className="list-decimal space-y-0.5 rounded-md border py-1.5 pl-7 pr-2 text-xs">
              {fasi.map((f, i) => <li key={i}>{f.nome}{f.giorni ? <span className="text-muted-foreground"> · {f.giorni} gg</span> : null}{f.sottofasi.length ? <span className="text-muted-foreground"> · {f.sottofasi.length} sottofasi</span> : null}</li>)}
            </ol>
          )}

          {attiva === "note" && (
            <ul className="space-y-1 text-xs">
              {note.map((n, i) => (
                <li key={i} className={cn("rounded-md border px-2 py-1.5", n.contraddice && "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100")}>
                  {n.riferimento && <span className="font-medium">{n.riferimento}: </span>}«{n.testo}»
                  {n.pagina ? <span className="text-muted-foreground"> · pag. {n.pagina}</span> : null}
                  {n.contraddice && <span className="block">Cambia lo stampato: {n.contraddice}</span>}
                </li>
              ))}
              <li className="text-muted-foreground">Finiscono nelle note interne della commessa.</li>
            </ul>
          )}

          {attiva === "allegato" && (
            <ul className="divide-y rounded-md border text-xs">
              {pos.map((x, i) => (
                <li key={i} className="flex items-center gap-2 px-2 py-1">
                  <span className="min-w-0 flex-1 truncate">{x.codice}{x.descrizione ? <span className="text-muted-foreground"> · {x.descrizione}</span> : null}</span>
                  <span className="text-muted-foreground">{x.dimensioni ?? ""}</span>
                  <span className="w-10 text-right tabular-nums">× {x.quantita.toLocaleString("it-IT")}</span>
                </li>
              ))}
            </ul>
          )}

          {attiva === "cliente" && (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Cliente</dt><dd className="font-medium">{extract.cliente.nome_completo || "—"}</dd>
              {extract.cliente.codice_fiscale && <><dt className="text-muted-foreground">Codice fiscale</dt><dd>{extract.cliente.codice_fiscale}</dd></>}
              {extract.cliente.partita_iva && <><dt className="text-muted-foreground">Partita IVA</dt><dd>{extract.cliente.partita_iva}</dd></>}
              {(extract.cliente.email || extract.cliente.telefono) && <><dt className="text-muted-foreground">Contatti</dt><dd>{[extract.cliente.email, extract.cliente.telefono].filter(Boolean).join(" · ")}</dd></>}
              {extract.indirizzo_cantiere && <><dt className="text-muted-foreground">Cantiere</dt><dd>{extract.indirizzo_cantiere}</dd></>}
              <dt className="text-muted-foreground">Lavori</dt><dd>{extract.descrizione_lavori || "—"}</dd>
            </dl>
          )}
        </section>

        <aside aria-label="Da controllare" className="space-y-3 border-t p-3 text-xs lg:border-l lg:border-t-0">
          <div>
            <p className="mb-1.5 font-semibold">{avvisi.length ? `Da controllare · ${avvisi.length}` : "Niente da controllare"}</p>
            {avvisi.length > 0 && (
              <ul className="space-y-1.5">
                {avvisi.map((a, i) => <li key={i} className="rounded-md bg-amber-50 px-2 py-1.5 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">{a}</li>)}
              </ul>
            )}
            {daConfermare.length > 0 && <p className="mt-1.5 text-muted-foreground">Confermi dopo, nel modulo: {daConfermare.join(" · ")}.</p>}
          </div>
          {trovati.length > 0 && (
            <details>
              <summary className="cursor-pointer font-semibold text-emerald-700 dark:text-emerald-300">Ritrovati nel PDF · {trovati.length}</summary>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {trovati.map((c) => <li key={c.chiave} title={c.citazione ?? undefined}><span className="text-foreground">{c.etichetta}</span> · pag. {c.pagina}</li>)}
              </ul>
            </details>
          )}
          {verifica?.senzaTesto && <p className="text-muted-foreground">Scansione senza testo: i valori non si possono ritrovare nel PDF, guardali sul documento.</p>}
        </aside>
      </div>

      {dopoDati}
    </div>
  );
}
