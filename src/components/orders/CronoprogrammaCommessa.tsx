import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { AlertTriangle, CalendarRange, Check, ChevronDown, ChevronRight, Download, FileSignature, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { usePermissions } from "@/hooks/usePermissions";
import { useOrderWorkPhases } from "@/hooks/useOrderWorkPhases";
import { useAvanzamentoCommessa } from "@/hooks/useAvanzamentoCommessa";
import { useIsMobile } from "@/hooks/use-mobile";
import { planningDay } from "@/lib/orders/planning";
import { useCronoprogramma } from "@/hooks/useCronoprogramma";
import { useSottofasi } from "@/hooks/useSottofasi";
import { useCalendarioCantiere } from "@/hooks/useCalendarioCantiere";
import { TabellaCronoprogramma } from "./TabellaCronoprogramma";
import { righeTabellaCronoprogramma } from "@/lib/orders/tabellaCronoprogramma";
import { realeSottofase, vociDelleSottofasi, type Sottofase } from "@/lib/orders/sottofasi";
import { useCostiMaterialiFasi } from "@/hooks/useCostiMaterialiFasi";
import { posaPerFaseDi } from "@/lib/distinta/consumiMateriali";
import { useVociPrevisteFasi } from "@/hooks/useVociPrevisteFasi";
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
  sottofasiCronoprogramma,
  tacche,
  traguardiCommessa,
  aggiungiGiorni,
  type Asse,
  type FaseCrono,
  type SottofaseCrono,
  type Traguardo,
} from "@/lib/orders/cronoprogramma";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { costoSforato, fontePrevistoTesto } from "./EconomiaFaseRiga";

export interface CommessaCronoprogramma {
  quote_id?: string | null;
  created_at: string;
  work_start_date: string | null;
  work_end_date: string | null;
  expected_date: string | null;
  /** Per l'intestazione del PDF. */
  order_code?: string | null;
  client_name?: string | null;
  indirizzo_lavori?: string | null;
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
          <dd className="tabular-nums">{formatCurrency(economia.costoPrevisto)}{fontePrevistoTesto(economia) && <span className="ml-1 text-xs text-muted-foreground">({fontePrevistoTesto(economia)})</span>}</dd>
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
/**
 * Un colore, un significato (31/10/2026): grigio da fare, blu in corso, verde
 * fatta, rosso in ritardo. Vale per fasi e sottofasi, barre e pallini.
 */
const COLORE = {
  da_fare: { barra: "border-slate-400 bg-white", pieno: "bg-slate-400", punto: "bg-slate-400", linea: "bg-slate-400" },
  in_corso: { barra: "border-blue-600 bg-blue-100", pieno: "bg-blue-600", punto: "bg-blue-600", linea: "bg-blue-600" },
  fatta: { barra: "border-emerald-600 bg-emerald-500", pieno: "bg-emerald-500", punto: "bg-emerald-500", linea: "bg-emerald-600" },
} as const;
type Stato = keyof typeof COLORE;
const statoFase = (f: Pick<FaseCrono, "stato">): Stato => f.stato === "completata" ? "fatta" : f.stato === "in_corso" ? "in_corso" : "da_fare";

/** I sabati e le domeniche, in grigio chiaro, quando i giorni sono abbastanza larghi da vederli. */
function FineSettimana({ asse }: { asse: Asse }) {
  if (asse.giorni > 120) return null;
  const giorniFS: string[] = [];
  for (let i = 0; i < asse.giorni; i++) {
    const d = aggiungiGiorni(asse.da, i);
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) giorniFS.push(d);
  }
  return <>{giorniFS.map((d) => { const b = barra(d, d, asse); return <span key={d} aria-hidden="true" className="absolute inset-y-0 bg-slate-50" style={{ left: `${b.left}%`, width: `${b.width}%` }} />; })}</>;
}

