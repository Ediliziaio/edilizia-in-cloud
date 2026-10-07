import { useEffect, useMemo, useRef } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { AlertTriangle, CalendarRange, FileSignature, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { usePermissions } from "@/hooks/usePermissions";
import { useOrderWorkPhases } from "@/hooks/useOrderWorkPhases";
import { useAvanzamentoCommessa } from "@/hooks/useAvanzamentoCommessa";
import { useOrderScheduleHealth } from "@/hooks/useOrderScheduleHealth";
import { useCronoprogramma } from "@/hooks/useCronoprogramma";
import { useCostiMaterialiFasi } from "@/hooks/useCostiMaterialiFasi";
import { economiaFasi, type EconomiaFase } from "@/lib/orders/economiaFasi";
import {
  avanzamentoComplessivo,
  barra,
  fasiCronoprogramma,
  giornoLocale,
  giorniTra,
  intervalloCronoprogramma,
  lavoroRealeFasi,
  ritardoFase,
  tacche,
  traguardiCommessa,
  aggiungiGiorni,
  type Asse,
  type FaseCrono,
  type Traguardo,
} from "@/lib/orders/cronoprogramma";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { costoSforato } from "./EconomiaFaseRiga";

export interface CommessaCronoprogramma {
  quote_id?: string | null;
  created_at: string;
  work_start_date: string | null;
  work_end_date: string | null;
  expected_date: string | null;
}

const breve = (d: string) => format(parseISO(d), "dd/MM", { locale: it });
const lunga = (d: string) => format(parseISO(d), "dd/MM/yyyy", { locale: it });
const giorni = (n: number) => (n === 1 ? "1 giorno" : `${n} giorni`);

const ETICHETTA_STATO: Record<FaseCrono["stato"], string> = {
  da_iniziare: "Da iniziare",
  in_corso: "In corso",
  completata: "Completata",
};

const TRAGUARDO_BREVE: Record<Traguardo["tipo"], string> = {
  contratto: "Contratto",
  apertura: "Commessa aperta",
  inizio_lavori: "Inizio lavori",
  fine_lavori: "Fine lavori",
  consegna: "Consegna",
};

/** Intervallo previsto della fase; con una data sola vale per un giorno. */
function previsto(f: FaseCrono): [string, string] | null {
  const da = f.previstoInizio ?? f.previstoFine;
  const a = f.previstoFine ?? f.previstoInizio;
  return da && a ? [da, a] : null;
}

/** Intervallo reale: dal primo rapportino alla chiusura, o fino a oggi se è in corso. */
function reale(f: FaseCrono, oggi: string): [string, string] | null {
  if (!f.realeInizio) return null;
  const fine = f.realeFine ?? (f.stato === "in_corso" ? oggi : f.realeInizio);
  return [f.realeInizio, fine < f.realeInizio ? f.realeInizio : fine];
}

function Dettaglio({
  fase,
  oggi,
  economia,
  vedeVenduto,
  vedeCosti,
}: {
  fase: FaseCrono;
  oggi: string;
  economia?: EconomiaFase;
  vedeVenduto: boolean;
  vedeCosti: boolean;
}) {
  const p = previsto(fase);
  const r = reale(fase, oggi);
  return (
    <div className="space-y-2 text-sm">
      <p className="font-semibold">{fase.nome}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Stato</dt>
        <dd>{ETICHETTA_STATO[fase.stato]} · {fase.avanzamento}%</dd>
        <dt className="text-muted-foreground">Previsto</dt>
        <dd>{p ? `dal ${lunga(p[0])} al ${lunga(p[1])} (${giorni(giorniTra(p[0], p[1]) + 1)})` : "senza date"}</dd>
        <dt className="text-muted-foreground">Reale</dt>
        <dd>
          {r
            ? fase.realeFine
              ? `dal ${lunga(r[0])} al ${lunga(fase.realeFine)}`
              : `dal ${lunga(r[0])}, ${fase.stato === "in_corso" ? "in corso" : "senza chiusura registrata"}`
            : fase.stato === "da_iniziare" ? "non ancora iniziata" : "nessun rapportino sulla fase"}
        </dd>
        {(fase.ritardoInizio > 0 || fase.ritardoFine > 0) && <>
          <dt className="text-muted-foreground">Ritardo</dt>
          <dd className="font-medium text-rose-700">
            {[fase.ritardoInizio > 0 ? `inizio +${giorni(fase.ritardoInizio)}` : null, fase.ritardoFine > 0 ? `fine +${giorni(fase.ritardoFine)}` : null].filter(Boolean).join(" · ")}
          </dd>
        </>}
        {fase.ore > 0 && <>
          <dt className="text-muted-foreground">Ore</dt>
          <dd>{fase.ore.toLocaleString("it-IT")} h dai rapportini</dd>
        </>}
        {economia && vedeVenduto && <>
          <dt className="text-muted-foreground">Venduto</dt>
          <dd className="tabular-nums">{economia.fonteVenduto !== null ? formatCurrency(economia.venduto) : "—"}</dd>
        </>}
        {economia && vedeCosti && <>
          <dt className="text-muted-foreground">Costo previsto</dt>
          <dd className="tabular-nums">{formatCurrency(economia.costoPrevisto)}</dd>
          <dt className="text-muted-foreground">Costo consuntivo</dt>
          <dd className={cn("tabular-nums", costoSforato(economia) && "font-medium text-rose-700")}>
            {formatCurrency(economia.costoConsuntivo)}
            {costoSforato(economia) && ` (+${formatCurrency(economia.scostamento)})`}
          </dd>
        </>}
      </dl>
    </div>
  );
}

/** Le linee verticali dell'asse e la linea di oggi, ripetute in ogni riga del grafico. */
function Griglia({ asse, segni, oggi }: { asse: Asse; segni: ReturnType<typeof tacche>; oggi: string }) {
  const posOggi = barra(oggi, oggi, asse);
  return (
    <>
      {segni.map((t) => (
        <span key={t.data} aria-hidden="true" className="absolute inset-y-0 w-px bg-slate-100" style={{ left: `${t.left}%` }} />
      ))}
      <span aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-orange-500/80" style={{ left: `${posOggi.left + posOggi.width / 2}%` }} />
    </>
  );
}

/** La colonna dei nomi delle fasi (w-56), che resta ferma quando il grafico scorre. */
const COLONNA_PX = 224;

/**
 * Dove mettere l'etichetta di ogni traguardo: centrata sul rombo, ma tutta
 * dentro il grafico vicino ai bordi, e su una seconda riga se il traguardo
 * prima è troppo vicino (contratto e inizio lavori a pochi giorni).
 */
function posizioniTraguardi(traguardi: ReadonlyArray<Traguardo>, asse: Asse) {
  let precedente: { centro: number; riga: 0 | 1 } | null = null;
  return traguardi.map((t) => {
    const pos = barra(t.data, t.data, asse);
    const centro = pos.left + pos.width / 2;
    const riga: 0 | 1 = precedente && precedente.riga === 0 && centro - precedente.centro < 12 ? 1 : 0;
    precedente = { centro, riga };
    const lato = centro < 10 ? "sinistra" : centro > 90 ? "destra" : "centro";
    return { t, centro, riga, lato } as const;
  });
}

/**
 * Cronoprogramma della commessa (06/10/2026): un Gantt con la firma del
 * contratto, le fasi con le date previste (barra chiara, con l'avanzamento
 * dentro) e reali (barra piena sotto, rossa oltre la fine prevista), oggi e i
 * ritardi. Le date reali vengono dai rapportini e dalla chiusura delle fasi;
 * i numeri economici seguono i permessi. Solo da tablet e computer.
 */
export function CronoprogrammaCommessa({
  orderId,
  order,
  onOpenLavorazioni,
}: {
  orderId: string;
  order: CommessaCronoprogramma;
  onOpenLavorazioni?: () => void;
}) {
  const { canViewOrderAmounts, canViewCosts } = usePermissions();
  const { phases, materials = [], allAssignments = [], isLoading, isError, refetch } = useOrderWorkPhases(orderId);
  const crono = useCronoprogramma(orderId, order.quote_id ?? null);
  const { data: salute } = useOrderScheduleHealth(orderId);
  const { data: costiMateriali } = useCostiMaterialiFasi(orderId, canViewCosts);
  const { daMostrare: avanzamentoDellaCommessa } = useAvanzamentoCommessa(orderId);

  const oggi = giornoLocale(new Date().toISOString());
  const economia = useMemo(
    () => economiaFasi({ fasi: phases, righe: materials, assegnazioni: allAssignments, acquisti: costiMateriali?.acquisti, movimenti: costiMateriali?.movimenti }),
    [phases, materials, allAssignments, costiMateriali],
  );
  const fasi = useMemo(
    () => fasiCronoprogramma(
      phases.map((p) => ({ id: p.id, name: p.name, status: p.status, percentuale: p.percentuale, start_date: p.start_date, end_date: p.end_date, completata_il: p.completata_il })),
      lavoroRealeFasi(crono.rapportini),
      oggi,
    ),
    [phases, crono.rapportini, oggi],
  );
  const traguardi = useMemo(() => traguardiCommessa({
    firmaPreventivo: crono.firmaPreventivo,
    aperturaCommessa: giornoLocale(order.created_at),
    inizioLavori: order.work_start_date,
    fineLavori: order.work_end_date,
    consegna: order.expected_date,
  }), [crono.firmaPreventivo, order.created_at, order.work_start_date, order.work_end_date, order.expected_date]);

  const nelGrafico = fasi.filter((f) => previsto(f) || f.realeInizio);
  const senzaDate = fasi.filter((f) => !previsto(f) && !f.realeInizio);
  const asse = intervalloCronoprogramma(nelGrafico, traguardi, oggi);
  const segni = tacche(asse);
  const etichetteTraguardi = posizioniTraguardi(traguardi, asse);
  const avanzamento = avanzamentoDellaCommessa(avanzamentoComplessivo(fasi));
  const sullaFine = fasi.map(ritardoFase).filter((r) => r?.su === "fine");
  const sullInizio = fasi.map(ritardoFase).filter((r) => r?.su === "inizio");
  const ritardoMassimo = Math.max(0, ...sullaFine.map((r) => r!.giorni));
  const contratto = traguardi.find((t) => t.tipo === "contratto" || t.tipo === "apertura")!;
  const datePreviste = fasi.flatMap((f) => [f.previstoInizio, f.previstoFine]).filter((d): d is string => !!d).sort();
  const lavoriDa = order.work_start_date ?? datePreviste[0] ?? null;
  const lavoriA = order.work_end_date ?? datePreviste[datePreviste.length - 1] ?? null;
  // Fino a quattro mesi una settimana resta leggibile (8 px al giorno), oltre
  // bastano i mesi: così un cantiere normale entra nello schermo senza scorrere.
  const largo = Math.max(720, COLONNA_PX + asse.giorni * (asse.giorni > 120 ? 4 : 8));

  // Se il grafico non entra, si apre su oggi, con un po' di passato a sinistra.
  const grafico = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = grafico.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const x = COLONNA_PX + (giorniTra(asse.da, oggi) / asse.giorni) * (el.scrollWidth - COLONNA_PX);
    el.scrollLeft = Math.max(0, x - COLONNA_PX - (el.clientWidth - COLONNA_PX) * 0.7);
  }, [asse.da, asse.giorni, oggi, nelGrafico.length]);

  if (isLoading || crono.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border bg-white py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />Preparo il cronoprogramma…
      </div>
    );
  }
  if (isError || crono.isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-rose-200 bg-rose-50/40 py-10 text-center">
        <p className="text-sm text-rose-700">Il cronoprogramma non si è caricato. Controlla la connessione e riprova.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Riprova</Button>
      </div>
    );
  }
  if (fasi.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-10 text-center">
        <p className="max-w-md text-sm text-muted-foreground">Per vedere il cronoprogramma servono le fasi di lavoro con le loro date.</p>
        {onOpenLavorazioni && <Button size="sm" variant="outline" onClick={onOpenLavorazioni}>Vai alle lavorazioni</Button>}
      </div>
    );
  }

  return (
    <section aria-label="Cronoprogramma della commessa" className="space-y-3 rounded-lg border bg-white p-3 sm:p-4">
      {/* Riepilogo in una riga: contratto, lavori previsti, avanzamento, ritardi */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="inline-flex items-center gap-1.5">
          <FileSignature className="h-4 w-4 text-blue-800" aria-hidden="true" />
          <span className="text-muted-foreground">{contratto.etichetta}</span>
          <b className="font-semibold tabular-nums">{lunga(contratto.data)}</b>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarRange className="h-4 w-4 text-slate-500" aria-hidden="true" />
          <span className="text-muted-foreground">Lavori previsti</span>
          <b className="font-semibold tabular-nums">{lavoriDa && lavoriA ? `${breve(lavoriDa)} → ${breve(lavoriA)}` : "senza date"}</b>
        </span>
        <span className="inline-flex min-w-[14rem] flex-1 items-center gap-2">
          <span className="text-muted-foreground">Avanzamento</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
            <span className={cn("block h-full rounded-full", salute?.stato === "in_ritardo" ? "bg-rose-500" : "bg-emerald-500")} style={{ width: `${avanzamento}%` }} />
          </span>
          <b className="font-semibold tabular-nums" aria-label={`Avanzamento ${avanzamento}%`}>{avanzamento}%</b>
        </span>
        {sullaFine.length > 0 && (
          <span className="inline-flex items-center gap-1.5 font-medium text-rose-700">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {`${sullaFine.length === 1 ? "1 fase in ritardo" : `${sullaFine.length} fasi in ritardo`}, fino a ${giorni(ritardoMassimo)}`}
          </span>
        )}
        {sullInizio.length > 0 && (
          <span className="font-medium text-amber-700">
            {sullInizio.length === 1 ? "1 fase con l'inizio in ritardo" : `${sullInizio.length} fasi con l'inizio in ritardo`}
          </span>
        )}
        {sullaFine.length === 0 && sullInizio.length === 0 && (
          <span className="font-medium text-emerald-700">Nessuna fase in ritardo</span>
        )}
      </div>

      {/* Il grafico scorre in orizzontale nel suo riquadro, non la pagina; i nomi delle fasi restano fermi */}
      <div ref={grafico} className="overflow-x-auto rounded-md border">
        <div style={{ minWidth: largo }}>
          {/* Asse: le tacche */}
          <div className="flex border-b bg-slate-50 text-[11px] text-slate-500">
            <div className="sticky left-0 z-10 w-56 shrink-0 border-r bg-slate-50 px-3 py-1.5 font-semibold uppercase tracking-wide">Fase</div>
            <div className="relative h-7 flex-1">
              {segni.map((t) => (
                <span key={t.data} className="absolute top-1.5 -translate-x-1/2 whitespace-nowrap tabular-nums" style={{ left: `${t.left}%` }}>
                  {t.mese ? format(parseISO(t.data), "MMM yy", { locale: it }) : breve(t.data)}
                </span>
              ))}
            </div>
          </div>

          {/* Traguardi: contratto, inizio e fine lavori, consegna */}
          <div className="flex border-b">
            <div className="sticky left-0 z-10 w-56 shrink-0 border-r bg-white px-3 py-2 text-xs font-medium text-slate-600">Traguardi</div>
            <div className={cn("relative flex-1", etichetteTraguardi.some((x) => x.riga === 1) ? "h-12" : "h-10")}>
              <Griglia asse={asse} segni={segni} oggi={oggi} />
              {etichetteTraguardi.map(({ t, centro, riga, lato }) => (
                <span
                  key={`${t.tipo}-${t.data}`}
                  title={`${t.etichetta}: ${lunga(t.data)}`}
                  className={cn("absolute top-1.5 flex flex-col", lato === "centro" ? "items-center" : lato === "sinistra" ? "items-start" : "items-end")}
                  style={{
                    left: `${centro}%`,
                    // il rombo (10 px) resta sul suo giorno; l'etichetta non esce dal grafico
                    transform: lato === "centro" ? "translateX(-50%)" : lato === "sinistra" ? "translateX(-5px)" : "translateX(calc(-100% + 5px))",
                  }}
                >
                  <span aria-hidden="true" className={cn("h-2.5 w-2.5 rotate-45", t.tipo === "contratto" || t.tipo === "apertura" ? "bg-blue-800" : "bg-slate-500")} />
                  <span className={cn("whitespace-nowrap text-[10px] text-slate-600", riga === 1 ? "mt-3" : "mt-0.5")}>{TRAGUARDO_BREVE[t.tipo]} {breve(t.data)}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Una riga per fase: previsto sopra, reale sotto */}
          {nelGrafico.map((f) => {
            const p = previsto(f);
            const r = reale(f, oggi);
            const pb = p ? barra(p[0], p[1], asse) : null;
            const aperta = f.stato !== "completata";
            // Oltre la fine prevista, in rosso: fino alla chiusura reale, o fino a
            // oggi se la fase è ancora aperta (anche senza rapportini: è passata la
            // fine e non è chiusa). Parte da dove è cominciato il lavoro, se dopo.
            const fineOltre = aperta ? oggi : r?.[1] ?? null;
            const oltre = p && fineOltre && fineOltre > p[1]
              ? barra(r && r[0] > p[1] ? r[0] : aggiungiGiorni(p[1], 1), fineOltre, asse)
              : null;
            const entro = r ? barra(r[0], oltre && p ? p[1] : r[1], asse) : null;
            const eco = economia.perFase.get(f.id);
            const rit = ritardoFase(f);
            return (
              <div key={f.id} className="flex border-b last:border-b-0">
                <div className="sticky left-0 z-10 w-56 shrink-0 border-r bg-white px-2 py-1.5">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600"
                        aria-label={`${f.nome}: ${ETICHETTA_STATO[f.stato]}, ${f.avanzamento}%${rit ? `, ${rit.su === "fine" ? "in ritardo" : "inizio in ritardo"} di ${giorni(rit.giorni)}` : ""}`}
                      >
                        <span
                          aria-hidden="true"
                          className={cn("h-2 w-2 shrink-0 rounded-full", f.stato === "completata" ? "bg-emerald-500" : f.stato === "in_corso" ? "bg-amber-500" : "bg-slate-400")}
                        />
                        <span className="min-w-0 flex-1 truncate">{f.nome}</span>
                        {rit && (
                          <span className={cn("shrink-0 text-[11px] font-semibold tabular-nums", rit.su === "fine" ? "text-rose-700" : "text-amber-700")}>
                            {rit.su === "inizio" && "inizio "}+{rit.giorni} gg
                          </span>
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-80">
                      <Dettaglio fase={f} oggi={oggi} economia={eco} vedeVenduto={canViewOrderAmounts} vedeCosti={canViewCosts} />
                    </PopoverContent>
                  </Popover>
                  <p className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground tabular-nums">
                    <span>{f.avanzamento}%</span>
                    {canViewCosts && eco && costoSforato(eco) && <span className="font-medium text-rose-700">costo +{formatCurrency(eco.scostamento)}</span>}
                  </p>
                </div>
                <div className="relative h-14 flex-1">
                  <Griglia asse={asse} segni={segni} oggi={oggi} />
                  {pb && (
                    <span
                      data-testid={`previsto-${f.id}`}
                      className="absolute top-2.5 h-4 overflow-hidden rounded-sm border border-slate-300 bg-slate-100"
                      style={{ left: `${pb.left}%`, width: `${pb.width}%` }}
                      title={`Previsto: ${lunga(p![0])} → ${lunga(p![1])}`}
                    >
                      <span className={cn("block h-full", !aperta || !rit ? "bg-slate-300" : rit.su === "fine" ? "bg-rose-300" : "bg-amber-300")} style={{ width: `${f.avanzamento}%` }} />
                    </span>
                  )}
                  {entro && entro.width > 0 && (
                    <span
                      data-testid={`reale-${f.id}`}
                      className={cn("absolute top-8 h-2.5 rounded-full", f.stato === "completata" ? "bg-emerald-500" : "bg-amber-500")}
                      style={{ left: `${entro.left}%`, width: `${entro.width}%` }}
                      title={`Reale: dal ${lunga(r![0])}${f.realeFine ? ` al ${lunga(f.realeFine)}` : ""}`}
                    />
                  )}
                  {oltre && oltre.width > 0 && (
                    <span
                      data-testid={`oltre-${f.id}`}
                      className="absolute top-8 h-2.5 rounded-full bg-rose-500"
                      style={{ left: `${oltre.left}%`, width: `${oltre.width}%` }}
                      title={`Oltre la fine prevista: +${giorni(f.ritardoFine)}${aperta ? ", ancora aperta" : ""}`}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-6 rounded-sm border border-slate-300 bg-slate-100" />Previsto (dentro, l'avanzamento)</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-6 rounded-full bg-emerald-500" />Reale, chiusa</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-6 rounded-full bg-amber-500" />Reale, in corso</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-6 rounded-full bg-rose-500" />Oltre la fine prevista</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-0.5 bg-orange-500" />Oggi</span>
        <span className="text-[11px]">Date reali dai rapportini e dalla chiusura delle fasi. Clic su una fase per il dettaglio.</span>
      </div>

      {senzaDate.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span>
            Senza date previste: <b className="font-semibold">{senzaDate.map((f) => f.nome).join(", ")}</b>. Aggiungile in Lavorazioni per vederle qui.
          </span>
          {onOpenLavorazioni && <Button size="sm" variant="outline" className="h-7" onClick={onOpenLavorazioni}>Vai alle lavorazioni</Button>}
        </p>
      )}
    </section>
  );
}
