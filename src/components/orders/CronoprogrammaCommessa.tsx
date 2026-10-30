import { useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { AlertTriangle, CalendarRange, FileSignature, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { usePermissions } from "@/hooks/usePermissions";
import { useOrderWorkPhases } from "@/hooks/useOrderWorkPhases";
import { useAvanzamentoCommessa } from "@/hooks/useAvanzamentoCommessa";
import { useIsMobile } from "@/hooks/use-mobile";
import { planningDay } from "@/lib/orders/planning";
import { useCronoprogramma } from "@/hooks/useCronoprogramma";
import { useCostiMaterialiFasi } from "@/hooks/useCostiMaterialiFasi";
import { posaPerFaseDi } from "@/lib/distinta/consumiMateriali";
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
  riepilogoCronoprogramma,
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

const breve = (d: string) => planningDay(d) ? format(parseISO(d), "dd/MM", { locale: it }) : "Da verificare";
const lunga = (d: string) => planningDay(d) ? format(parseISO(d), "dd/MM/yyyy", { locale: it }) : "Da verificare";
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
  return da && a && a >= da ? [da, a] : null;
}

/** Intervallo reale: dal primo rapportino alla chiusura, o fino a oggi se è in corso. */
function reale(f: FaseCrono, oggi: string): [string, string] | null {
  if (!f.realeInizio) return null;
  if (f.realeFine && f.realeFine < f.realeInizio) return null;
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
  const r = reale(fase, oggi);
  return (
    <div className="space-y-2 text-sm">
      <p className="break-words font-semibold">{fase.nome}</p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs [&_dd]:break-words">
        <dt className="text-muted-foreground">Stato</dt>
        <dd>{ETICHETTA_STATO[fase.stato]} · {fase.avanzamento}%</dd>
        <dt className="text-muted-foreground">Previsto</dt>
        <dd>{fase.dateIncoerenti ? "Date da verificare" : fase.previstoInizio && fase.previstoFine ? `dal ${lunga(fase.previstoInizio)} al ${lunga(fase.previstoFine)} (${giorni(giorniTra(fase.previstoInizio, fase.previstoFine) + 1)})` : fase.previstoInizio ? `Inizio ${lunga(fase.previstoInizio)} · fine da definire` : fase.previstoFine ? `Fine ${lunga(fase.previstoFine)} · inizio da definire` : "Da pianificare"}</dd>
        <dt className="text-muted-foreground">Reale</dt>
        <dd>
          {fase.dateIncoerenti ? "Date da verificare" : fase.realeFine && !fase.realeInizio
            ? `${fase.chiusuraRegistrata ? "Chiusura registrata" : "Ultimo rapportino"} ${lunga(fase.realeFine)} · inizio non rilevato`
            : r
            ? fase.realeFine
              ? `dal ${lunga(r[0])} al ${lunga(fase.realeFine)}${!fase.chiusuraRegistrata ? " (ultimo rapportino, chiusura non datata)" : ""}`
              : `dal ${lunga(r[0])}, ${fase.stato === "in_corso" ? "in corso" : "senza chiusura registrata"}`
            : fase.stato === "da_iniziare" ? "Non ancora rilevato" : fase.stato === "completata" ? "Completata · data di chiusura non disponibile" : "Nessun rapportino sulla fase"}
        </dd>
        {(fase.ritardoInizio > 0 || fase.ritardoFine > 0) && <>
          <dt className="text-muted-foreground">{fase.stato === "completata" ? "Scostamento storico" : "Ritardo"}</dt>
          <dd className={cn("font-medium", fase.stato === "completata" ? "text-amber-800" : "text-rose-700")}>
            {[fase.ritardoInizio > 0 ? `inizio +${giorni(fase.ritardoInizio)}` : null, fase.ritardoFine > 0 ? `fine +${giorni(fase.ritardoFine)}` : null].filter(Boolean).join(" · ")}
          </dd>
        </>}
        {fase.ore > 0 && <>
          <dt className="text-muted-foreground">Ore</dt>
          <dd>{fase.ore.toLocaleString("it-IT")} h dichiarate nei rapportini inviati/approvati</dd>
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
      {oggi >= asse.da && oggi <= asse.a && <span aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-orange-500/80" style={{ left: `${posOggi.left + posOggi.width / 2}%` }} />}
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
 * i numeri economici seguono i permessi. Da telefono si usa l'agenda delle fasi.
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
  const isMobile = useIsMobile();
  const [periodoScelto, setPeriodo] = useState<"previsto" | "confronto" | null>(null);
  const [scala, setScala] = useState<"adatta" | "mesi" | "settimane">("adatta");
  const [vista, setVista] = useState<"grafico" | "elenco">("grafico");
  const { data: costiMateriali } = useCostiMaterialiFasi(orderId, canViewCosts);
  const posaPerFase = useMemo(() => posaPerFaseDi(costiMateriali?.rapportini, materials), [costiMateriali, materials]);
  const { daMostrare: avanzamentoDellaCommessa } = useAvanzamentoCommessa(orderId);

  const oggi = giornoLocale(new Date().toISOString());
  const economia = useMemo(
    () => economiaFasi({ fasi: phases, righe: materials, assegnazioni: allAssignments, acquisti: costiMateriali?.acquisti, movimenti: costiMateriali?.movimenti, posaPerFase }),
    [phases, materials, allAssignments, costiMateriali, posaPerFase],
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

  // Active work opens on the comparison including today; completed jobs open on
  // their readable planned period. An explicit selection always wins.
  const periodo = periodoScelto ?? (fasi.some(f => f.stato !== "completata") ? "confronto" : "previsto");
  const nelGrafico = fasi.filter((f) => previsto(f) || f.realeInizio || f.realeFine);
  const senzaDate = fasi.filter((f) => !previsto(f) && !f.realeInizio && !f.realeFine);
  const asse = useMemo(() => intervalloCronoprogramma(fasi, traguardi, oggi, periodo), [fasi, traguardi, oggi, periodo]);
  const segni = useMemo(() => {
    const tutti = tacche(asse, scala === "adatta" ? undefined : scala);
    const passo = scala === "adatta" ? Math.max(1, Math.ceil(tutti.length / 10)) : 1;
    return tutti.filter((_, index) => index % passo === 0);
  }, [asse, scala]);
  const etichetteTraguardi = posizioniTraguardi(traguardi.filter(t => t.data >= asse.da && t.data <= asse.a), asse);
  const avanzamento = avanzamentoDellaCommessa(avanzamentoComplessivo(fasi));
  const riepilogo = riepilogoCronoprogramma(fasi);
  const sullaFine = riepilogo.aperteInRitardo.map(ritardoFase).filter((r) => r?.su === "fine");
  const sullInizio = riepilogo.aperteInRitardo.map(ritardoFase).filter((r) => r?.su === "inizio");
  const ritardoMassimo = Math.max(0, ...sullaFine.map((r) => r!.giorni));
  const contratto = traguardi.find((t) => t.tipo === "contratto" || t.tipo === "apertura");
  const datePreviste = fasi.flatMap((f) => [f.previstoInizio, f.previstoFine]).filter((d): d is string => !!d).sort();
  const lavoriDa = planningDay(order.work_start_date) || datePreviste[0] || null;
  const lavoriA = planningDay(order.work_end_date) || datePreviste[datePreviste.length - 1] || null;
  // Fino a quattro mesi una settimana resta leggibile (8 px al giorno), oltre
  // bastano i mesi: così un cantiere normale entra nello schermo senza scorrere.
  const largo = scala === "adatta" ? 720 : Math.min(24_000, Math.max(720, COLONNA_PX + asse.giorni * (scala === "settimane" ? 14 : 4)));
  const fuoriPeriodo = fasi.filter(f => [f.realeInizio, f.realeFine].some(d => d && (d < asse.da || d > asse.a)));

  // Start at the execution period, not today for an old completed job.
  const grafico = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = grafico.current;
    if (el) el.scrollLeft = 0;
  }, [orderId, periodo, scala, vista, isMobile]);

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
        <Button variant="outline" size="sm" onClick={() => { void refetch(); void crono.refetch(); }}>Riprova</Button>
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
        {contratto && <span className="inline-flex items-center gap-1.5">
          <FileSignature className="h-4 w-4 text-blue-800" aria-hidden="true" />
          <span className="text-muted-foreground">{contratto.etichetta}</span>
          <b className="font-semibold tabular-nums">{lunga(contratto.data)}</b>
        </span>}
        <span className="inline-flex items-center gap-1.5">
          <CalendarRange className="h-4 w-4 text-slate-500" aria-hidden="true" />
          <span className="text-muted-foreground">Lavori previsti</span>
          <b className="font-semibold tabular-nums">{lavoriDa && lavoriA ? `${lunga(lavoriDa)} → ${lunga(lavoriA)}` : "Da pianificare"}</b>
        </span>
        <span className="inline-flex min-w-[14rem] flex-1 items-center gap-2">
          <span className="text-muted-foreground">Avanzamento</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
            <span className={cn("block h-full rounded-full", riepilogo.aperteInRitardo.length ? "bg-rose-500" : "bg-emerald-500")} style={{ width: `${avanzamento}%` }} />
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
        {riepilogo.tutteChiuse && <span className="font-medium text-emerald-700">Lavori completati · {riepilogo.completate}/{fasi.length} fasi</span>}
        {!riepilogo.tutteChiuse && sullaFine.length === 0 && sullInizio.length === 0 && (
          <span className="font-medium text-emerald-700">Nessun ritardo aperto rilevato</span>
        )}
      </div>

      {(riepilogo.chiuseOltre.length > 0 || riepilogo.senzaFineReale.length > 0 || riepilogo.incoerenti.length > 0 || riepilogo.senzaPiano.length > 0) && <details className="rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2 text-xs">
        <summary className="cursor-pointer font-medium text-amber-900">Storico e dati da verificare · {[
          riepilogo.chiuseOltre.length ? `${riepilogo.chiuseOltre.length} ${riepilogo.chiuseOltre.length === 1 ? "fase chiusa" : "fasi chiuse"} oltre la fine prevista` : null,
          riepilogo.senzaFineReale.length ? `${riepilogo.senzaFineReale.length} chiusure senza data` : null,
          riepilogo.senzaPiano.length ? `${riepilogo.senzaPiano.length} fasi da pianificare` : null,
          riepilogo.incoerenti.length ? `${riepilogo.incoerenti.length} fasi con date incoerenti` : null,
        ].filter(Boolean).join(" · ")}</summary>
        <p className="mt-2 text-muted-foreground">Gli scostamenti delle fasi completate sono storici, non ritardi ancora aperti. Una data di chiusura non prova da sola la durata del lavoro. Verifica le date in Lavorazioni, senza ricostruirle automaticamente.</p>
        {riepilogo.incoerenti.length > 0 && <p className="mt-1 text-amber-900">Date incoerenti: {riepilogo.incoerenti.map(f => f.nome).join(", ")}.</p>}
      </details>}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        {!isMobile && <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Periodo del grafico" className="flex rounded-md border p-0.5">
            <Button size="sm" variant={periodo === "previsto" ? "secondary" : "ghost"} aria-pressed={periodo === "previsto"} onClick={() => setPeriodo("previsto")}>Periodo previsto</Button>
            <Button size="sm" variant={periodo === "confronto" ? "secondary" : "ghost"} aria-pressed={periodo === "confronto"} onClick={() => setPeriodo("confronto")}>Previsto e reale</Button>
          </div>
          {vista === "grafico" && <label className="flex items-center gap-2 text-xs text-muted-foreground">Scala
            <select aria-label="Scala del cronoprogramma" value={scala} onChange={e => setScala(e.target.value as typeof scala)} className="h-9 rounded-md border bg-white px-2 text-foreground">
              <option value="adatta">Adatta al riquadro</option><option value="mesi">Mesi</option><option value="settimane">Settimane</option>
            </select>
          </label>}
          <Button size="sm" variant="outline" onClick={() => setVista(vista === "grafico" ? "elenco" : "grafico")}>{vista === "grafico" ? "Elenco fasi" : "Grafico"}</Button>
        </div>}
        <div className="flex flex-wrap gap-2">
          {!isMobile && vista === "grafico" && !riepilogo.tutteChiuse && oggi >= asse.da && oggi <= asse.a && <Button size="sm" variant="ghost" onClick={() => {
            const el = grafico.current;
            if (el) el.scrollLeft = Math.max(0, (giorniTra(asse.da, oggi) / asse.giorni) * (el.scrollWidth - COLONNA_PX) - (el.clientWidth - COLONNA_PX) / 2);
          }}>Vai a oggi</Button>}
          {onOpenLavorazioni && <Button size="sm" variant="outline" onClick={onOpenLavorazioni}>Gestisci fasi e date</Button>}
        </div>
      </div>

      {!isMobile && vista === "grafico" && <>
      <p className="text-xs text-muted-foreground">Periodo visualizzato: {lunga(asse.da)} → {lunga(asse.a)} · giorni di calendario</p>
      {fuoriPeriodo.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-900">
        <span>{fuoriPeriodo.length} fasi hanno date reali fuori dal periodo visualizzato. Le date restano disponibili nei dettagli.</span>
        <Button size="sm" variant="outline" onClick={() => setPeriodo("confronto")}>Mostra tutto il confronto</Button>
      </div>}

      {/* Il grafico scorre in orizzontale nel suo riquadro, non la pagina; i nomi delle fasi restano fermi */}
      <div ref={grafico} role="region" aria-label="Grafico delle fasi, scorrimento orizzontale" tabIndex={0} className="overflow-x-auto rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600">
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
            // Il 14/10 era diventato `aperta && r`: la fase mai iniziata restava
            // «in ritardo» nel riepilogo ma senza la parte rossa nel grafico.
            const fineOltre = aperta ? oggi : r?.[1] ?? null;
            const oltre = p && !f.dateIncoerenti && fineOltre && fineOltre > p[1]
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
                        aria-label={`${f.nome}: ${ETICHETTA_STATO[f.stato]}, ${f.avanzamento}%${rit ? `, ${!aperta ? "scostamento storico" : rit.su === "fine" ? "in ritardo" : "inizio in ritardo"} di ${giorni(rit.giorni)}` : ""}`}
                      >
                        <span
                          aria-hidden="true"
                          className={cn("h-2 w-2 shrink-0 rounded-full", f.stato === "completata" ? "bg-emerald-500" : f.stato === "in_corso" ? "bg-amber-500" : "bg-slate-400")}
                        />
                        <span className="min-w-0 flex-1 break-words text-xs">{f.nome}</span>
                        {rit && (
                          <span title={!aperta ? "Scostamento storico" : "Ritardo aperto"} className={cn("shrink-0 text-[11px] font-semibold tabular-nums", aperta && rit.su === "fine" ? "text-rose-700" : "text-amber-700")}>
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
                <div className="relative min-h-16 flex-1">
                  <Griglia asse={asse} segni={segni} oggi={oggi} />
                  {pb && pb.width > 0 && (
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
                      className={cn("absolute top-8 h-2.5 rounded-full", aperta ? "bg-rose-500" : "bg-amber-500")}
                      style={{ left: `${oltre.left}%`, width: `${oltre.width}%` }}
                      title={`Oltre la fine prevista: +${giorni(f.ritardoFine)}${aperta ? ", ancora aperta" : ""}`}
                    />
                  )}
                  {f.realeFine && !f.realeInizio && <span data-testid={`chiusura-${f.id}`} title={`Chiusura registrata ${lunga(f.realeFine)} · inizio non rilevato`} className="absolute top-8 flex items-center gap-1 text-[10px] text-emerald-800" style={{ left: `${Math.min(98, barra(f.realeFine, f.realeFine, asse).left)}%`, transform: f.realeFine > asse.a ? "translateX(-100%)" : undefined }}>
                    <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rotate-45 bg-emerald-500" />
                    {(f.realeFine < asse.da || f.realeFine > asse.a) && <span className="whitespace-nowrap">{f.realeFine > asse.a ? "→" : "←"} {lunga(f.realeFine)}</span>}
                  </span>}
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
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-6 rounded-full bg-rose-500" />Ritardo aperto</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-6 rounded-full bg-amber-500" />Scostamento storico, fase chiusa</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rotate-45 bg-emerald-500" />Chiusura senza inizio rilevato</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-0.5 bg-orange-500" />Oggi</span>
        <span className="text-[11px]">Date reali dai rapportini e dalla chiusura delle fasi. Clic su una fase per il dettaglio.</span>
      </div>
      </>}

      {(isMobile || vista === "elenco") && <div aria-label="Agenda delle fasi" className="grid min-w-0 gap-3 lg:grid-cols-2">
        {fasi.map(f => <article key={f.id} className="min-w-0 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="min-w-0 break-words text-sm font-semibold">{f.nome}</h3><span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{ETICHETTA_STATO[f.stato]}</span></div>
          <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs [&_dd]:break-words">
            <dt className="text-muted-foreground">Previsto</dt><dd>{f.dateIncoerenti ? "Date da verificare" : `${f.previstoInizio ? lunga(f.previstoInizio) : "Inizio da definire"} → ${f.previstoFine ? lunga(f.previstoFine) : "Fine da definire"}`}</dd>
            <dt className="text-muted-foreground">Reale</dt><dd>{f.realeFine ? `${f.chiusuraRegistrata ? "Chiusura" : "Ultimo rapportino"} ${lunga(f.realeFine)}${!f.realeInizio ? " · inizio non rilevato" : ""}` : f.realeInizio ? `Dal ${lunga(f.realeInizio)} · ${f.stato === "completata" ? "chiusura non datata" : "senza chiusura registrata"}` : "Non rilevato"}</dd>
          </dl>
          {f.dateIncoerenti ? <p className="mt-2 text-xs text-amber-800">Verifica le date della fase.</p> : ritardoFase(f) && <p className={cn("mt-2 text-xs", f.stato === "completata" ? "text-amber-800" : "text-rose-700")}>{f.stato === "completata" ? "Scostamento storico" : "Ritardo aperto"}: +{giorni(ritardoFase(f)!.giorni)}</p>}
          <div className="mt-3 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><div className={cn("h-full rounded-full", f.stato === "completata" ? "bg-emerald-500" : "bg-amber-500")} style={{width: `${f.avanzamento}%`}} /></div><span className="text-xs tabular-nums">{f.avanzamento}%</span></div>
          <details className="mt-3 border-t pt-2"><summary className="cursor-pointer text-xs text-blue-900">Dettagli della fase</summary><div className="mt-3"><Dettaglio fase={f} oggi={oggi} economia={economia.perFase.get(f.id)} vedeVenduto={canViewOrderAmounts} vedeCosti={canViewCosts} /></div></details>
        </article>)}
      </div>}

      <details className="rounded-md border px-3 py-2 text-xs"><summary className="cursor-pointer text-muted-foreground">Traguardi della commessa ({traguardi.length})</summary><dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2">{traguardi.map(t => <div key={`${t.tipo}-${t.data}`} className="contents"><dt>{t.etichetta}</dt><dd className="tabular-nums">{lunga(t.data)}</dd></div>)}</dl></details>

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
