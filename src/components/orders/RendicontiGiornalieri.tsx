/**
 * Cantiere → Rapportini → Rendiconti al committente: il foglio per il committente, un rendiconto PER
 * GIORNO, coi prezzi. Nasce prendendo le voci di tutti i rapportini di quel giorno, o si scrive a mano;
 * i confermati entrano nel rendiconto del periodo (Finanza → Rendiconto).
 *
 * 28/11/2026: stessa veste dell'elenco dei rapportini — tessera del giorno, colpo d'occhio in testa,
 * filtri (stato, lavori o trasporti, mese, testo), un titolo per mese, una riga per rendiconto — perché
 * le due schede della commessa si usino allo stesso modo. In testa i due documenti nuovi («Rendiconto
 * lavori», «Rendiconto trasporti») e «Crea documento PDF» di tutti quelli che si stanno guardando.
 * Senza il permesso sugli importi la scheda dice perché non mostra l'elenco.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Plus, Search, Truck, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePermissions } from "@/hooks/usePermissions";
import { formatCurrency } from "@/lib/formatters";
import { messaggioErrore } from "@/lib/messaggioErrore";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { cn } from "@/lib/utils";
import {
  elencoRendiconti, rendicontiDaRapportini, rendicontoDelGiorno, riassuntoTestata,
  type EsitoDaRapportini, type RendicontoGiornaliero, type StatoRendiconto,
} from "@/lib/rendiconti/rendicontiGiornalieri";
import {
  FILTRI_RENDICONTI_VUOTI, filtraRendiconti, filtriRendicontiAttivi,
  type FiltriRendiconti, type FiltroStatoRendiconto, type FiltroTipoRendiconto,
} from "@/lib/rendiconti/filtriRendiconti";
import { fmtSafeDate } from "@/components/orders/TesseraGiorno";
import { PulsantePdfRendiconto } from "@/components/orders/PulsantePdfRendiconto";
import { PulsantePdfRendicontiPeriodo } from "@/components/orders/PulsantePdfRendicontiPeriodo";
import { RendicontoGiornalieroEditor } from "@/components/orders/RendicontoGiornalieroEditor";

const oggi = () => new Date().toLocaleDateString("en-CA");

/** Il colore della tessera dice a che punto è il rendiconto, come per i rapportini. */
const TESSERA_STATO: Record<StatoRendiconto, string> = {
  confermato: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  bozza: "bg-slate-100 text-slate-700 ring-slate-200",
  annullato: "bg-red-50 text-red-800 ring-red-200",
};

