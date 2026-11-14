/**
 * Tab Dashboard — Stato Azienda sintetico.
 *
 * Schermata di apertura: 6 KPI macro con la variazione, cassa prevista,
 * obiettivo (budget o pareggio), cantieri, ricavi e costi mese per mese, alert.
 * Pensata per dare un colpo d'occhio "salute aziendale" all'imprenditore.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import { useCEriclassificato, useBEP, useCEMensile } from "@/hooks/controlloGestione/useCEriclassificato";
import { useStatoPatrimoniale, useRating } from "@/hooks/controlloGestione/useStatoPatrimoniale";
import { useCashFlow } from "@/hooks/controlloGestione/useCashFlow";
import { usePFN } from "@/hooks/controlloGestione/usePFN";
import { useIndiciAvanzati } from "@/hooks/controlloGestione/useIndiciAvanzati";
import { useMarginalitaCommesse } from "@/hooks/controlloGestione/useMarginalitaCommesse";
import { useBudgetConfronto } from "@/hooks/controlloGestione/useBudget";
import { formatEuroRiquadro, formatImportiNelTesto, formatNumero, formatPct } from "@/lib/controlloGestione/formatCG";
import { CogestEmptyState } from "@/components/controllo-gestione/CogestEmptyState";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  Activity, AlertTriangle, ArrowRight,
  Banknote, BarChart3, Bot, Building, Briefcase, CheckCircle2,
  ChevronDown, ChevronUp, ClipboardList, Send, Shield,
  Sparkles, Target, TrendingDown, TrendingUp, Wallet,
} from "lucide-react";
import { GraficoAndamento } from "@/components/charts/grafici/GraficoAndamento";
import { GraficoRicaviCosti } from "@/components/charts/grafici/GraficoRicaviCosti";
import { Comparsa, PillolaVariazione, StatGrafico } from "@/components/charts/grafici/comune";
import { useIsMobile } from "@/hooks/use-mobile";
// Nei testi il mese per intero: «la cassa di ottobre», non «di Ott».
const MESI_INTERI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

interface Props {
  anno: number;
}

const MESI_LABELS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

type ActionPriority = "alta" | "media" | "bassa";

interface RecommendedAction {
  id: string;
  priority: ActionPriority;
  title: string;
  reason: string;
  impact: string;
  owner: string;
  due: string;
  href: string;
  cta: string;
}

interface CfoContext {
  anno: number;
  ricavi: number;
  /** Valore della Produzione (voce "A" del CE) — denominatore ufficiale dei margini. */
  pil: number;
  ebitda: number;
  utile: number;
  saldoChiusura: number | null;
  saldoMinimo: number | null;
  meseSaldoMinimo: string | null;
  pfn: number | null;
  ratingClasse: string | null;
  ratingScore: number | null;
  commesseInPerdita: number;
  margineAttesoCommesse: number | null;
  budgetRicaviVariancePct: number | null;
  bilancioQuadrato: boolean | null;
  azioni: RecommendedAction[];
}

interface CfoAnswer {
  title: string;
  summary: string;
  focus: string[];
  nextActions: string[];
  links: Array<{ label: string; href: string }>;
}

const CFO_QUICK_PROMPTS = [
  "Perché la cassa va sotto zero?",
  "Come miglioro il rating bancario?",
  "Dove sto perdendo margine?",
  "Fammi una sintesi per la direzione",
] as const;

const ACTION_PRIORITY_ORDER: Record<ActionPriority, number> = {
  alta: 0,
  media: 1,
  bassa: 2,
};

const ACTION_PRIORITY_STYLES: Record<ActionPriority, string> = {
  alta: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
  media: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
  bassa: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
};