function Griglia({ asse, segni, oggi }: { asse: Asse; segni: ReturnType<typeof tacche>; oggi: string }) {
  const posOggi = barra(oggi, oggi, asse);
  return (
    <>
      <FineSettimana asse={asse} />
      {segni.map((t) => (
        <span key={t.data} aria-hidden="true" className="absolute inset-y-0 w-px bg-slate-100" style={{ left: `${t.left}%` }} />
      ))}
      {oggi >= asse.da && oggi <= asse.a && <span aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-orange-500/80" style={{ left: `${posOggi.left + posOggi.width / 2}%` }} />}
    </>
  );
}

/** Una sottofase sotto la sua fase: barra sottile, verde se fatta, rossa se passata la fine e non fatta. */
/** Una riga di sottofase: con le date (salvate o stimate) o, se non ne ha, solo il suo reale. */
type RigaSotto = Omit<SottofaseCrono, "previstoInizio" | "previstoFine"> & { previstoInizio: string | null; previstoFine: string | null };

/** Le sottofasi di una fase per il grafico: tutte, anche senza date (31/10/2026). */
function righeSottofasi(tutte: ReadonlyArray<Sottofase>, conDate: ReadonlyArray<SottofaseCrono>): RigaSotto[] {
  const perId = new Map(conDate.map((d) => [d.id, d]));
  return tutte.map((s): RigaSotto => {
    const d = perId.get(s.id);
    if (d) return d;
    const reale = realeSottofase(s);
    return {
      id: s.id, nome: s.name, fatta: s.fatta, previstoInizio: null, previstoFine: null, giorni: s.giorni ?? null,
      ritardo: 0, fuoriDallaFase: false, stimata: false, realeInizio: s.iniziata_il ?? null,
      giorniLavorati: s.giorni_lavorati ?? 0, realeFine: reale?.finita ?? null, scarto: 0,
    };
  });
}

/** Una barra tenuta dentro il grafico: quello che esce si taglia al bordo. */
function dentro(b: { left: number; width: number } | null): { left: number; width: number } | null {
  if (!b) return null;
  const da = Math.max(0, b.left), a = Math.min(100, b.left + b.width);
  return a > da ? { left: da, width: a - da } : null;
}

/**
 * Una sottofase sotto la sua fase, con le stesse regole della fase (31/10/2026):
 * una barra sola, colorata per stato e piena se fatta; tratteggiata se stimata; la
 * coda rossa se va oltre la fine prevista, con «+N gg». Il reale (linea sottile
 * sotto) solo in «Previsto e reale». Una data fuori dal grafico non lo allarga.
 */
function RigaSottofase({ s, numero, asse, segni, oggi, conReale }: { s: RigaSotto; numero: string; asse: Asse; segni: ReturnType<typeof tacche>; oggi: string; conReale: boolean }) {
  const stato: Stato = s.fatta ? "fatta" : s.realeInizio ? "in_corso" : "da_fare";
  const previsto = dentro(s.previstoInizio && s.previstoFine ? barra(s.previstoInizio, s.previstoFine, asse) : null);
  // Il lavoro vero: dal primo giorno alla fine (o a oggi, se è ancora aperta).
  const inizioReale = s.realeInizio ?? (s.fatta ? s.realeFine : null);
  const fineReale = s.realeFine ?? (s.realeInizio && oggi > s.realeInizio ? oggi : s.realeInizio);
  // Oltre la fine prevista: fino alla fine reale, o a oggi se ancora da finire.
  const fineOltre = s.fatta ? s.realeFine : s.previstoFine && oggi > s.previstoFine ? oggi : null;
  const gOltre = s.previstoFine && fineOltre && fineOltre > s.previstoFine && !s.stimata ? giorniTra(s.previstoFine, fineOltre) : 0;
  const reale = conReale && inizioReale && fineReale
    ? dentro(barra(inizioReale, gOltre && fineReale > s.previstoFine! ? (inizioReale > s.previstoFine! ? inizioReale : s.previstoFine!) : fineReale, asse))
    : null;
  const coda = gOltre > 0 ? dentro(barra(inizioReale && conReale && inizioReale > s.previstoFine! ? inizioReale : aggiungiGiorni(s.previstoFine!, 1), fineOltre!, asse)) : null;
  const principale = reale ?? previsto;
  const esito = s.realeFine ? ` · finita il ${lunga(s.realeFine)}${s.scarto > 0 ? `, ${giorni(s.scarto)} dopo` : s.scarto < 0 ? `, ${giorni(-s.scarto)} prima` : ", in tempo"}` : "";
  const quando = s.previstoInizio && s.previstoFine
    ? `${lunga(s.previstoInizio)}${s.previstoFine !== s.previstoInizio ? ` → ${lunga(s.previstoFine)}` : ""}${s.giorni ? ` · ${giorni(s.giorni)} necessari` : ""}`
    : "senza date";
  const titolo = `${s.nome}: previsto ${quando}${s.realeInizio ? ` · lavorata dal ${lunga(s.realeInizio)}, ${giorni(s.giorniLavorati)} di lavoro` : ""}${s.fatta ? esito || " · fatta" : ""}${gOltre ? ` · +${giorni(gOltre)} oltre la fine prevista` : ""}${s.stimata ? " · stimata: date non salvate" : ""}${s.fuoriDallaFase ? " · fuori dalle date della fase" : ""}`;
  return (
    <div data-testid={`sottofase-${s.id}`} className="flex border-b last:border-b-0">
      <div className="sticky left-0 z-10 flex w-56 shrink-0 items-center gap-1.5 border-r bg-white py-0.5 pl-6 pr-2 text-[11px]">
        <span className="w-7 shrink-0 tabular-nums text-muted-foreground">{numero}</span>
        <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", gOltre > 0 && !s.fatta ? "bg-red-600" : COLORE[stato].punto)} />
        <span className="min-w-0 flex-1 truncate text-slate-700" title={s.nome}>{s.nome}</span>
        {s.fatta && <Check aria-label="fatta" className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
      </div>
      <div className="relative h-7 flex-1" title={titolo}>
        <Griglia asse={asse} segni={segni} oggi={oggi} />
        {!principale && !coda && <span className="absolute left-2 top-1.5 text-[10px] italic text-muted-foreground">senza date{s.fatta ? " · fatta" : ""}</span>}
        {principale && (
          <span
            data-testid={reale ? `sottofase-lavoro-${s.id}` : `sottofase-barra-${s.id}`}
            className={cn("absolute top-1.5 h-3.5 overflow-hidden rounded border",
              COLORE[stato].barra,
              !reale && s.stimata && "border-dashed bg-white", s.fuoriDallaFase && "ring-1 ring-amber-500")}
            style={{ left: `${principale.left}%`, width: `${principale.width}%` }}
            title={titolo}
          />
        )}
        {reale && previsto && (
          <span data-testid={`sottofase-barra-${s.id}`} aria-hidden="true" className="absolute top-[22px] h-0.5 rounded-full bg-slate-400"
            style={{ left: `${previsto.left}%`, width: `${previsto.width}%` }} title={titolo} />
        )}
        {coda && (
          <span data-testid={`sottofase-oltre-${s.id}`} aria-hidden="true"
            className={cn("absolute top-1.5 h-3.5 rounded-r", s.fatta ? "bg-red-400" : "bg-red-600")}
            style={{ left: `${coda.left}%`, width: `${coda.width}%` }} />
        )}
      </div>
    </div>
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
  const { perFase: sottofasiDi } = useSottofasi(orderId);
  // Sottofasi: di base aperte solo nelle fasi in corso; la freccia di una fase inverte la sua scelta.
  const [invertite, setInvertite] = useState<ReadonlySet<string>>(new Set());
  const apertaDiBase = (f: Pick<FaseCrono, "stato">) => f.stato === "in_corso";
  const sottofasiAperte = (f: Pick<FaseCrono, "id" | "stato">) => apertaDiBase(f) !== invertite.has(f.id);
  const apriChiudi = (f: Pick<FaseCrono, "id">) => setInvertite((prev) => { const n = new Set(prev); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; });
  const { lavorativo } = useCalendarioCantiere();
  const isMobile = useIsMobile();
  const [periodoScelto, setPeriodo] = useState<"previsto" | "confronto" | null>(null);
  const [scala, setScala] = useState<"adatta" | "mesi" | "settimane">("adatta");
  const [vista, setVista] = useState<"grafico" | "elenco" | "tabella">("grafico");
  const [stampa, setStampa] = useState<"pronta" | "in_corso">("pronta");
  const { data: costiMateriali } = useCostiMaterialiFasi(orderId, canViewCosts);
  const posaPerFase = useMemo(() => posaPerFaseDi(costiMateriali?.rapportini, materials), [costiMateriali, materials]);
  const { data: vociPreviste } = useVociPrevisteFasi(orderId, canViewCosts);
  const { daMostrare: avanzamentoDellaCommessa } = useAvanzamentoCommessa(orderId);

  const oggi = giornoLocale(new Date().toISOString());
  const economia = useMemo(
    () => economiaFasi({ fasi: phases, righe: materials, assegnazioni: allAssignments, acquisti: costiMateriali?.acquisti, movimenti: costiMateriali?.movimenti, posaPerFase, vociPreviste }),
    [phases, materials, allAssignments, costiMateriali, posaPerFase, vociPreviste],
  );
  const fasi = useMemo(
    () => fasiCronoprogramma(
      phases.map((p) => ({ id: p.id, name: p.name, status: p.status, percentuale: p.percentuale, start_date: p.start_date, end_date: p.end_date, completata_il: p.completata_il })),
      lavoroRealeFasi(crono.rapportini),
      oggi,
    ),
    [phases, crono.rapportini, oggi],
  );
  // Le sottofasi datate di ogni fase: una riga sottile ciascuna, sotto la fase.
  const sotto = useMemo(() => {
    const mappa = new Map<string, SottofaseCrono[]>();
    for (const f of fasi) {
      const righe = sottofasiCronoprogramma(f, sottofasiDi.get(f.id) ?? [], oggi, lavorativo);
      if (righe.length) mappa.set(f.id, righe);
    }
    return mappa;
  }, [fasi, sottofasiDi, oggi, lavorativo]);
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
  const dateSottofasi = useMemo(
    // Solo il previsto delle sottofasi: una spunta lontana (dati vecchi) non allunga il grafico.
    () => [...sotto.values()].flat().flatMap((s) => [s.previstoInizio, s.previstoFine]),
    [sotto],
  );
  // La tabella: fasi e sottofasi con date, giorni, persone, quantità e costi della voce del computo.
  const righeTabella = useMemo(() => righeTabellaCronoprogramma(fasi, sottofasiDi, sotto, {
    economia: economia.perFase, voci: vociDelleSottofasi(vociPreviste ?? []).perSottofase,
  }), [fasi, sottofasiDi, sotto, economia, vociPreviste]);
  // Il PDF da stampare: tutte le fasi con tutte le sottofasi, sullo stesso periodo del grafico.
  const scaricaPdf = async () => {
    setStampa("in_corso");
    try {
      const { pdfCronoprogramma } = await import("@/lib/orders/pdfCronoprogramma");
      const blob = await pdfCronoprogramma({
        titolo: `Cronoprogramma${order.order_code ? ` · ${order.order_code}` : ""}`,
        dettagli: [order.client_name, order.indirizzo_lavori].filter(Boolean).join(" · ") || undefined,
        righe: righeTabella, da: asse.da, a: asse.a, oggi,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `cronoprogramma${order.order_code ? `-${order.order_code}` : ""}.pdf`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setStampa("pronta");
    }
  };
  const asse = useMemo(() => intervalloCronoprogramma(fasi, traguardi, oggi, periodo, dateSottofasi), [fasi, traguardi, oggi, periodo, dateSottofasi]);
  const segni = useMemo(() => {
    const tutti = tacche(asse, scala === "adatta" ? undefined : scala);
    const passo = scala === "adatta" ? Math.max(1, Math.ceil(tutti.length / 10)) : 1;
    return tutti.filter((_, index) => index % passo === 0);
  }, [asse, scala]);
  // Nel grafico niente «Consegna»: ripeterebbe la fine lavori (resta nell'elenco dei traguardi).
  const etichetteTraguardi = posizioniTraguardi(traguardi.filter(t => t.tipo !== "consegna" && t.data >= asse.da && t.data <= asse.a), asse);
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
          <Button size="sm" variant="outline" onClick={() => setVista(vista === "tabella" ? "grafico" : "tabella")}>{vista === "tabella" ? "Grafico" : "Tabella"}</Button>
        </div>}
        <div className="flex flex-wrap gap-2">
          {!isMobile && vista === "grafico" && !riepilogo.tutteChiuse && oggi >= asse.da && oggi <= asse.a && <Button size="sm" variant="ghost" onClick={() => {
            const el = grafico.current;
            if (el) el.scrollLeft = Math.max(0, (giorniTra(asse.da, oggi) / asse.giorni) * (el.scrollWidth - COLONNA_PX) - (el.clientWidth - COLONNA_PX) / 2);
          }}>Vai a oggi</Button>}
          <Button size="sm" variant="outline" disabled={stampa === "in_corso"} onClick={scaricaPdf}>
            {stampa === "in_corso" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}Scarica PDF
          </Button>
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
              {oggi >= asse.da && oggi <= asse.a && (() => { const o = barra(oggi, oggi, asse); return (
                <span className="absolute top-0.5 -translate-x-1/2 rounded bg-orange-500 px-1 text-[10px] font-semibold text-white" style={{ left: `${o.left + o.width / 2}%` }}>oggi</span>
              ); })()}
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
          {nelGrafico.map((f, indice) => {
            const p = previsto(f);
            const r = reale(f, oggi);
            const pb = p ? barra(p[0], p[1], asse) : null;
            const aperta = f.stato !== "completata";
            // Oltre la fine prevista, in rosso: fino alla chiusura reale, o fino a
            // oggi se la fase è ancora aperta (anche senza rapportini: è passata la
            // fine e non è chiusa). Parte da dove è cominciato il lavoro, se dopo.
            const fineOltre = aperta ? oggi : r?.[1] ?? null;
            const oltre = p && !f.dateIncoerenti && fineOltre && fineOltre > p[1]
              ? barra(r && r[0] > p[1] ? r[0] : aggiungiGiorni(p[1], 1), fineOltre, asse)
              : null;
            const entro = r ? barra(r[0], oltre && p ? p[1] : r[1], asse) : null;
            const eco = economia.perFase.get(f.id);
            const rit = ritardoFase(f);
            const stato = statoFase(f);
            const sottofasiFase = sottofasiDi.get(f.id) ?? [];
            const aperte = sottofasiFase.length > 0 && sottofasiAperte(f);
            const numero = String(indice + 1);
            const etichettaRitardo = rit ? `${rit.su === "inizio" ? "inizio " : ""}+${rit.giorni} gg` : null;
            const fineEtichetta = oltre && oltre.width > 0 ? oltre.left + oltre.width : pb ? pb.left + pb.width : null;
            return (
              <Fragment key={f.id}>
              <div className={cn("flex border-b last:border-b-0", aperte && "bg-slate-50/60")}>
                <div className="sticky left-0 z-10 flex w-56 shrink-0 items-center border-r bg-white px-1.5 py-1">
                  {sottofasiFase.length > 0 ? (
                    <button type="button" onClick={() => apriChiudi(f)} aria-expanded={aperte}
                      aria-label={`${aperte ? "Nascondi" : "Mostra"} le sottofasi di ${f.nome}`}
                      title={`${sottofasiFase.length} sottofasi`}
                      className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-slate-100">
                      {aperte ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                  ) : <span className="w-5 shrink-0" />}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600"
                        aria-label={`${f.nome}: ${ETICHETTA_STATO[f.stato]}, ${f.avanzamento}%${rit ? `, ${!aperta ? "scostamento storico" : rit.su === "fine" ? "in ritardo" : "inizio in ritardo"} di ${giorni(rit.giorni)}` : ""}`}
                      >
                        <span className="w-4 shrink-0 text-[11px] tabular-nums text-muted-foreground">{numero}</span>
                        <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", rit && aperta && rit.su === "fine" ? "bg-red-600" : COLORE[stato].punto)} />
                        <span className="min-w-0 flex-1 break-words text-xs font-semibold text-slate-800">{f.nome}</span>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{f.avanzamento}%</span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-80">
                      {canViewCosts && eco && costoSforato(eco) && <p className="mb-2 rounded bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700">costo +{formatCurrency(eco.scostamento)}</p>}
                      <Dettaglio fase={f} oggi={oggi} economia={eco} vedeVenduto={canViewOrderAmounts} vedeCosti={canViewCosts} />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="relative h-9 flex-1">
                  <Griglia asse={asse} segni={segni} oggi={oggi} />
                  {(() => {
                    // Nel confronto la barra è il REALE e il previsto una linea sottile sotto;
                    // altrimenti la barra è il previsto. La coda rossa è la parte oltre la fine prevista.
                    const conReale = periodo === "confronto" && !!entro && entro.width > 0;
                    const principale = conReale ? entro : pb;
                    const testid = conReale ? `reale-${f.id}` : `previsto-${f.id}`;
                    const tinta = COLORE[stato].linea;
                    const titolo = conReale ? `Reale: dal ${lunga(r![0])}${f.realeFine ? ` al ${lunga(f.realeFine)}` : ""}` : `Previsto: ${lunga(p![0])} → ${lunga(p![1])} · ${f.avanzamento}%`;
                    return <>
                      {principale && principale.width > 0 && (aperte ? (
                        // Fase aperta: una parentesi che abbraccia le sue sottofasi.
                        // Sottile e dello stesso colore delle barre delle sottofasi sotto.
                        <span data-testid={testid} className={cn("absolute top-[22px] h-[3px] rounded-full", tinta)} style={{ left: `${principale.left}%`, width: `${principale.width}%` }} title={titolo}>
                          <span aria-hidden="true" className={cn("absolute left-0 top-0 h-2 w-[3px] rounded-b", tinta)} />
                          <span aria-hidden="true" className={cn("absolute right-0 top-0 h-2 w-[3px] rounded-b", tinta)} />
                        </span>
                      ) : (
                        <span data-testid={testid} className={cn("absolute top-2 h-4 overflow-hidden rounded border",
                          COLORE[stato].barra)}
                          style={{ left: `${principale.left}%`, width: `${principale.width}%` }} title={titolo}>
                          {stato !== "fatta" && !conReale && <span className={cn("block h-full", COLORE[stato].pieno)} style={{ width: `${f.avanzamento}%` }} />}
                        </span>
                      ))}
                      {conReale && pb && pb.width > 0 && (
                        <span data-testid={`previsto-${f.id}`} aria-hidden="true" className="absolute top-[29px] h-0.5 rounded-full bg-slate-400" style={{ left: `${pb.left}%`, width: `${pb.width}%` }} />
                      )}
                    </>;
                  })()}
                  {oltre && oltre.width > 0 && (
                    <span
                      data-testid={`oltre-${f.id}`}
                      className={cn("absolute rounded-r", aperte ? "top-[22px] h-[3px]" : "top-2 h-4", aperta ? "bg-red-600" : "bg-red-400")}
                      style={{ left: `${oltre.left}%`, width: `${oltre.width}%` }}
                      title={`Oltre la fine prevista: +${giorni(f.ritardoFine)}${aperta ? ", ancora aperta" : ""}`}
                    />
                  )}
                  {etichettaRitardo && fineEtichetta != null && (
                    <span className={cn("absolute whitespace-nowrap pl-1.5 text-[11px] font-bold tabular-nums text-red-600", aperte ? "top-3" : "top-2")}
                      style={{ left: `${Math.min(94, fineEtichetta)}%` }} title={!aperta ? "Scostamento storico" : "Ritardo aperto"}>{etichettaRitardo}</span>
                  )}
                  {f.realeFine && !f.realeInizio && <span data-testid={`chiusura-${f.id}`} title={`Chiusura registrata ${lunga(f.realeFine)} · inizio non rilevato`} className="absolute top-[22px] flex items-center gap-1 text-[10px] text-emerald-800" style={{ left: `${Math.min(98, barra(f.realeFine, f.realeFine, asse).left)}%`, transform: f.realeFine > asse.a ? "translateX(-100%)" : undefined }}>
                    <span aria-hidden="true" className="h-2 w-2 shrink-0 rotate-45 bg-emerald-700" />
                    {(f.realeFine < asse.da || f.realeFine > asse.a) && <span className="whitespace-nowrap">{f.realeFine > asse.a ? "→" : "←"} {lunga(f.realeFine)}</span>}
                  </span>}
                </div>
              </div>
              {aperte && righeSottofasi(sottofasiFase, sotto.get(f.id) ?? []).map((s, k) => (
                <RigaSottofase key={s.id} s={s} numero={`${numero}.${k + 1}`} asse={asse} segni={segni} oggi={oggi} conReale={periodo === "confronto"} />
              ))}
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* Legenda: un colore, un significato */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-6 rounded border border-slate-400 bg-white" />Da fare</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-6 overflow-hidden rounded border border-blue-600 bg-blue-100"><span className="block h-full w-1/2 bg-blue-600" /></span>In corso</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-6 rounded bg-emerald-500" />Fatta</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-6 rounded bg-red-600" />Ritardo (chiaro se già chiusa)</span>
        {periodo === "confronto" && <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-0.5 w-6 rounded-full bg-slate-400" />Previsto (la barra è il reale)</span>}
        {[...sotto.values()].some(r => r.some(s => s.stimata)) && <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-6 rounded border border-dashed border-slate-400 bg-white" />Stimata</span>}
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-0.5 bg-orange-500" />Oggi</span>
      </div>
      </>}

      {!isMobile && vista === "tabella" && <TabellaCronoprogramma righe={righeTabella} vediCosti={canViewCosts} vediVenduto={canViewOrderAmounts}
        onEsporta={async () => {
          const { esportaCronoprogrammaExcel } = await import("@/lib/orders/esportaCronoprogramma");
          const blob = await esportaCronoprogrammaExcel(righeTabella, "Cronoprogramma", { costi: canViewCosts, venduto: canViewOrderAmounts });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a"); a.href = url; a.download = "cronoprogramma.xlsx"; a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }} />}
      {(isMobile || vista === "elenco") && <div aria-label="Agenda delle fasi" className="grid min-w-0 gap-3 lg:grid-cols-2">
        {fasi.map(f => <article key={f.id} className="min-w-0 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="min-w-0 break-words text-sm font-semibold">{f.nome}</h3><span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{ETICHETTA_STATO[f.stato]}</span></div>
          <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs [&_dd]:break-words">
            <dt className="text-muted-foreground">Previsto</dt><dd>{f.dateIncoerenti ? "Date da verificare" : `${f.previstoInizio ? lunga(f.previstoInizio) : "Inizio da definire"} → ${f.previstoFine ? lunga(f.previstoFine) : "Fine da definire"}`}</dd>
            <dt className="text-muted-foreground">Reale</dt><dd>{f.realeFine ? `${f.chiusuraRegistrata ? "Chiusura" : "Ultimo rapportino"} ${lunga(f.realeFine)}${!f.realeInizio ? " · inizio non rilevato" : ""}` : f.realeInizio ? `Dal ${lunga(f.realeInizio)} · ${f.stato === "completata" ? "chiusura non datata" : "senza chiusura registrata"}` : "Non rilevato"}</dd>
          </dl>
          {f.dateIncoerenti ? <p className="mt-2 text-xs text-amber-800">Verifica le date della fase.</p> : ritardoFase(f) && <p className={cn("mt-2 text-xs", f.stato === "completata" ? "text-amber-800" : "text-rose-700")}>{f.stato === "completata" ? "Scostamento storico" : "Ritardo aperto"}: +{giorni(ritardoFase(f)!.giorni)}</p>}
          {(sotto.get(f.id) ?? []).length > 0 && <ul aria-label={`Sottofasi di ${f.nome}`} className="mt-2 space-y-0.5 border-l-2 border-slate-100 pl-2 text-xs">
            {sotto.get(f.id)!.map(s => <li key={s.id} className="flex flex-wrap justify-between gap-x-2">
              <span className={cn(s.fatta && "text-muted-foreground line-through")}>{s.nome}</span>
              <span className={cn("tabular-nums text-muted-foreground", s.ritardo > 0 && "text-rose-700")}>{breve(s.previstoInizio)}{s.previstoFine !== s.previstoInizio && ` → ${breve(s.previstoFine)}`}{s.giorni ? ` · ${s.giorni} gg` : ""}{s.ritardo > 0 && ` · +${giorni(s.ritardo)}`}{s.realeFine && ` · finita ${breve(s.realeFine)}${s.scarto > 0 ? ` (+${s.scarto})` : ""}`}</span>
            </li>)}
          </ul>}
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