export function RendicontiGiornalieri({ orderId, apriId, onApriConsumato }: {
  orderId: string;
  /** Un rendiconto da aprire subito (arriva da «Crea il rendiconto di questo giorno»). */
  apriId?: string | null;
  onApriConsumato?: () => void;
}) {
  const tr = useT();
  const qc = useQueryClient();
  const { canViewOrderAmounts, canEditOrders } = usePermissions();
  const [aperto, setAperto] = useState<{ id: string | null; trasporti?: boolean } | null>(null);
  const [prova, setProva] = useState<EsitoDaRapportini | null>(null);
  // «Nuovo rendiconto» chiede prima il giorno: lo stesso giorno apre sempre lo stesso rendiconto.
  const [scegliGiorno, setScegliGiorno] = useState<{ data: string; trasporti: boolean } | null>(null);
  const [filtri, setFiltri] = useState<FiltriRendiconti>(FILTRI_RENDICONTI_VUOTI);
  const [quanti, setQuanti] = useState(10);
  const cambiaFiltri = (patch: Partial<FiltriRendiconti>) => { setFiltri((f) => ({ ...f, ...patch })); setQuanti(10); };

  const [apriVisto, setApriVisto] = useState<string | null>(null);
  if ((apriId ?? null) !== apriVisto) {
    setApriVisto(apriId ?? null);
    if (apriId) setAperto({ id: apriId });
  }
  useEffect(() => { if (apriId) onApriConsumato?.(); }, [apriId, onApriConsumato]);

  const elenco = useQuery({
    queryKey: ["rendiconti-giornalieri", orderId],
    enabled: canViewOrderAmounts,
    queryFn: () => elencoRendiconti(orderId),
  });
  const righe = useMemo(() => elenco.data ?? [], [elenco.data]);

  const calcola = useMutation({
    mutationFn: () => rendicontiDaRapportini(orderId, true),
    onSuccess: setProva,
    onError: (e) => toast.error(messaggioErrore(e, tr("Controllo non riuscito"))),
  });
  const apriGiorno = useMutation({
    mutationFn: (s: { data: string; trasporti: boolean }) => rendicontoDelGiorno(orderId, s.data).then((r) => ({ r, trasporti: s.trasporti })),
    onSuccess: ({ r, trasporti }) => {
      setScegliGiorno(null);
      if (r.aggiunti > 0) toast.success(tr("Prese le voci di {n} rapportini", { n: r.rapportini }));
      void qc.invalidateQueries({ queryKey: ["rendiconti-giornalieri", orderId] });
      setAperto({ id: r.id, trasporti });
    },
    onError: (e) => toast.error(messaggioErrore(e, tr("Rendiconto non aperto"))),
  });
  const crea = useMutation({
    mutationFn: () => rendicontiDaRapportini(orderId, false),
    onSuccess: (r) => {
      setProva(null);
      toast.success(tr("{n} rendiconti creati in bozza", { n: r.creati.length }));
      // Un rapportino difettoso non ferma gli altri: chi non è passato va detto, col motivo.
      if (r.errori?.length) toast.error(tr("{n} giorni non trasformati: {motivo}", { n: r.errori.length, motivo: r.errori[0].errore }));
      void qc.invalidateQueries({ queryKey: ["rendiconti-giornalieri", orderId] });
    },
    onError: (e) => toast.error(messaggioErrore(e, tr("Rendiconti non creati"))),
  });

  const conteggi = useMemo(() => {
    const c = { bozza: 0, confermato: 0, annullato: 0, trasporti: 0, totale: 0, confermatoEuro: 0 };
    for (const r of righe) {
      c[r.stato] += 1;
      if (r.n_trasporti > 0) c.trasporti += 1;
      if (r.stato !== "annullato") c.totale += r.totale;
      if (r.stato === "confermato") c.confermatoEuro += r.totale;
    }
    return c;
  }, [righe]);
  const mesi = useMemo(() => [...new Set(righe.map((r) => r.data.slice(0, 7)).filter(Boolean))], [righe]);
  const filtrati = useMemo(() => filtraRendiconti(righe, filtri), [righe, filtri]);

  // Un titolo per mese, col totale del mese: con molti giorni si trova il periodo senza leggerli tutti.
  const gruppi = useMemo(() => {
    const perMese = new Map<string, { totale: number; euro: number }>();
    for (const r of filtrati) {
      const m = r.data.slice(0, 7);
      const corrente = perMese.get(m) ?? { totale: 0, euro: 0 };
      corrente.totale += 1;
      if (r.stato !== "annullato") corrente.euro += r.totale;
      perMese.set(m, corrente);
    }
    const out: Array<{ mese: string; etichetta: string; totale: number; euro: number; righe: RendicontoGiornaliero[] }> = [];
    for (const r of filtrati.slice(0, quanti)) {
      const m = r.data.slice(0, 7);
      let gruppo = out[out.length - 1];
      if (!gruppo || gruppo.mese !== m) {
        gruppo = { mese: m, etichetta: fmtSafeDate(`${m}-01`, "LLLL yyyy"), ...(perMese.get(m) ?? { totale: 0, euro: 0 }), righe: [] };
        out.push(gruppo);
      }
      gruppo.righe.push(r);
    }
    return out;
  }, [filtrati, quanti]);

  if (!canViewOrderAmounts) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {tr("I rendiconti hanno i prezzi: per vederli serve il permesso «Venduto e importi». Chiedilo al titolare.")}
      </p>
    );
  }

  const nomeStato: Record<StatoRendiconto, string> = { bozza: tr("Bozza"), confermato: tr("Confermato"), annullato: tr("Annullato") };
  const colore: Record<StatoRendiconto, string> = {
    bozza: "border-slate-300 bg-slate-100 text-slate-600",
    confermato: "border-green-600 bg-green-600 text-white",
    annullato: "border-red-300 bg-red-50 text-red-600",
  };

  return (
    <Card>
      <CardHeader className="gap-4 pb-3 max-sm:p-3 max-sm:pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" />
          {tr("Rendiconti al committente")} ({elenco.isLoading ? "…" : elenco.isError ? "—" : righe.length})
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {canEditOrders && (
            <>
              <Button size="sm" className="h-9" onClick={() => setScegliGiorno({ data: oggi(), trasporti: false })}>
                <Plus className="mr-1.5 h-4 w-4" />{tr("Rendiconto lavori")}
              </Button>
              <Button size="sm" variant="outline" className="h-9" onClick={() => setScegliGiorno({ data: oggi(), trasporti: true })}>
                <Truck className="mr-1.5 h-4 w-4" />{tr("Rendiconto trasporti")}
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" disabled={calcola.isPending} onClick={() => calcola.mutate()}>
                {calcola.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}{tr("Crea dai rapportini")}
              </Button>
            </>
          )}
          {!elenco.isLoading && !elenco.isError && righe.length > 0 && (
            <PulsantePdfRendicontiPeriodo orderId={orderId} rendiconti={filtrati} />
          )}
        </div>
        {/* Colpo d'occhio: quanto è stato rendicontato, cosa aspetta la conferma, l'ultimo giorno. */}
        {!elenco.isLoading && !elenco.isError && righe.length > 0 && (
          <dl className="flex flex-wrap gap-x-8 gap-y-3">
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{tr("Rendicontato")}</dt>
              <dd className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{formatCurrency(conteggi.totale)}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{tr("Confermato")}</dt>
              <dd className="mt-0.5 text-lg font-bold tabular-nums text-emerald-700">{formatCurrency(conteggi.confermatoEuro)}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{tr("Da confermare")}</dt>
              <dd className={cn("mt-0.5 text-lg font-bold tabular-nums", conteggi.bozza > 0 ? "text-amber-700" : "text-emerald-700")}>
                {conteggi.bozza > 0 ? conteggi.bozza : tr("Nessuno")}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{tr("Ultimo rendiconto")}</dt>
              <dd className="mt-0.5 text-lg font-bold text-slate-900">{fmtSafeDate(righe[0]?.data, "d MMM yyyy")}</dd>
            </div>
          </dl>
        )}
      </CardHeader>
      <CardContent className="max-sm:p-3 max-sm:pt-0">
        {elenco.isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : elenco.isError ? (
          <div role="alert" className="space-y-2 text-sm">
            <p>{messaggioErrore(elenco.error, tr("Elenco non caricato"))}</p>
            <Button variant="outline" onClick={() => void elenco.refetch()}>{tr("Riprova")}</Button>
          </div>
        ) : righe.length === 0 ? (
          <p className="-mt-2 text-xs text-muted-foreground">{tr("Nessun rendiconto. Aprine uno per il giorno, o crealo dai rapportini già scritti.")}</p>
        ) : (
          <div className="space-y-4">
            <div role="search" aria-label={tr("Filtra i rendiconti")} className="space-y-2 rounded-lg border bg-slate-50/60 p-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {([
                  ["tutti", tr("Tutti"), righe.length],
                  ["bozza", tr("Bozze"), conteggi.bozza],
                  ["confermato", tr("Confermati"), conteggi.confermato],
                  ["annullato", tr("Annullati"), conteggi.annullato],
                ] as Array<[FiltroStatoRendiconto, string, number]>).filter(([v, , n]) => v === "tutti" || n > 0 || filtri.stato === v).map(([v, etichetta, n]) => (
                  <button key={v} type="button" aria-pressed={filtri.stato === v} onClick={() => cambiaFiltri({ stato: v })}
                    className={cn("rounded-full border px-2.5 py-1 text-xs font-medium",
                      filtri.stato === v ? "border-slate-900 bg-slate-900 text-white" : "border-border bg-white text-slate-700 hover:bg-slate-100")}>
                    {etichetta} <span className="tabular-nums opacity-70">{n}</span>
                  </button>
                ))}
                <span className="mx-1 h-5 w-px bg-border" aria-hidden />
                {([
                  ["tutti", tr("Tutti i tipi")],
                  ["lavori", tr("Lavori")],
                  ["trasporti", tr("Trasporti")],
                ] as Array<[FiltroTipoRendiconto, string]>).map(([v, etichetta]) => (
                  <button key={v} type="button" aria-pressed={filtri.tipo === v} onClick={() => cambiaFiltri({ tipo: v })}
                    className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                      filtri.tipo === v ? "border-blue-700 bg-blue-700 text-white" : "border-border bg-white text-slate-700 hover:bg-slate-100")}>
                    {v === "trasporti" && <Truck className="h-3 w-3" />}{etichetta}
                    {v === "trasporti" && <span className="tabular-nums opacity-70">{conteggi.trasporti}</span>}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[12rem] flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={filtri.cerca} onChange={(e) => cambiaFiltri({ cerca: e.target.value })} placeholder={tr("Cerca nei lavori, nelle note o per numero…")}
                    aria-label={tr("Cerca nei rendiconti")} className="h-8 pl-8 text-sm" />
                </div>
                {mesi.length > 1 && (
                  <select value={filtri.mese} onChange={(e) => cambiaFiltri({ mese: e.target.value })} aria-label={tr("Mese dei rendiconti")}
                    className="h-8 rounded-md border bg-white px-2 text-sm">
                    <option value="">{tr("Tutti i mesi")}</option>
                    {mesi.map((m) => <option key={m} value={m}>{fmtSafeDate(`${m}-01`, "LLLL yyyy")}</option>)}
                  </select>
                )}
                {filtriRendicontiAttivi(filtri) && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFiltri(FILTRI_RENDICONTI_VUOTI); setQuanti(10); }}>
                    <X className="mr-1 h-3.5 w-3.5" />{tr("Togli i filtri")}
                  </Button>
                )}
              </div>
              {filtriRendicontiAttivi(filtri) && (
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {tr("{n} di {totale} rendiconti con questi filtri", { n: filtrati.length, totale: righe.length })}
                </p>
              )}
            </div>
            {filtrati.length === 0 && (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{tr("Nessun rendiconto con questi filtri.")}</p>
            )}
            {filtrati.length > 0 && (
              /* Una tabella vera: una riga per rendiconto, le stesse colonne per tutti, allineate.
                 I mesi sono righe di separazione dentro la stessa tabella, così le colonne non si
                 spostano passando da un mese all'altro. Sul telefono restano le colonne che contano. */
              <div className="overflow-x-auto rounded-lg border bg-card">
                <table className="w-full table-fixed border-collapse text-sm">
                  <caption className="sr-only">{tr("Rendiconti al committente")}</caption>
                  <thead>
                    <tr className="border-b bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                      <th scope="col" className="w-28 px-3 py-1.5 text-left font-medium">{tr("Giorno")}</th>
                      <th scope="col" className="w-12 px-2 py-1.5 text-right font-medium">{tr("N.")}</th>
                      <th scope="col" className="px-2 py-1.5 text-left font-medium">{tr("Lavori")}</th>
                      <th scope="col" className="w-40 px-2 py-1.5 text-left font-medium max-md:hidden">{tr("Contenuto")}</th>
                      <th scope="col" className="w-44 px-2 py-1.5 text-left font-medium max-lg:hidden">{tr("Origine")}</th>
                      <th scope="col" className="w-28 px-2 py-1.5 text-right font-medium">{tr("Totale")}</th>
                      <th scope="col" className="w-24 px-2 py-1.5 text-left font-medium">{tr("Stato")}</th>
                      <th scope="col" className="w-16 px-2 py-1.5 text-right font-medium">{tr("PDF")}</th>
                    </tr>
                  </thead>
                  {gruppi.map((gruppo) => (
                    <tbody key={gruppo.mese}>
                      <tr className="border-y bg-slate-50/70">
                        <th scope="colgroup" colSpan={5} className="px-3 py-1 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                          {gruppo.etichetta}
                        </th>
                        <td className="px-2 py-1 text-right text-xs tabular-nums text-slate-500">{formatCurrency(gruppo.euro)}</td>
                        <td colSpan={2} className="px-2 py-1 text-right text-xs text-slate-500">
                          {tr(gruppo.totale === 1 ? "{n} rendiconto" : "{n} rendiconti", { n: gruppo.totale })}
                        </td>
                      </tr>
                      {gruppo.righe.map((r) => (
                        <tr key={r.id}
                          className={cn("cursor-pointer border-b last:border-b-0 align-middle hover:bg-slate-50 focus-within:bg-slate-50",
                            r.stato === "annullato" && "opacity-60")}>
                          <td className="whitespace-nowrap px-3 py-1.5">
                            <button type="button" onClick={() => setAperto({ id: r.id })}
                              className="text-left tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                              <span className={cn("inline-block rounded px-1.5 py-0.5 font-medium ring-1", TESSERA_STATO[r.stato])}>
                                {fmtSafeDate(r.data, "dd/MM/yyyy")}
                              </span>
                            </button>
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-xs text-muted-foreground">{r.numero}</td>
                          <td className="overflow-hidden px-2 py-1.5">
                            <button type="button" onClick={() => setAperto({ id: r.id })}
                              className="flex w-full min-w-0 items-center gap-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                              <span dir="auto" className="truncate font-medium">{r.descrizione_lavori?.trim() || riassuntoTestata(r, tr)}</span>
                              {/* Da md in su lo dice la colonna «Contenuto»: qui il bollino ruberebbe
                                  spazio al titolo dei lavori. */}
                              {r.n_trasporti > 0 && (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1 text-[10px] text-blue-800 md:hidden">
                                  <Truck className="h-2.5 w-2.5" />{tr("Trasporti")}
                                </span>
                              )}
                            </button>
                          </td>
                          <td className="truncate whitespace-nowrap px-2 py-1.5 text-xs text-slate-600 max-md:hidden">
                            <span>{riassuntoTestata(r, tr)}</span>
                            <span className="ml-2 text-muted-foreground">{r.righe === 1 ? tr("1 riga") : tr("{n} righe", { n: r.righe })}</span>
                          </td>
                          {/* Gli avvisi su una riga sola, corti: per esteso nel titolo, così la colonna
                              dei lavori non si stringe per far posto a una frase. */}
                          <td className="truncate whitespace-nowrap px-2 py-1.5 text-xs text-slate-600 max-lg:hidden">
                            {r.rapportini > 0 && <span className="mr-2">{r.rapportini === 1 ? tr("da 1 rapp.") : tr("da {n} rapp.", { n: r.rapportini })}</span>}
                            {r.rapportini_nuovi > 0 && (
                              <span className="mr-2 font-medium text-amber-700" title={tr("Rapportini di questo giorno non ancora dentro: aprilo e prendi le loro voci")}>
                                {r.rapportini_nuovi === 1 ? tr("1 nuovo") : tr("{n} nuovi", { n: r.rapportini_nuovi })}
                              </span>
                            )}
                            {r.rapportini_ritirati > 0 && (
                              <span className="mr-2 font-medium text-red-700" title={tr("Rapportini rifiutati o annullati dopo: aprilo e controlla le righe")}>
                                {r.rapportini_ritirati === 1 ? tr("1 rifiutato dentro") : tr("{n} rifiutati dentro", { n: r.rapportini_ritirati })}
                              </span>
                            )}
                            {r.senza_prezzo > 0 && <span className="mr-2 font-medium text-amber-700">{tr("{n} senza prezzo", { n: r.senza_prezzo })}</span>}
                            {r.sal_id && <span className="text-blue-800" title={tr("Il giorno è dentro il rendiconto del periodo: non si modifica più")}>{tr("nel periodo")}</span>}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right font-semibold tabular-nums">{formatCurrency(r.totale)}</td>
                          <td className="whitespace-nowrap px-2 py-1.5">
                            <span className={cn("rounded border px-1.5 text-[10px]", colore[r.stato])}>{nomeStato[r.stato]}</span>
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right">
                            {r.stato !== "annullato" && <PulsantePdfRendiconto rendicontoId={r.id} className="h-7 px-2 text-xs" />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
              </div>
            )}
            {filtrati.length > 10 && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {tr("Mostrati {visibili} di {totale} rendiconti", { visibili: Math.min(quanti, filtrati.length), totale: filtrati.length })}
                </p>
                {quanti < filtrati.length && <Button variant="outline" size="sm" onClick={() => setQuanti((n) => n + 10)}>{tr("Mostra altri 10")}</Button>}
              </div>
            )}
          </div>
        )}
      </CardContent>

      {aperto && (
        <RendicontoGiornalieroEditor key={aperto.id ?? "nuovo"} orderId={orderId} rendicontoId={aperto.id} puoModificare={canEditOrders}
          partiDaTrasporti={aperto.trasporti}
          onClose={() => { setAperto(null); void qc.invalidateQueries({ queryKey: ["rendiconti-giornalieri", orderId] }); }} />
      )}

      <Dialog open={scegliGiorno !== null} onOpenChange={(o) => { if (!o) setScegliGiorno(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{scegliGiorno?.trasporti ? tr("Nuovo rendiconto trasporti") : tr("Nuovo rendiconto del giorno")}</DialogTitle>
            <DialogDescription>
              {scegliGiorno?.trasporti
                ? tr("Un viaggio per riga: carico, scarico, mezzo e km. Se quel giorno ci sono rapportini, il rendiconto prende le loro voci.")
                : tr("Se quel giorno ci sono rapportini, il rendiconto prende le loro voci.")}
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-1 text-xs text-muted-foreground">{tr("Giorno")}
            <Input type="date" aria-label={tr("Giorno")} className="h-9 w-40" value={scegliGiorno?.data ?? ""}
              onChange={(e) => setScegliGiorno((s) => (s ? { ...s, data: e.target.value } : s))} />
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => setScegliGiorno(null)}>{tr("Annulla")}</Button>
            <Button type="button" size="sm" disabled={!scegliGiorno?.data || apriGiorno.isPending} onClick={() => scegliGiorno && apriGiorno.mutate(scegliGiorno)}>
              {apriGiorno.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}{tr("Apri")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!prova} onOpenChange={(o) => { if (!o) setProva(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tr("Crea dai rapportini")}</DialogTitle>
            <DialogDescription>
              {prova && (prova.da_creare > 0 || prova.da_aggiornare > 0)
                ? tr("Creo {n} rendiconti, uno per giorno; aggiorno {m} bozze.", { n: prova.da_creare, m: prova.da_aggiornare })
                : tr("Non c'è niente da creare.")}
            </DialogDescription>
          </DialogHeader>
          {prova && (
            <ul className="space-y-0.5 text-sm text-muted-foreground">
              <li>{tr("Giorni con rapportini: {n}", { n: prova.giorni })}</li>
              <li>{tr("Da creare: {n}", { n: prova.da_creare })}</li>
              <li>{tr("Da aggiornare: {n}", { n: prova.da_aggiornare })}</li>
              <li>{tr("Già fatti: {n}", { n: prova.gia_fatti })}</li>
            </ul>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => setProva(null)}>{tr("Chiudi")}</Button>
            <Button type="button" size="sm" disabled={!prova || (prova.da_creare === 0 && prova.da_aggiornare === 0) || crea.isPending} onClick={() => crea.mutate()}>
              {crea.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}{tr("Crea")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
