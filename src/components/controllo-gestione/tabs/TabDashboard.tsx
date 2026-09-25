/**
 * Tab Dashboard — Stato Azienda sintetico.
 *
 * Schermata di apertura: 6 KPI macro + alert + mini-chart andamento mensile.
 * Pensata per dare un colpo d'occhio "salute aziendale" all'imprenditore.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import { useCEriclassificato, useBEP } from "@/hooks/controlloGestione/useCEriclassificato";
import { useStatoPatrimoniale, useRating } from "@/hooks/controlloGestione/useStatoPatrimoniale";
import { useCashFlow } from "@/hooks/controlloGestione/useCashFlow";
import { usePFN } from "@/hooks/controlloGestione/usePFN";
import { useIndiciAvanzati } from "@/hooks/controlloGestione/useIndiciAvanzati";
import { useMarginalitaCommesse } from "@/hooks/controlloGestione/useMarginalitaCommesse";
import { useBudgetForecast } from "@/hooks/controlloGestione/useBudget";
import { CogestEmptyState } from "@/components/controllo-gestione/CogestEmptyState";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  Activity, AlertTriangle, ArrowDown, ArrowRight,
  Banknote, Bot, Building, Briefcase, CheckCircle2,
  ChevronDown, ChevronUp, ClipboardList, Lightbulb, Send, Shield,
  Sparkles, Target, TrendingDown, TrendingUp, Wallet,
} from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";

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
  alta: "border-rose-200 bg-rose-50 text-rose-900",
  media: "border-amber-200 bg-amber-50 text-amber-900",
  bassa: "border-emerald-200 bg-emerald-50 text-emerald-900",
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
  const bdg = useBudgetForecast(anno);
  const rt  = useRating(anno);
  const [cfoQuestion, setCfoQuestion] = useState(CFO_QUICK_PROMPTS[0]);
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

  // Mini chart andamento ricavi mensile YTD
  const chartData = useMemo(() => {
    if (!cf.data) return [];
    return cf.data.mesi.map((m) => ({
      mese: MESI_LABELS[m.mese - 1],
      saldo: m.saldo_fine,
      entrate: m.entrate_totali,
      uscite: -m.uscite_totali,
    }));
  }, [cf.data]);

  const worstCashMonth = useMemo(() => {
    const mesi = cf.data?.mesi ?? [];
    if (mesi.length === 0) return null;
    return mesi.reduce((worst, month) =>
      month.saldo_fine < worst.saldo_fine ? month : worst,
    );
  }, [cf.data]);

  const budgetRicavi = useMemo(
    () => bdg.data?.voci.find((v) => v.codice === "01") ?? null,
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
          testo: `Cassa sotto zero a ${MESI_LABELS[primo.mese - 1]} (${formatCurrency(primo.saldo_fine)}). Verifica scadenze ed entrate previste.`,
          href: "/azienda/controllo-gestione/cash-flow",
        });
      }
    }

    if (com.data && com.data.kpi.n_in_perdita > 0) {
      out.push({
        severity: "rosso",
        testo: `${com.data.kpi.n_in_perdita} commesse stimate in perdita a fine cantiere. Richiede revisione preventivi.`,
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
        testo: `Z-score Altman in area distress (${idx.data.altman.z_score?.toFixed(2)}). Rischio default elevato.`,
        href: "/azienda/controllo-gestione/indici",
      });
    } else if (idx.data?.altman.classe === "grey") {
      out.push({
        severity: "giallo",
        testo: `Z-score Altman in area grigia (${idx.data.altman.z_score?.toFixed(2)}). Monitora con attenzione.`,
        href: "/azienda/controllo-gestione/indici",
      });
    }

    if (idx.data?.dscr.valore != null && idx.data.dscr.valore < 1.2 && idx.data.dscr.classe !== "na") {
      out.push({
        severity: "giallo",
        testo: `DSCR ${idx.data.dscr.valore.toFixed(2)}x sotto soglia banca (1.20). Difficoltà a rinnovare/ottenere mutui.`,
        href: "/azienda/controllo-gestione/indici",
      });
    }

    // Variance budget critica
    if (bdg.data) {
      const ricaviBdg = bdg.data.voci.find((v) => v.codice === "01");
      if (ricaviBdg && ricaviBdg.semaforo === "rosso") {
        out.push({
          severity: "rosso",
          testo: `Forecast ricavi ${ricaviBdg.variance_pct?.toFixed(0)}% vs budget. Sotto target.`,
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
  }, [cf.data, com.data, bep.data, idx.data, bdg.data, isPreparingDashboard]);

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
        cta: "Vedi health-check",
      });
    }

    if (sp.data && !sp.data.quadratura.quadrato) {
      out.push({
        id: "quadratura-bilancio",
        priority: "alta",
        title: "Riconcilia il bilancio prima di usarlo per decisioni",
        reason: `Attivo e passivo differiscono di ${formatCurrency(Math.abs(sp.data.quadratura.differenza))}.`,
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
        title: `Metti in sicurezza la cassa di ${MESI_LABELS[worstCashMonth.mese - 1]}`,
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
        reason: `Forecast ricavi ${budgetRicavi.variance_pct?.toFixed(0) ?? "n.d."}% vs budget.`,
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
        reason: `Classe attuale ${rt.data.classe}, score ${rt.data.score.toFixed(1)}.`,
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
        reason: `PFN/EBITDA stimato ${(pfn.data.pfn / ebitda).toFixed(1)}x.`,
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
    ratingClasse: rt.data?.classe ?? null,
    ratingScore: rt.data?.score ?? null,
    commesseInPerdita: com.data?.kpi.n_in_perdita ?? 0,
    margineAttesoCommesse: com.data?.kpi.margine_atteso_totale ?? null,
    budgetRicaviVariancePct: budgetRicavi?.variance_pct ?? null,
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

  return (
    <div className="space-y-4">
      <DashboardActionCenter
        actions={recommendedActions}
        cfoQuestion={cfoQuestion}
        cfoAnswer={cfoAnswer}
        onQuestionChange={setCfoQuestion}
        onAsk={handleCfoQuestion}
      />

      {hasPartialDataError && (
        <PartialDataWarning
          onRetry={() => {
            void sp.refetch();
            void cf.refetch();
            void pfn.refetch();
            void idx.refetch();
            void com.refetch();
            void bep.refetch();
            void bdg.refetch();
            void rt.refetch();
          }}
        />
      )}

      {/* Top: 6 KPI macro */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KPIMacro
          label="Ricavi"
          value={ce.data ? formatCurrency(ricavi) : "—"}
          sub={`Esercizio ${anno}`}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="blue"
          href="/azienda/controllo-gestione/ce"
        />
        <KPIMacro
          label="EBITDA"
          value={ce.data ? formatCurrency(ebitda) : "—"}
          sub={ce.data && pil > 0 ? `${((ebitda / pil) * 100).toFixed(1)}% del PIL` : "—"}
          icon={<Activity className="h-4 w-4" />}
          tone={ebitda >= 0 ? "green" : "red"}
          href="/azienda/controllo-gestione/ce"
        />
        <KPIMacro
          label="Utile previsto"
          value={ce.data ? formatCurrency(utile) : "—"}
          sub={ce.data && pil > 0 ? `${((utile / pil) * 100).toFixed(1)}% del PIL` : "—"}
          icon={<Wallet className="h-4 w-4" />}
          tone={utile >= 0 ? "green" : "red"}
          href="/azienda/controllo-gestione/ce"
        />
        <KPIMacro
          label="Cassa fine anno"
          value={cf.data ? formatCurrency(cf.data.meta.saldo_chiusura) : "—"}
          sub={cf.data ? `Da apertura ${formatCurrency(cf.data.meta.saldo_apertura)}` : "—"}
          icon={<Banknote className="h-4 w-4" />}
          tone={!cf.data ? "neutral" : cf.data.meta.saldo_chiusura >= 0 ? "green" : "red"}
          href="/azienda/controllo-gestione/cash-flow"
        />
        <KPIMacro
          label="PFN"
          value={pfn.data ? formatCurrency(pfn.data.pfn) : "—"}
          sub={pfn.data ? (pfn.data.pfn > 0 ? "Indebitamento netto" : "Cassa netta") : "—"}
          icon={pfn.data && pfn.data.pfn > 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
          tone={!pfn.data ? "neutral" : pfn.data.pfn > 0 ? "amber" : "green"}
          href="/azienda/controllo-gestione/pfn-debiti"
        />
        <KPIMacro
          label="Rating bancario"
          value={rt.data?.classe ?? "—"}
          sub={rt.data ? `Score ${rt.data.score.toFixed(1)} / livello: ${rt.data.livello}` : "—"}
          icon={<Shield className="h-4 w-4" />}
          tone={!rt.data ? "neutral"
                : (rt.data.classe === "AAA" || rt.data.classe === "AA" || rt.data.classe === "A") ? "green"
                : (rt.data.classe === "BBB" || rt.data.classe === "BB") ? "blue"
                : "red"}
          href="/azienda/controllo-gestione/rating"
        />
      </div>

      {/* Alert panel */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3 max-sm:p-3 max-sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4" /> Alert e segnalazioni
          </CardTitle>
        </CardHeader>
        <CardContent className="max-sm:p-3 max-sm:pt-0">
          <ul className="space-y-2">
            {alerts.map((a, i) => (
              <li
                key={i}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3 text-sm max-sm:gap-2 max-sm:px-2.5 max-sm:py-2 max-sm:text-[13px] max-sm:leading-snug",
                  a.severity === "rosso"  && "border-rose-200 bg-rose-50 text-rose-900",
                  a.severity === "giallo" && "border-amber-200 bg-amber-50 text-amber-900",
                  a.severity === "verde"  && "border-emerald-200 bg-emerald-50 text-emerald-900",
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
                <p className="flex-1">{a.testo}</p>
                {a.href && (!isMobile || /cash-flow|commesse/.test(a.href)) && (
                  <Link
                    to={a.href}
                    className="shrink-0 text-xs font-medium underline underline-offset-2"
                  >
                    Approfondisci →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Mini-chart cash flow + commesse aside */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Grafico cassa (recharts): vetrina da scrivania, illeggibile a 375px
            e pesante da montare → nascosto su mobile. Restano KPI + "Cantieri
            attivi" (operativo). */}
        {!isMobile && (
        <Card className="rounded-2xl lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cassa: andamento previsto {anno}</CardTitle>
            <p className="text-xs text-muted-foreground">
              Saldo a fine mese atteso, considerando entrate e uscite.
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              {cf.isLoading && !cf.data ? (
                <div className="flex h-full items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
                  Dati cassa in aggiornamento...
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="mese" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(v: number) => formatCurrency(v)}
                      labelFormatter={(l) => `Mese: ${l}`}
                    />
                    <Line type="monotone" dataKey="saldo" stroke="#2563eb" strokeWidth={2} dot />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
        )}

        {/* Mobile no: ripete i numeri della scheda Commesse, accanto. */}
        <Card className="rounded-2xl max-sm:hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cantieri attivi</CardTitle>
          </CardHeader>
          <CardContent>
            {com.isLoading && !com.data ? (
              <p className="text-sm text-muted-foreground">Dati cantieri in aggiornamento...</p>
            ) : com.data ? (
              <ul className="space-y-3 text-sm">
                <li className="flex items-center gap-2">
                  <Building className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">In corso</span>
                  <Badge variant="outline">{com.data.kpi.n_in_corso}</Badge>
                </li>
                <li className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">Completate</span>
                  <Badge variant="outline">{com.data.kpi.n_completate}</Badge>
                </li>
                <li className="flex items-center gap-2 text-rose-700">
                  <ArrowDown className="h-4 w-4" />
                  <span className="flex-1">In perdita</span>
                  <Badge variant="destructive">{com.data.kpi.n_in_perdita}</Badge>
                </li>
                <li className="border-t pt-2 text-xs text-muted-foreground">
                  Margine atteso totale:{" "}
                  <strong className="text-foreground tabular-nums">
                    {formatCurrency(com.data.kpi.margine_atteso_totale)}
                  </strong>
                </li>
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nessun dato.</p>
            )}
            <Link
              to="/azienda/controllo-gestione/commesse"
              className="mt-4 block text-center text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              Vedi tutte le commesse →
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PartialDataWarning({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">Alcuni indicatori non sono aggiornati</p>
          <p className="text-xs text-amber-800">
            La dashboard resta utilizzabile: i dati mancanti vengono mostrati come non disponibili.
          </p>
        </div>
      </div>
      <Button type="button" variant="outline" size="sm" className="bg-white" onClick={onRetry}>
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
      <Card className="rounded-2xl border-slate-200">
        <CardHeader className="pb-3 max-sm:p-3 max-sm:pb-2">
          <div className="flex items-start justify-between gap-3 max-sm:items-center">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="h-4 w-4 text-primary" />
                Regia operativa
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground max-sm:hidden">
                Priorità calcolate dai dati di cassa, bilancio, commesse, budget e rating.
              </p>
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
      <Card className="rounded-2xl border-blue-200 bg-gradient-to-br from-blue-50 via-white to-emerald-50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-blue-700" />
            Assistente CFO
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Scrivi una domanda: l'assistente interpreta i KPI già caricati nella dashboard.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {CFO_QUICK_PROMPTS.map((prompt) => (
              <Button
                key={prompt}
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-full bg-white/80 px-3 text-xs"
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
              className="min-h-[86px] resize-none bg-white/85"
              placeholder="Es. spiegami cosa fare nei prossimi 7 giorni per migliorare cassa e rating"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-muted-foreground">
                Risposta basata su dati live del modulo, senza uscire dalla pagina.
              </p>
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
  if (!answer) {
    return (
      <div className="rounded-xl border border-dashed bg-white/70 p-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          Pronto per analizzare
        </div>
        <p className="mt-1">
          Usa un suggerimento rapido o scrivi una domanda. La risposta collega numeri, rischi e prossime mosse.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white/85 p-3">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 rounded-full bg-blue-100 p-1 text-blue-700">
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
            <Button key={link.href} asChild variant="outline" size="sm" className="h-8 bg-white">
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
  label, value, sub, icon, tone, href,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  tone: "blue" | "green" | "red" | "amber" | "neutral";
  href?: string;
}) {
  // Mobile: nome e numero; il collegamento solo verso le schede che il
  // telefono mostra (cassa, commesse): le altre riaprivano il riepilogo.
  const isMobile = useIsMobile();
  const linkAttivo = href && (!isMobile || /cash-flow|commesse/.test(href)) ? href : undefined;
  const palette = {
    blue: "bg-blue-50",
    green: "bg-emerald-50",
    red: "bg-rose-50",
    amber: "bg-amber-50",
    neutral: "bg-muted/40",
  } as const;

  const inner = (
    <Card className={cn("rounded-2xl border-0 transition hover:shadow-sm", palette[tone])}>
      <CardContent className="p-2.5 sm:p-4 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] sm:text-[11px] uppercase tracking-wide text-muted-foreground truncate">{label}</p>
          <span className="text-muted-foreground shrink-0">{icon}</span>
        </div>
        <p className="mt-1 text-base sm:text-xl font-bold tabular-nums truncate">{value}</p>
        <p className="hidden text-[10px] sm:block sm:text-[11px] text-muted-foreground truncate">{sub}</p>
      </CardContent>
    </Card>
  );

  return linkAttivo ? <Link to={linkAttivo} className="block min-w-0">{inner}</Link> : inner;
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
        "Aggiorna le voci manuali del cash flow per vedere subito l'effetto.",
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
      summary: `Classe attuale ${context.ratingClasse ?? "n.d."}${context.ratingScore !== null ? `, score ${context.ratingScore.toFixed(1)}` : ""}.`,
      focus: [
        context.bilancioQuadrato === false
          ? "Il bilancio non è quadrato: prima va riconciliato, altrimenti il pacchetto banca perde credibilità."
          : "La quadratura non segnala blocchi prioritari.",
        `PFN: ${context.pfn !== null ? formatCurrency(context.pfn) : "n.d."}.`,
        ebitdaMargin !== null
          ? `EBITDA margin: ${ebitdaMargin.toFixed(1)}%.`
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
        ebitdaMargin !== null ? `EBITDA sul PIL: ${ebitdaMargin.toFixed(1)}%.` : "EBITDA non valutabile.",
        context.budgetRicaviVariancePct !== null
          ? `Scostamento forecast ricavi vs budget: ${formatSignedPercent(context.budgetRicaviVariancePct)}.`
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
        `Utile previsto: ${formatCurrency(context.utile)}${utileMargin !== null ? ` (${utileMargin.toFixed(1)}%)` : ""}.`,
        `Rating: ${context.ratingClasse ?? "n.d."}.`,
      ],
      nextActions: context.azioni.slice(0, 3).map((action) => `${action.owner}: ${action.title}.`),
      links: [
        { label: "Health-check", href: "/azienda/controllo-gestione/health" },
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

function formatSignedPercent(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}