export function TabDashboard({ anno }: Props) {
  const isMobile = useIsMobile();
  const ce  = useCEriclassificato(anno, 1, 12);
  const sp  = useStatoPatrimoniale(anno);
  const cf  = useCashFlow(anno, 1, 12);
  const pfn = usePFN(anno);
  const idx = useIndiciAvanzati(anno);
  const com = useMarginalitaCommesse(anno);
  const bep = useBEP(anno);
  const bdg = useBudgetConfronto(anno);
  const rt  = useRating(anno);
  // Confronto con l'anno prima sullo stesso periodo: per l'anno in corso
  // gennaio → mese di oggi, altrimenti l'anno intero. EBITDA e utile dell'anno
  // in corso contano anche i costi programmati: lì il confronto non regge.
  const annoChiuso = anno < new Date().getFullYear();
  const meseConfronto = annoChiuso ? 12 : new Date().getMonth() + 1;
  const cePrec = useCEriclassificato(anno - 1, 1, meseConfronto);
  const mensile = useCEMensile(anno, !isMobile);
  const [cfoQuestion, setCfoQuestion] = useState<string>(CFO_QUICK_PROMPTS[0]);
  const [cfoAnswer, setCfoAnswer] = useState<CfoAnswer | null>(null);

  const isPreparingDashboard =
    ce.isLoading || sp.isLoading || cf.isLoading || pfn.isLoading
    || idx.isLoading || com.isLoading || bep.isLoading || bdg.isLoading || rt.isLoading;
  const hasPartialDataError =
    sp.isError || cf.isError || pfn.isError || idx.isError
    || com.isError || bep.isError || bdg.isError || rt.isError;

  // Estrai voci CE
  const findCe = (codice: string) =>
    ce.data?.voci.find((v) => v.codice === codice)?.valore ?? 0;
  const ricavi = findCe("01");
  // Denominatore margini = PIL (Valore della Produzione, voce "A") come nel tab
  // CE: con rimanenze/LIC a zero coincide coi ricavi, ma appena si popolano i
  // due tab divergerebbero. Fallback ai ricavi se il PIL non c'è ancora.
  const pil    = findCe("A") || ricavi;
  const ebitda = findCe("E");
  const ebit   = findCe("F");
  const utile  = findCe("L");
  const valorePrec = (codice: string) => cePrec.data?.voci.find((v) => v.codice === codice)?.valore;
  const varPct = (attuale: number, prec: number | undefined) =>
    !ce.data || prec == null || prec === 0 ? null : ((attuale - prec) / Math.abs(prec)) * 100;
  const notaConfronto = annoChiuso
    ? `Rispetto al ${anno - 1}`
    : `Rispetto a gennaio–${MESI_INTERI[meseConfronto - 1]} ${anno - 1}`;

  const obiettivo = useMemo<Obiettivo | null>(() => {
    if (bdg.data?.haBudget && bdg.data.ricavi.budget > 0) {
      return {
        titolo: `Obiettivo ricavi ${anno}`,
        fatto: ricavi,
        meta: bdg.data.ricavi.budget,
        nota: `Con il passo di oggi a fine anno: ${formatEuroRiquadro(bdg.data.ricavi.previsione)}.`,
        href: "/azienda/controllo-gestione/budget",
        cta: "Budget",
      };
    }
    const b = bep.data;
    if (b && b.bep_fatturato_minimo != null && b.bep_fatturato_minimo > 0) {
      return {
        titolo: "Fatturato per andare in pari",
        fatto: b.ricavi_consuntivi,
        meta: b.bep_fatturato_minimo,
        nota: b.gia_raggiunto
          ? `Pareggio raggiunto${b.bep_data ? ` il ${formatDate(b.bep_data)}` : ""}: da qui in poi i ricavi lasciano margine.`
          : b.bep_data
            ? `Pareggio previsto il ${formatDate(b.bep_data)}.`
            : "Con il passo di oggi il pareggio non arriva entro l'anno.",
        href: "/azienda/controllo-gestione/ce",
        cta: "Dettaglio",
      };
    }
    return null;
  }, [bdg.data, bep.data, anno, ricavi]);

  // Mini chart andamento ricavi mensile YTD
  const chartData = useMemo(() => {
    if (!cf.data) return [];
    // Il previsionale parte da oggi: a ottobre sono tre mesi. Il punto «Oggi»
    // (saldo dei conti adesso) dà l'inizio della linea.
    return [
      { mese: "Oggi", saldo: cf.data.meta.saldo_apertura },
      ...cf.data.mesi.map((m) => ({
        mese: `Fine ${MESI_LABELS[m.mese - 1].toLowerCase()}`,
        saldo: m.saldo_fine,
      })),
    ];
  }, [cf.data]);

  const worstCashMonth = useMemo(() => {
    const mesi = cf.data?.mesi ?? [];
    if (mesi.length === 0) return null;
    return mesi.reduce((worst, month) =>
      month.saldo_fine < worst.saldo_fine ? month : worst,
    );
  }, [cf.data]);

  const budgetRicavi = useMemo(
    // Solo se il budget c'è: senza, ogni confronto sarebbe contro zero.
    () => (bdg.data?.haBudget ? bdg.data.righe.find((v) => v.codice === "01") ?? null : null),
    [bdg.data],
  );

  // Alerts
  const alerts = useMemo(() => {
    const out: Array<{ severity: "rosso" | "giallo" | "verde"; testo: string; href?: string }> = [];

    if (cf.data) {
      const sottoZeroMonths = cf.data.mesi.filter((m) => m.sotto_zero);
      if (sottoZeroMonths.length > 0) {
        const primo = sottoZeroMonths[0];
        out.push({
          severity: "rosso",
          testo: `Cassa sotto zero a ${MESI_INTERI[primo.mese - 1]} (${formatCurrency(primo.saldo_fine)}). Verifica scadenze ed entrate previste.`,
          href: "/azienda/controllo-gestione/cash-flow",
        });
      }
    }

    if (com.data && com.data.kpi.n_in_perdita > 0) {
      out.push({
        severity: "rosso",
        testo: `${com.data.kpi.n_in_perdita} ${com.data.kpi.n_in_perdita === 1 ? "commessa stimata" : "commesse stimate"} in perdita a fine lavori (margine atteso sotto zero, aperte e chiuse). Rivedi costi e preventivi.`,
        href: "/azienda/controllo-gestione/commesse",
      });
    }

    if (bep.data && bep.data.bep_data && !bep.data.gia_raggiunto) {
      out.push({
        severity: "giallo",
        testo: `Break Even Point previsto per il ${formatDate(bep.data.bep_data)} (${bep.data.giorni_residui} giorni residui).`,
      });
    }

    if (idx.data?.altman.classe === "distress") {
      out.push({
        severity: "rosso",
        testo: `Punteggio di solidità (Z-score di Altman) in zona di pericolo: ${formatNumero(idx.data.altman.z_score, 2)}. Rischio di insolvenza elevato.`,
        href: "/azienda/controllo-gestione/indici",
      });
    } else if (idx.data?.altman.classe === "grey") {
      out.push({
        severity: "giallo",
        testo: `Punteggio di solidità (Z-score di Altman) in zona grigia: ${formatNumero(idx.data.altman.z_score, 2)}. Da tenere d'occhio.`,
        href: "/azienda/controllo-gestione/indici",
      });
    }

    if (idx.data?.dscr.valore != null && idx.data.dscr.valore < 1.2 && idx.data.dscr.classe !== "na") {
      out.push({
        severity: "giallo",
        testo: `Copertura delle rate (DSCR) ${formatNumero(idx.data.dscr.valore, 2)}: sotto la soglia delle banche (1,20). Rinnovare o ottenere mutui sarà difficile.`,
        href: "/azienda/controllo-gestione/indici",
      });
    }

    // Variance budget critica
    if (budgetRicavi) {
      if (budgetRicavi.semaforo === "rosso") {
        out.push({
          severity: "rosso",
          testo: `Ricavi previsti a fine anno ${formatPct(budgetRicavi.scostamentoPct, 0, true)} rispetto al budget: sotto l'obiettivo.`,
          href: "/azienda/controllo-gestione/budget",
        });
      }
    }

    if (out.length === 0 && isPreparingDashboard) {
      out.push({
        severity: "giallo",
        testo: "Indicatori in aggiornamento: le segnalazioni si ricalcolano appena arrivano tutti i dati.",
      });
    } else if (out.length === 0) {
      out.push({ severity: "verde", testo: "Nessuna criticità rilevata. Tutti gli indicatori in range." });
    }
    return out;
  }, [cf.data, com.data, bep.data, idx.data, budgetRicavi, isPreparingDashboard]);

  const recommendedActions = useMemo<RecommendedAction[]>(() => {
    const out: RecommendedAction[] = [];

    if (isPreparingDashboard) {
      out.push({
        id: "dati-in-aggiornamento",
        priority: "bassa",
        title: "Sto aggiornando gli indicatori direzionali",
        reason: "Alcuni dati potrebbero ancora arrivare: le priorità si aggiornano automaticamente.",
        impact: "Evita una pagina vuota e mantiene leggibile lo stato del modulo.",
        owner: "Sistema",
        due: "Ora",
        href: "/azienda/controllo-gestione/health",
        cta: "Vedi controllo dei dati",
      });
    }

    if (sp.data && !sp.data.quadratura.quadrato) {
      out.push({
        id: "quadratura-bilancio",
        priority: "alta",
        title: "Riconcilia il bilancio prima di usarlo per decisioni",
        reason: `Attivo e passivo differiscono di ${formatCurrency(Math.abs(sp.data.quadratura.differenza))}: nella scheda Stato patrimoniale trovi le voci che mancano.`,
        impact: "Evita analisi e report banca basati su dati non quadrati.",
        owner: "Amministrazione",
        due: "Oggi",
        href: "/azienda/controllo-gestione/sp",
        cta: "Apri stato patrimoniale",
      });
    }

    if (worstCashMonth?.sotto_zero) {
      out.push({
        id: "cassa-negativa",
        priority: "alta",
        title: `Metti in sicurezza la cassa di ${MESI_INTERI[worstCashMonth.mese - 1]}`,
        reason: `Il saldo previsto scende a ${formatCurrency(worstCashMonth.saldo_fine)}.`,
        impact: "Priorità a incassi, scadenze fornitori e uscite rinviabili.",
        owner: "Titolare + amministrazione",
        due: "Entro 48h",
        href: "/azienda/controllo-gestione/cash-flow",
        cta: "Apri cash flow",
      });
    }

    if ((com.data?.kpi.n_in_perdita ?? 0) > 0) {
      out.push({
        id: "commesse-in-perdita",
        priority: "alta",
        title: "Rivedi subito le commesse in perdita",
        reason: `${com.data?.kpi.n_in_perdita ?? 0} commesse stanno erodendo margine.`,
        impact: `Margine atteso totale: ${formatCurrency(com.data?.kpi.margine_atteso_totale ?? 0)}.`,
        owner: "Responsabile commesse",
        due: "Questa settimana",
        href: "/azienda/controllo-gestione/commesse",
        cta: "Apri commesse",
      });
    }

    if (budgetRicavi?.semaforo === "rosso") {
      out.push({
        id: "budget-ricavi",
        priority: "media",
        title: "Riallinea forecast ricavi e piano commerciale",
        reason: `Ricavi previsti a fine anno ${formatPct(budgetRicavi.scostamentoPct, 0, true)} rispetto al budget.`,
        impact: "Serve una decisione: recupero vendite, revisione target o taglio costi.",
        owner: "Direzione commerciale",
        due: "Entro 7 giorni",
        href: "/azienda/controllo-gestione/budget",
        cta: "Apri budget",
      });
    }

    if (rt.data && !isRatingAtLeast(rt.data.classe, "BBB")) {
      out.push({
        id: "rating-bancario",
        priority: "media",
        title: "Prepara un piano per migliorare il rating bancario",
        reason: `Classe attuale ${rt.data.classe}, punteggio ${formatNumero(rt.data.score, 1)}.`,
        impact: "Migliora negoziazione bancaria e accesso a nuove linee.",
        owner: "Direzione + consulente",
        due: "Entro mese",
        href: "/azienda/controllo-gestione/rating",
        cta: "Apri rating",
      });
    }

    if (pfn.data && ebitda > 0 && pfn.data.pfn / ebitda > 1.5) {
      out.push({
        id: "pfn-ebitda",
        priority: "media",
        title: "Riduci l'indebitamento rispetto alla marginalità",
        reason: `Debiti finanziari netti pari a ${formatNumero(pfn.data.pfn / ebitda, 1)} anni di margine (PFN/EBITDA): le banche guardano con attenzione sopra 1,5.`,
        impact: "Riduce pressione su cassa, rating e rinnovo fidi.",
        owner: "Direzione finanziaria",
        due: "Prossimi 30 giorni",
        href: "/azienda/controllo-gestione/pfn-debiti",
        cta: "Apri PFN",
      });
    }

    if (out.length === 0) {
      out.push({
        id: "nessuna-criticita",
        priority: "bassa",
        title: "Mantieni il ritmo e consolida i dati",
        reason: "Gli indicatori principali non mostrano blocchi immediati.",
        impact: "Usa il mese per migliorare forecast, note e classificazioni.",
        owner: "Direzione",
        due: "Mensile",
        href: "/azienda/controllo-gestione/health",
        cta: "Controlla dati",
      });
    }

    return out
      .sort((a, b) => ACTION_PRIORITY_ORDER[a.priority] - ACTION_PRIORITY_ORDER[b.priority])
      .slice(0, 4);
  }, [isPreparingDashboard, sp.data, worstCashMonth, com.data, budgetRicavi, rt.data, pfn.data, ebitda]);

  const cfoContext: CfoContext = useMemo(() => ({
    anno,
    ricavi,
    pil,
    ebitda,
    utile,
    saldoChiusura: cf.data?.meta.saldo_chiusura ?? null,
    saldoMinimo: worstCashMonth?.saldo_fine ?? null,
    meseSaldoMinimo: worstCashMonth ? MESI_LABELS[worstCashMonth.mese - 1] : null,
    pfn: pfn.data?.pfn ?? null,
    ratingClasse: rt.data?.attendibile === true ? rt.data.classe : null,
    ratingScore: rt.data?.attendibile === true ? rt.data.score : null,
    commesseInPerdita: com.data?.kpi.n_in_perdita ?? 0,
    margineAttesoCommesse: com.data?.kpi.margine_atteso_totale ?? null,
    budgetRicaviVariancePct: budgetRicavi?.scostamentoPct ?? null,
    bilancioQuadrato: sp.data?.quadratura.quadrato ?? null,
    azioni: recommendedActions,
  }), [
    anno,
    ricavi,
    pil,
    ebitda,
    utile,
    cf.data,
    worstCashMonth,
    pfn.data,
    rt.data,
    com.data,
    budgetRicavi,
    sp.data,
    recommendedActions,
  ]);

  const handleCfoQuestion = (question = cfoQuestion) => {
    const cleanQuestion = question.trim();
    if (!cleanQuestion) return;
    setCfoQuestion(cleanQuestion);
    setCfoAnswer(buildCfoAnswer(cleanQuestion, cfoContext));
  };

  if (ce.isError) {
    return (
      <ErrorBlock
        onRetry={() => {
          void ce.refetch();
        }}
      />
    );
  }

  // MP-DIR-001 Fase 2.1 — Empty state quando la company ha la feature attiva
  // ma nessun dato classificato. Riconosciamo "empty" se le 4 voci principali
  // del CE riclassificato sono tutte a zero (no ricavi, no ebitda, no ebit,
  // no utile) E il cash flow non ha mesi popolati.
  const isCogestEmpty =
    ricavi === 0 && ebitda === 0 && ebit === 0 && utile === 0
    && (cf.data?.mesi?.length ?? 0) === 0
    && (com.data?.righe?.length ?? 0) === 0;

  if (!ce.isLoading && !cf.isLoading && !com.isLoading && isCogestEmpty) {
    return <CogestEmptyState />;
  }

  // Da 640 prima i numeri, poi cassa e obiettivo, poi ricavi/costi e avvisi,
  // in fondo regia e assistente. Sul telefono l'ordine resta quello del codice.
  const datiCassa = chartData.map((p, i) => ({
    etichetta: p.mese,
    etichettaLunga: i === 0 ? "oggi" : p.mese.toLowerCase(),
    valore: p.saldo,
  }));
  const minimoCassa = datiCassa.length > 0 ? datiCassa.reduce((a, b) => (b.valore < a.valore ? b : a)) : null;
  const pctCassa = cf.data && cf.data.meta.saldo_apertura !== 0
    ? ((cf.data.meta.saldo_chiusura - cf.data.meta.saldo_apertura) / Math.abs(cf.data.meta.saldo_apertura)) * 100
    : null;

  return (
    <div className="space-y-3 sm:flex sm:flex-col sm:gap-3 sm:space-y-0">
      <div className="sm:order-5">
        <DashboardActionCenter
          actions={recommendedActions}
          cfoQuestion={cfoQuestion}
          cfoAnswer={cfoAnswer}
          onQuestionChange={setCfoQuestion}
          onAsk={handleCfoQuestion}
        />
      </div>

      {hasPartialDataError && (
        <div className="sm:order-1">
        <PartialDataWarning
          onRetry={() => {
            void sp.refetch();
            if (anno >= new Date().getFullYear()) void cf.refetch();
            void pfn.refetch();
            void idx.refetch();
            void com.refetch();
            void bep.refetch();
            void bdg.refetch();
            void rt.refetch();
          }}
        />
        </div>
      )}

      {rt.data && rt.data.attendibile !== true && (
        <div role="alert" className="sm:order-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <strong>Dati da riconciliare.</strong> Il rating è provvisorio. {(rt.data.motivi ?? []).map(formatImportiNelTesto).join(" · ")}{" "}
          <Link className="underline" to="/azienda/controllo-gestione/health">Apri controlli dei dati</Link>
        </div>
      )}
      {/* Top: 6 KPI macro (tre per riga da 768, sei da 1280) con la variazione */}
      <div className="grid grid-cols-2 gap-2.5 sm:order-2 md:grid-cols-3 xl:grid-cols-6">
        <Comparsa indice={0}>
        <KPIMacro
          label="Ricavi"
          value={ce.data ? ricavi : null}
          sub={`Fatturato ${anno}, IVA esclusa`}
          spiegazione="Fatture emesse nell'anno, senza IVA."
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          tone="blue"
          href="/azienda/controllo-gestione/ce"
          variazione={varPct(ricavi, valorePrec("01"))}
          notaVariazione={notaConfronto}
        />
        </Comparsa>
        <Comparsa indice={1}>
        <KPIMacro
          label="EBITDA"
          value={ce.data ? ebitda : null}
          sub={ce.data && pil > 0 ? `Margine ${formatPct((ebitda / pil) * 100)}` : "—"}
          spiegazione="EBITDA (MOL): quanto resta dei ricavi dopo materiali, lavorazioni, personale e spese generali, prima di ammortamenti, interessi e tasse."
          icon={<Activity className="h-3.5 w-3.5" />}
          tone={ebitda >= 0 ? "green" : "red"}
          href="/azienda/controllo-gestione/ce"
          variazione={annoChiuso ? varPct(ebitda, valorePrec("E")) : null}
          notaVariazione={notaConfronto}
        />
        </Comparsa>
        <Comparsa indice={2}>
        <KPIMacro
          label="Utile previsto"
          value={ce.data ? utile : null}
          sub={ce.data && pil > 0 ? `Margine ${formatPct((utile / pil) * 100)}` : "—"}
          spiegazione="Utile dopo ammortamenti, interessi e imposte stimate. Per l'anno in corso comprende i costi già programmati."
          icon={<Wallet className="h-3.5 w-3.5" />}
          tone={utile >= 0 ? "green" : "red"}
          href="/azienda/controllo-gestione/ce"
          variazione={annoChiuso ? varPct(utile, valorePrec("L")) : null}
          notaVariazione={notaConfronto}
        />
        </Comparsa>
        <Comparsa indice={3}>
        <KPIMacro
          label="Cassa fine anno prevista"
          value={cf.data ? cf.data.meta.saldo_chiusura : null}
          sub={cf.data ? `Oggi ${formatEuroRiquadro(cf.data.meta.saldo_apertura)}` : anno < new Date().getFullYear() ? "Per gli anni chiusi vedi Cash Flow" : "—"}
          spiegazione="Saldo dei conti a fine anno: saldo di oggi più incassi attesi meno pagamenti in scadenza."
          icon={<Banknote className="h-3.5 w-3.5" />}
          tone={!cf.data ? "neutral" : cf.data.meta.saldo_chiusura >= 0 ? "green" : "red"}
          href="/azienda/controllo-gestione/cash-flow"
          variazione={pctCassa}
          notaVariazione="rispetto al saldo di oggi"
        />
        </Comparsa>
        <Comparsa indice={4}>
        <KPIMacro
          label="PFN"
          value={pfn.data ? pfn.data.pfn : null}
          sub={pfn.data ? (pfn.data.pfn > 0 ? "Più debiti che liquidità" : "Più liquidità che debiti") : "—"}
          spiegazione="PFN (posizione finanziaria netta): mutui e scoperti meno soldi in banca. Sotto zero vuol dire che la liquidità copre i debiti."
          icon={pfn.data && pfn.data.pfn > 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
          tone={!pfn.data ? "neutral" : pfn.data.pfn > 0 ? "amber" : "green"}
          href="/azienda/controllo-gestione/pfn-debiti"
        />
        </Comparsa>
        <Comparsa indice={5}>
        <KPIMacro
          label="Rating bancario"
          value={rt.data ? rt.data.attendibile === true ? rt.data.classe : "Provvisorio" : "—"}
          sub={rt.data ? rt.data.attendibile === true ? `Punteggio ${formatNumero(rt.data.score, 1)} · stima interna` : `Stima ${rt.data.classe}, dati da riconciliare` : "—"}
          spiegazione="Stima interna di come una banca giudica l'azienda, da AAA (ottimo) a CCC. Non è il rating ufficiale della banca."
          icon={<Shield className="h-3.5 w-3.5" />}
          tone={!rt.data ? "neutral" : rt.data.attendibile !== true ? "amber"
                : (rt.data.classe === "AAA" || rt.data.classe === "AA" || rt.data.classe === "A") ? "green"
                : (rt.data.classe === "BBB" || rt.data.classe === "BB") ? "blue"
                : "red"}
          href="/azienda/controllo-gestione/rating"
        />
        </Comparsa>
      </div>

      {/* Cassa grande a sinistra, obiettivo e cantieri in colonna a destra. */}
      <div className="grid grid-cols-1 gap-3 sm:order-3 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <Comparsa indice={6} className="min-w-0">
        <Card className={CARD_CG}>
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 p-3 pb-2 sm:p-4 sm:pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold sm:text-base">
              <IconaTitolo><Banknote className="h-3.5 w-3.5" /></IconaTitolo>
              Cassa prevista da oggi a fine {anno}
            </CardTitle>
            <Link to="/azienda/controllo-gestione/cash-flow" className="shrink-0 text-xs font-medium text-primary underline-offset-2 hover:underline">
              Cash flow →
            </Link>
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
            {cf.isLoading && !cf.data ? (
              <div className="flex h-56 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
                Dati cassa in aggiornamento...
              </div>
            ) : anno < new Date().getFullYear() ? (
              <p className="text-sm text-muted-foreground">Per il {anno} consulta i movimenti registrati. Il previsionale parte dal mese corrente.</p>
            ) : datiCassa.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun dato di cassa.</p>
            ) : isMobile ? (
              // Telefono: niente grafico (illeggibile a 375px e pesante da
              // montare), i tre numeri che contano.
              <div className="grid grid-cols-3 gap-3 rounded-xl border bg-muted/30 px-3 py-2">
                <StatGrafico etichetta="Oggi" valore={formatEuroRiquadro(datiCassa[0].valore)} />
                <StatGrafico
                  etichetta="Più bassa"
                  valore={formatEuroRiquadro(minimoCassa?.valore ?? 0)}
                  nota={minimoCassa?.etichettaLunga}
                  tono={(minimoCassa?.valore ?? 0) < 0 ? "cattivo" : "neutro"}
                />
                <StatGrafico
                  etichetta="Fine anno"
                  valore={formatEuroRiquadro(datiCassa[datiCassa.length - 1].valore)}
                  tono={datiCassa[datiCassa.length - 1].valore < 0 ? "cattivo" : "neutro"}
                />
              </div>
            ) : (
              <GraficoAndamento
                dati={datiCassa}
                nomeSerie="Saldo"
                lineaZero
                notaVariazione="da oggi a fine anno"
                altezza={230}
              />
            )}
          </CardContent>
        </Card>
        </Comparsa>

        <div className="grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <Comparsa indice={7}>
            <CardObiettivo obiettivo={obiettivo} anno={anno} caricamento={bdg.isLoading || bep.isLoading || ce.isLoading} />
          </Comparsa>
          {/* Mobile no: ripete i numeri della scheda Commesse, accanto. */}
          <Comparsa indice={8} className="max-sm:hidden">
            <CardCantieri com={com} />
          </Comparsa>
        </div>
      </div>

      {/* Ricavi e costi mese per mese accanto agli avvisi. */}
      <div className="grid grid-cols-1 gap-3 sm:order-4 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px]">
        {!isMobile && (
          <Comparsa indice={9} className="min-w-0">
          <Card className={CARD_CG}>
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <IconaTitolo><BarChart3 className="h-3.5 w-3.5" /></IconaTitolo>
                Ricavi e costi mese per mese
              </CardTitle>
              <Link to="/azienda/controllo-gestione/ce" className="shrink-0 text-xs font-medium text-primary underline-offset-2 hover:underline">
                Conto economico →
              </Link>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {mensile.isLoading && !mensile.data ? (
                <div className="flex h-56 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
                  Dati mensili in aggiornamento...
                </div>
              ) : mensile.isError ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Dati mensili non disponibili.</p>
              ) : (
                <GraficoRicaviCosti righe={mensile.data ?? []} />
              )}
            </CardContent>
          </Card>
          </Comparsa>
        )}

        <Comparsa indice={10} className={cn("min-w-0", isMobile && "lg:col-span-2")}>
        <Card className={cn(CARD_CG, "h-full")}>
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 p-3 pb-2 sm:p-4 sm:pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold sm:text-base">
              <IconaTitolo tono="amber"><AlertTriangle className="h-3.5 w-3.5" /></IconaTitolo>
              Alert e segnalazioni
            </CardTitle>
            <Badge variant="outline" className="shrink-0 tabular-nums">{alerts.filter((a) => a.severity !== "verde").length}</Badge>
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
            <ul className="space-y-2">
              {alerts.map((a, i) => (
                <li
                  key={i}
                  className={cn(
                    "flex items-start gap-2.5 rounded-xl border p-2.5 text-[13px] leading-snug",
                    a.severity === "rosso"  && "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
                    a.severity === "giallo" && "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
                    a.severity === "verde"  && "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1 inline-block h-2 w-2 shrink-0 rounded-full",
                      a.severity === "rosso"  && "bg-rose-500",
                      a.severity === "giallo" && "bg-amber-500",
                      a.severity === "verde"  && "bg-emerald-500",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p>{a.testo}</p>
                    {a.href && (!isMobile || /cash-flow|commesse/.test(a.href)) && (
                      <Link to={a.href} className="mt-0.5 inline-block text-xs font-medium underline underline-offset-2">
                        Approfondisci →
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        </Comparsa>
      </div>
    </div>
  );
}

/** Cornice comune dei riquadri della dashboard. */
const CARD_CG = "rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md";

function IconaTitolo({ children, tono = "blue" }: { children: React.ReactNode; tono?: "blue" | "amber" | "green" }) {
  return (
    <span
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
        tono === "blue" && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
        tono === "amber" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        tono === "green" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      )}
    >
      {children}
    </span>
  );
}

interface Obiettivo {
  titolo: string;
  fatto: number;
  meta: number;
  nota: string;
  href: string;
  cta: string;
}

/**
 * Riquadro scuro dell'obiettivo: il budget dei ricavi se c'è, altrimenti il
 * fatturato che serve per andare in pari (BEP). Barra che cresce all'apertura.
 */
function CardObiettivo({ obiettivo, anno, caricamento }: { obiettivo: Obiettivo | null; anno: number; caricamento: boolean }) {
  const scura = "rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-4 text-slate-50 shadow-sm dark:border-slate-700";
  if (!obiettivo) {
    return (
      <div className={scura}>
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <Target className="h-3.5 w-3.5" /> Obiettivo {anno}
        </p>
        <p className="mt-2 text-sm text-slate-300">
          {caricamento ? "Sto calcolando l'obiettivo…" : "Nessun budget dei ricavi e nessun punto di pareggio calcolabile."}
        </p>
        {!caricamento && (
          <Link to="/azienda/controllo-gestione/budget" className="mt-3 inline-block text-xs font-medium text-sky-300 underline-offset-2 hover:underline">
            Imposta il budget →
          </Link>
        )}
      </div>
    );
  }
  const pct = obiettivo.meta > 0 ? (obiettivo.fatto / obiettivo.meta) * 100 : 0;
  const raggiunto = pct >= 100;
  const manca = Math.max(0, obiettivo.meta - obiettivo.fatto);
  return (
    <div className={scura}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <Target className="h-3.5 w-3.5" /> {obiettivo.titolo}
        </p>
        <Link to={obiettivo.href} className="shrink-0 text-[11px] font-medium text-sky-300 underline-offset-2 hover:underline">
          {obiettivo.cta} →
        </Link>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums tracking-tight">{formatNumero(Math.min(pct, 999), 0)}%</span>
        <span className="text-xs text-slate-400">{raggiunto ? "raggiunto" : "fatto"}</span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(pct, 100))}
        aria-label={obiettivo.titolo}
      >
        <div
          className={cn(
            "cg-barra-cresce h-full rounded-full bg-gradient-to-r",
            raggiunto ? "from-emerald-400 to-teal-300" : "from-sky-400 to-blue-500",
          )}
          style={{ width: `${Math.max(2, Math.min(pct, 100))}%` }}
        />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <div><dt className="text-slate-400">Fatto</dt><dd className="font-semibold tabular-nums" title={formatCurrency(obiettivo.fatto)}>{formatEuroRiquadro(obiettivo.fatto)}</dd></div>
        <div><dt className="text-slate-400">Obiettivo</dt><dd className="font-semibold tabular-nums" title={formatCurrency(obiettivo.meta)}>{formatEuroRiquadro(obiettivo.meta)}</dd></div>
        <div><dt className="text-slate-400">Manca</dt><dd className={cn("font-semibold tabular-nums", manca === 0 && "text-emerald-300")}>{manca === 0 ? "niente" : formatEuroRiquadro(manca)}</dd></div>
      </dl>
      <p className="mt-2 border-t border-white/10 pt-2 text-[11px] text-slate-300">{obiettivo.nota}</p>
    </div>
  );
}

/** Riquadro chiaro dei cantieri: conteggi e una barra divisa per stato. */
function CardCantieri({ com }: { com: ReturnType<typeof useMarginalitaCommesse> }) {
  const k = com.data?.kpi;
  const totale = k ? k.n_in_corso + k.n_completate : 0;
  return (
    <div className={cn(CARD_CG, "p-4")}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <IconaTitolo tono="green"><Building className="h-3.5 w-3.5" /></IconaTitolo>
          Cantieri attivi
        </p>
        <Link to="/azienda/controllo-gestione/commesse" className="shrink-0 text-xs font-medium text-primary underline-offset-2 hover:underline">
          Commesse →
        </Link>
      </div>
      {com.isLoading && !com.data ? (
        <p className="mt-3 text-sm text-muted-foreground">Dati cantieri in aggiornamento...</p>
      ) : k ? (
        <>
          {totale > 0 && (
            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="cg-barra-cresce bg-blue-500" style={{ width: `${(k.n_in_corso / totale) * 100}%` }} />
              <div className="cg-barra-cresce bg-emerald-500" style={{ width: `${(k.n_completate / totale) * 100}%` }} />
            </div>
          )}
          <ul className="mt-3 grid grid-cols-3 gap-2 text-center">
            <li className="rounded-xl bg-blue-500/10 px-1 py-2">
              <p className="text-lg font-bold tabular-nums leading-none text-blue-700 dark:text-blue-300">{k.n_in_corso}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">Da completare</p>
            </li>
            <li className="rounded-xl bg-emerald-500/10 px-1 py-2">
              <p className="text-lg font-bold tabular-nums leading-none text-emerald-700 dark:text-emerald-300">{k.n_completate}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">Completate</p>
            </li>
            <li className="rounded-xl bg-rose-500/10 px-1 py-2">
              <p className="text-lg font-bold tabular-nums leading-none text-rose-700 dark:text-rose-300">{k.n_in_perdita}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">In perdita</p>
            </li>
          </ul>
          <p className="mt-3 flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
            Margine atteso totale
            <strong className={cn("tabular-nums", k.margine_atteso_totale < 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground")}>
              {formatCurrency(k.margine_atteso_totale)}
            </strong>
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Nessun dato.</p>
      )}
    </div>
  );
}

function PartialDataWarning({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">Alcuni indicatori non sono aggiornati</p>
          <p className="text-xs text-amber-800 dark:text-amber-200/80">
            La dashboard resta utilizzabile: i dati mancanti vengono mostrati come non disponibili.
          </p>
        </div>
      </div>
      <Button type="button" variant="outline" size="sm" className="bg-white dark:bg-background" onClick={onRetry}>
        Riprova indicatori
      </Button>
    </div>
  );
}

function DashboardActionCenter({
  actions,
  cfoQuestion,
  cfoAnswer,
  onQuestionChange,
  onAsk,
}: {
  actions: RecommendedAction[];
  cfoQuestion: string;
  cfoAnswer: CfoAnswer | null;
  onQuestionChange: (value: string) => void;
  onAsk: (question?: string) => void;
}) {
  const isMobile = useIsMobile();
  const [openActionIds, setOpenActionIds] = useState<Set<string>>(() => new Set());
  const toggleAction = (actionId: string) => {
    setOpenActionIds((current) => {
      const next = new Set(current);
      if (next.has(actionId)) {
        next.delete(actionId);
      } else {
        next.add(actionId);
      }
      return next;
    });
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
      <Card className="rounded-2xl border shadow-sm">
        <CardHeader className="pb-3 max-sm:p-3 max-sm:pb-2">
          <div className="flex items-start justify-between gap-3 max-sm:items-center">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="h-4 w-4 text-primary" />
                Regia operativa
              </CardTitle>
            </div>
            <Badge variant="outline" className="shrink-0">
              {actions.length} {actions.length === 1 ? "azione" : "azioni"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 max-sm:space-y-2 max-sm:p-3 max-sm:pt-0">
          {actions.map((action, index) => (
            <RecommendedActionRow
              key={action.id}
              action={action}
              index={index}
              isOpen={openActionIds.has(action.id)}
              onToggle={() => toggleAction(action.id)}
            />
          ))}
        </CardContent>
      </Card>

      {/* Assistente CFO (textarea + prompt): strumento da scrivania,
          ingombrante su mobile → solo da tablet in su. */}
      {!isMobile && (
      <Card className="rounded-2xl border-blue-200 bg-gradient-to-br from-blue-50 via-white to-emerald-50 shadow-sm dark:border-blue-500/30 dark:from-blue-500/10 dark:via-card dark:to-emerald-500/10">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-blue-700 dark:text-blue-400" />
            Assistente CFO
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {CFO_QUICK_PROMPTS.map((prompt) => (
              <Button
                key={prompt}
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-full bg-white/80 px-3 text-xs dark:bg-background/60"
                onClick={() => onAsk(prompt)}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {prompt}
              </Button>
            ))}
          </div>

          <div className="space-y-2">
            <Textarea
              value={cfoQuestion}
              onChange={(event) => onQuestionChange(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  onAsk();
                }
              }}
              className="min-h-[86px] resize-none bg-white/85 dark:bg-background/60"
              placeholder="Es. spiegami cosa fare nei prossimi 7 giorni per migliorare cassa e rating"
            />
            {/* Senza le frasi di spiegazione: i suggerimenti e il campo bastano. */}
            <div className="flex items-center justify-end gap-3">
              <Button
                type="button"
                size="sm"
                onClick={() => onAsk()}
                disabled={!cfoQuestion.trim()}
              >
                <Send className="h-4 w-4" />
                Analizza
              </Button>
            </div>
          </div>

          <CfoAnswerPanel answer={cfoAnswer} />
        </CardContent>
      </Card>
      )}
    </div>
  );
}

function RecommendedActionRow({
  action,
  index,
  isOpen,
  onToggle,
}: {
  action: RecommendedAction;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-3 transition hover:border-primary/30 hover:shadow-sm max-sm:px-2.5 max-sm:py-2">
      {/* Mobile: tutta la riga apre il dettaglio, non solo la freccina. */}
      <div
        className="flex items-start gap-3 max-sm:items-center max-sm:gap-2 max-sm:cursor-pointer"
        onClick={(e) => { if (window.matchMedia("(max-width: 639px)").matches && !(e.target as HTMLElement).closest("button,a")) onToggle(); }}
      >
        <div className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold max-sm:mt-0 max-sm:h-6 max-sm:w-6 max-sm:text-[11px]",
          ACTION_PRIORITY_STYLES[action.priority],
        )}>
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {/* Mobile 14px: a 16-17px in grassetto ogni azione prendeva tre righe. */}
            <p className="font-semibold leading-tight max-sm:text-sm">{action.title}</p>
            {/* Mobile no: la priorità la dice già il colore del numero, e il
                badge andava su una riga sua. */}
            <Badge
              variant="outline"
              className={cn("h-5 rounded-full px-2 text-[10px] max-sm:hidden", ACTION_PRIORITY_STYLES[action.priority])}
            >
              {action.priority}
            </Badge>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to={action.href}>
              {action.cta}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="tap-compact h-8 w-8"
            aria-label={isOpen ? "Chiudi dettagli azione" : "Apri dettagli azione"}
            aria-expanded={isOpen}
            onClick={onToggle}
          >
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {isOpen && (
        <div className="mt-3 border-t pt-3 text-sm text-muted-foreground sm:ml-10">
          <p>{action.reason}</p>
          <p className="mt-2 flex items-start gap-1.5 text-xs">
            <Target className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <span className="font-medium text-foreground">Impatto:</span> {action.impact}
            </span>
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <Briefcase className="h-3.5 w-3.5" />
              {action.owner}
            </span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {action.due}
            </span>
          </div>
          <Button asChild variant="outline" size="sm" className="mt-3 bg-background sm:hidden">
            <Link to={action.href}>
              {action.cta}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function CfoAnswerPanel({ answer }: { answer: CfoAnswer | null }) {
  // Senza risposta niente riquadro «Pronto per analizzare»: ripeteva a parole
  // i suggerimenti e il campo che stanno subito sopra.
  if (!answer) return null;

  return (
    <div className="rounded-xl border bg-white/85 p-3 dark:bg-background/60">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 rounded-full bg-blue-100 p-1 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{answer.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{answer.summary}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Lettura CFO
          </p>
          <ul className="space-y-1.5 text-sm">
            {answer.focus.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Prossime mosse
          </p>
          <ul className="space-y-1.5 text-sm">
            {answer.nextActions.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {answer.links.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {answer.links.map((link) => (
            <Button key={link.href} asChild variant="outline" size="sm" className="h-8 bg-white dark:bg-background">
              <Link to={link.href}>
                {link.label}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function KPIMacro({
  label, value, sub, icon, tone, href, spiegazione, variazione, notaVariazione,
}: {
  label: string;
  /** Numero in euro (mostrato compatto, pieno nel tooltip) o testo già pronto. */
  value: number | string | null;
  sub: string;
  spiegazione?: string;
  icon: React.ReactNode;
  tone: "blue" | "green" | "red" | "amber" | "neutral";
  href?: string;
  /** Variazione percentuale da mostrare nella pillola (null = niente pillola). */
  variazione?: number | null;
  notaVariazione?: string;
}) {
  // Mobile: nome e numero; il collegamento solo verso le schede che il
  // telefono mostra (cassa, commesse): le altre riaprivano il riepilogo.
  const isMobile = useIsMobile();
  const linkAttivo = href && (!isMobile || /cash-flow|commesse/.test(href)) ? href : undefined;
  // Filo colorato in alto e icona tinta: il colore dice lo stato senza
  // riempire tutto il riquadro.
  const filo = {
    blue: "from-blue-500 to-sky-400",
    green: "from-emerald-500 to-teal-400",
    red: "from-rose-500 to-orange-400",
    amber: "from-amber-500 to-yellow-400",
    neutral: "from-slate-300 to-slate-200 dark:from-slate-600 dark:to-slate-700",
  } as const;
  const chip = {
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    red: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    neutral: "bg-muted text-muted-foreground",
  } as const;

  const inner = (
    <Card className="relative h-full overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-200 hover:shadow-md motion-safe:hover:-translate-y-0.5">
      <span className={cn("absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r", filo[tone])} aria-hidden />
      <CardContent className="min-w-0 p-2.5 sm:p-3.5">
        <div className="flex items-center justify-between gap-2">
          {/* A capo e non troncata: «Cassa fine anno previs…» a sei per riga. */}
          <p className="line-clamp-2 text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground sm:text-[11px]" title={spiegazione}>{label}</p>
          <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-lg", chip[tone])}>{icon}</span>
        </div>
        {/* Niente truncate sul numero: «4.655.616,...» non diceva nulla. Sopra il
            milione «4,66 Mln €», l'importo pieno nel tooltip. */}
        <p
          className={cn(
            "mt-1 break-words text-base font-bold leading-tight tracking-tight tabular-nums sm:text-xl",
            tone === "red" && "text-rose-600 dark:text-rose-400",
          )}
          title={typeof value === "number" ? formatCurrency(value) : undefined}
        >
          {typeof value === "number" ? formatEuroRiquadro(value) : value ?? "—"}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <PillolaVariazione pct={variazione ?? null} titolo={notaVariazione} />
          <p className="hidden text-[10px] leading-snug text-muted-foreground sm:block sm:text-[11px]">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );

  return linkAttivo ? <Link to={linkAttivo} className="block h-full min-w-0">{inner}</Link> : inner;
}

function buildCfoAnswer(question: string, context: CfoContext): CfoAnswer {
  const q = question.toLowerCase();
  // Margini sul PIL (Valore della Produzione), come nel tab CE.
  const ebitdaMargin = context.pil > 0 ? (context.ebitda / context.pil) * 100 : null;
  const utileMargin = context.pil > 0 ? (context.utile / context.pil) * 100 : null;
  const primaryAction = context.azioni[0];

  if (q.includes("cassa") || q.includes("cash") || q.includes("liquid")) {
    return {
      title: "Diagnosi liquidità",
      summary: context.saldoMinimo !== null && context.saldoMinimo < 0
        ? `Il punto critico è ${context.meseSaldoMinimo}: saldo previsto ${formatCurrency(context.saldoMinimo)}.`
        : "La cassa non mostra un minimo negativo evidente, ma va comunque collegata a incassi e PFN.",
      focus: [
        `Saldo fine anno: ${context.saldoChiusura !== null ? formatCurrency(context.saldoChiusura) : "n.d."}.`,
        `PFN: ${context.pfn !== null ? formatCurrency(context.pfn) : "n.d."}.`,
        context.commesseInPerdita > 0
          ? `${context.commesseInPerdita} commesse in perdita possono peggiorare la cassa nei prossimi mesi.`
          : "Le commesse non mostrano perdite immediate rilevanti.",
      ],
      nextActions: [
        "Ordina gli incassi per scadenza e sollecita quelli che coprono il mese peggiore.",
        "Rimanda uscite non essenziali e verifica F24, fornitori e rate mutui.",
        "Aggiorna le voci manuali del Cash Flow per vedere subito l'effetto.",
      ],
      links: [
        { label: "Apri cash flow", href: "/azienda/controllo-gestione/cash-flow" },
        { label: "Apri PFN", href: "/azienda/controllo-gestione/pfn-debiti" },
      ],
    };
  }

  if (q.includes("rating") || q.includes("banca") || q.includes("finanziamento")) {
    return {
      title: "Piano rating banca",
      summary: `Classe attuale ${context.ratingClasse ?? "non disponibile (dati da riconciliare)"}${context.ratingScore !== null ? `, punteggio ${formatNumero(context.ratingScore, 1)}` : ""}.`,
      focus: [
        context.bilancioQuadrato === false
          ? "Il bilancio non è quadrato: prima va riconciliato, altrimenti il pacchetto banca perde credibilità."
          : "La quadratura non segnala blocchi prioritari.",
        `PFN: ${context.pfn !== null ? formatCurrency(context.pfn) : "n.d."}.`,
        ebitdaMargin !== null
          ? `Margine EBITDA: ${formatPct(ebitdaMargin)}.`
          : "Margine EBITDA non calcolabile perché mancano ricavi.",
      ],
      nextActions: [
        "Riconcilia le voci patrimoniali e aggiorna classificazioni contabili.",
        "Riduci esposizione bancaria o dimostra rientri certi nel cash flow.",
        "Genera il pacchetto banca solo dopo aver risolto le anomalie principali.",
      ],
      links: [
        { label: "Apri rating", href: "/azienda/controllo-gestione/rating" },
        { label: "Pacchetto banca", href: "/azienda/controllo-gestione/pacchetto-banca" },
      ],
    };
  }

  if (q.includes("margine") || q.includes("commess") || q.includes("perd")) {
    return {
      title: "Analisi margini e commesse",
      summary: context.commesseInPerdita > 0
        ? `${context.commesseInPerdita} commesse sono in perdita: qui c'è il primo recupero operativo.`
        : "Non emergono commesse in perdita, conviene lavorare su forecast e costo atteso.",
      focus: [
        `Margine atteso commesse: ${context.margineAttesoCommesse !== null ? formatCurrency(context.margineAttesoCommesse) : "n.d."}.`,
        ebitdaMargin !== null ? `Margine EBITDA: ${formatPct(ebitdaMargin)}.` : "EBITDA non valutabile.",
        context.budgetRicaviVariancePct !== null
          ? `Ricavi previsti rispetto al budget: ${formatPct(context.budgetRicaviVariancePct, 1, true)}.`
          : "Budget ricavi non confrontabile.",
      ],
      nextActions: [
        "Apri le commesse rosse e separa errori, acquisti extra e variazioni non fatturate.",
        "Blocca nuove attività non preventivate senza approvazione economica.",
        "Aggiorna il costo atteso a fine cantiere per evitare margini finti.",
      ],
      links: [
        { label: "Apri commesse", href: "/azienda/controllo-gestione/commesse" },
        { label: "Apri budget", href: "/azienda/controllo-gestione/budget" },
      ],
    };
  }

  if (q.includes("sintesi") || q.includes("direzione") || q.includes("report")) {
    return {
      title: `Sintesi direzionale ${context.anno}`,
      summary: primaryAction
        ? `Priorità numero uno: ${primaryAction.title.toLowerCase()}.`
        : "La situazione è leggibile: consolidare dati e monitorare cassa.",
      focus: [
        `Ricavi: ${formatCurrency(context.ricavi)}.`,
        `Utile previsto: ${formatCurrency(context.utile)}${utileMargin !== null ? ` (${formatPct(utileMargin)})` : ""}.`,
        `Rating: ${context.ratingClasse ?? "n.d."}.`,
      ],
      nextActions: context.azioni.slice(0, 3).map((action) => `${action.owner}: ${action.title}.`),
      links: [
        { label: "Controllo dei dati", href: "/azienda/controllo-gestione/health" },
        { label: "Pacchetto banca", href: "/azienda/controllo-gestione/pacchetto-banca" },
      ],
    };
  }

  return {
    title: "Lettura CFO generale",
    summary: primaryAction
      ? `Partirei da questa priorità: ${primaryAction.title.toLowerCase()}.`
      : "Non vedo criticità immediate forti: la priorità è mantenere qualità dati e forecast.",
    focus: [
      `Ricavi ${formatCurrency(context.ricavi)}, EBITDA ${formatCurrency(context.ebitda)}.`,
      `Cassa finale ${context.saldoChiusura !== null ? formatCurrency(context.saldoChiusura) : "n.d."}, PFN ${context.pfn !== null ? formatCurrency(context.pfn) : "n.d."}.`,
      `Commesse in perdita: ${context.commesseInPerdita}.`,
    ],
    nextActions: context.azioni.slice(0, 3).map((action) => `${action.cta}: ${action.reason}`),
    links: context.azioni.slice(0, 2).map((action) => ({ label: action.cta, href: action.href })),
  };
}

function isRatingAtLeast(current: string, threshold: string) {
  const order = ["CCC", "B", "BB", "BBB", "A", "AA", "AAA"];
  return order.indexOf(current) >= order.indexOf(threshold);
}


