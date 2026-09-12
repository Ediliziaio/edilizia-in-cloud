import React, { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useWeightedPipeline,
  useSalesForecast,
  useStalledOpportunities,
  useSalesVelocity,
  useConversionBySource,
  useTopLeads,
  useQuoteRevenue,
  salesOSKeys,
} from "@/hooks/useSalesOS";
import { useQueryClient } from "@tanstack/react-query";
import { usePipelines } from "@/hooks/useOpportunitiesData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  TrendingUp,
  AlertTriangle,
  Users,
  Target,
  Zap,
  Loader2,
  Receipt,
  FileSignature,
  Percent,
  Download,
  ArrowRight,
  Flame,
  Clock3,
  Gauge,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { formatCurrencyCompact } from "@/lib/formatters";
import { DealHealthOverview } from "@/components/opportunities/DealHealthOverview";
import { exportToCSV } from "@/lib/csvExport";
import { Button } from "@/components/ui/button";
import { LeadScoringConfigForm } from "@/components/marketing/LeadScoringConfigForm";
import { Settings2 } from "lucide-react";
import { getPeriodRange, PERIOD_OPTIONS, type SalesOSPeriod } from "@/lib/salesOSPeriod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, MousePointerClick } from "lucide-react";

// ─── Utilities ───────────────────────────────────────────────────────────────

// Un valore che non si può calcolare (nessuna vendita chiusa nel periodo) si
// mostra come «—», non come 0: uno zero sembra un risultato.
const fmt = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0, useGrouping: "always" }).format(v);

const pct = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : `${v.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

function severityLabel(daysStalled: number, threshold: number) {
  if (daysStalled >= threshold * 2) return { label: "Critica", variant: "destructive" as const };
  if (daysStalled >= threshold) return { label: "Da riprendere", variant: "secondary" as const };
  return { label: "Monitorare", variant: "outline" as const };
}

type SalesOSCommandTarget = "stalled" | "config" | "lead" | "quotes" | "pipeline";
const SALES_OS_TABS = ["pipeline", "stalled", "team", "analisi", "config"] as const;
type SalesOSTab = (typeof SALES_OS_TABS)[number];

type SalesOSCommandAction = {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: string;
  detail: string;
  action: string;
  target: SalesOSCommandTarget;
  tone: string;
  badge?: string;
};

function leadHasUsefulScore(lead?: { lead_score?: number | null } | null) {
  const score = Number(lead?.lead_score ?? 0);
  return Number.isFinite(score) && score > 0;
}

function isSalesOSTab(value: string | null): value is SalesOSTab {
  return SALES_OS_TABS.includes(value as SalesOSTab);
}

function buildSalesOSCommandActions({
  staleCount,
  criticalStalledCount,
  topLeadName,
  topLeadScore,
  hasUsefulLeadScore,
  weightedForecast,
  salesVelocity,
  openOpportunities,
  actualRevenue,
  signedQuotesCount,
  activeQuotesValue,
  activeQuotesCount,
}: {
  staleCount: number;
  criticalStalledCount: number;
  topLeadName?: string | null;
  topLeadScore: number;
  hasUsefulLeadScore: boolean;
  weightedForecast: number;
  salesVelocity: number;
  openOpportunities: number;
  actualRevenue: number;
  signedQuotesCount: number;
  activeQuotesValue: number;
  activeQuotesCount: number;
}): SalesOSCommandAction[] {
  const actions: SalesOSCommandAction[] = [
    {
      key: "stalled",
      icon: criticalStalledCount > 0 ? AlertTriangle : Clock3,
      title: staleCount > 0 ? "Recupera opportunità ferme" : "Follow-up sotto controllo",
      value: String(staleCount),
      detail:
        criticalStalledCount > 0
          ? `${criticalStalledCount} critiche: parti dal valore più alto e imposta il prossimo step.`
          : staleCount > 0
            ? "Da richiamare prima di aumentare budget o nuovi lead."
            : "Nessun blocco oltre soglia nelle opportunità aperte.",
      action: staleCount > 0 ? "Apri ferme" : "Vai alla pipeline",
      target: staleCount > 0 ? "stalled" : "pipeline",
      tone: criticalStalledCount > 0 ? "text-red-600" : "text-emerald-600",
      badge: criticalStalledCount > 0 ? "Priorità" : "OK",
    },
  ];

  actions.push(
    hasUsefulLeadScore
      ? {
          key: "lead",
          icon: Flame,
          title: "Lead ad alta priorità",
          value: String(topLeadScore),
          detail: `${topLeadName ?? "Lead selezionato"}: lavoralo prima dei contatti freddi.`,
          action: "Apri lead",
          target: "lead",
          tone: "text-orange-600",
          badge: "Score",
        }
      : {
          key: "lead-scoring",
          icon: Settings2,
          title: "Score da configurare",
          value: "N/D",
          detail: "I migliori contatti hanno score 0: ricalcola lo scoring prima di decidere chi è caldo.",
          action: "Config scoring",
          target: "config",
          tone: "text-slate-600",
          badge: "Setup",
        },
  );

  actions.push(
    actualRevenue <= 0 && (salesVelocity > 0 || activeQuotesValue > 0 || openOpportunities > 0)
      ? {
          key: "revenue-gap",
          icon: Receipt,
          title: "Trasforma pipeline in firme",
          value: fmt(actualRevenue),
          detail:
            activeQuotesCount > 0
              ? `${activeQuotesCount} preventivi attivi: accelera firma o motivo perdita.`
              : "Velocity stimata presente, ma ricavo firmato assente nel periodo.",
          action: "Apri preventivi",
          target: "quotes",
          tone: "text-amber-700",
          badge: "Ricavo firmato",
        }
      : {
          key: "signed-revenue",
          icon: Receipt,
          title: "Ricavo firmato",
          value: fmt(actualRevenue),
          detail: `${signedQuotesCount} preventivi firmati nel periodo selezionato.`,
          action: "Preventivi",
          target: "quotes",
          tone: "text-emerald-700",
          badge: "Reale",
        },
  );

  actions.push({
    key: "forecast",
    icon: TrendingUp,
    title: weightedForecast > 0 ? "Proteggi forecast" : "Forecast da alimentare",
    value: fmt(weightedForecast),
    detail:
      weightedForecast > 0
        ? "Controlla data chiusura, probabilità e prossima azione sulle trattative principali."
        : "Aggiungi valore, probabilità e data chiusura alle opportunità aperte.",
    action: "Lavora pipeline",
    target: "pipeline",
    tone: "text-primary",
    badge: "3 mesi",
  });

  return actions;
}

// ─── WidgetState: loading / error / empty helper (Sprint 1.3) ──────────────
function WidgetState({
  loading, error, empty, loadingText = "Caricamento...", emptyText = "Nessun dato", height = 200,
}: {
  loading?: boolean; error?: Error | null | unknown; empty?: boolean;
  loadingText?: string; emptyText?: string; height?: number;
}) {
  const baseClass = `flex items-center justify-center`;
  const hStyle = { minHeight: `${height}px` };
  if (loading) {
    return (
      <div className={baseClass} style={hStyle}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">{loadingText}</span>
      </div>
    );
  }
  if (error) {
    const msg = (error as { message?: string })?.message ?? "Errore caricamento dati";
    return (
      <div className={`${baseClass} flex-col gap-2 px-4 text-center`} style={hStyle}>
        <AlertTriangle className="h-5 w-5 text-red-500" />
        <p className="text-sm text-red-600 font-medium">Impossibile caricare i dati</p>
        <p className="text-xs text-muted-foreground max-w-xs break-words">{msg}</p>
      </div>
    );
  }
  if (empty) {
    return (
      <div className={`${baseClass} text-sm text-muted-foreground`} style={hStyle}>
        {emptyText}
      </div>
    );
  }
  return null;
}

function useSlowQueryFallback(isLoading: boolean, timeoutMs = 3500) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setTimedOut(false);
      return;
    }

    const timer = window.setTimeout(() => setTimedOut(true), timeoutMs);
    return () => window.clearTimeout(timer);
  }, [isLoading, timeoutMs]);

  return isLoading && timedOut;
}

// ─── SalesVelocityCard ────────────────────────────────────────────────────────

function SalesVelocityCard({ companyId, daysBack, periodLabel, pipelineId }: { companyId: string; daysBack: number; periodLabel: string; pipelineId?: string }) {
  const { data: velocity, isLoading, isError, error } = useSalesVelocity(companyId, daysBack, pipelineId);
  const showSlowFallback = useSlowQueryFallback(isLoading);
  const showLoading = isLoading && !showSlowFallback;

  if (showLoading || isError || !velocity) {
    return (
      <Card>
        <CardContent>
          <WidgetState
            loading={showLoading}
            error={isError ? error : null}
            empty={showSlowFallback || (!isLoading && !isError && !velocity)}
            loadingText="Calcolo velocità..."
            emptyText={showSlowFallback ? "Dati non arrivati: Sales OS resta utilizzabile." : "Nessun dato disponibile"}
            height={100}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Velocity stimata da pipeline
          <span className="text-xs text-muted-foreground font-normal">({periodLabel.toLowerCase()})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {fmt(velocity.sales_velocity)}
          <span className="text-sm font-normal text-muted-foreground ml-1">/giorno</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {velocity.sales_velocity == null
            ? "Serve almeno una vendita chiusa nel periodo per stimarla."
            : "Valore della pipeline aperta × tasso di chiusura ÷ ciclo medio di vendita."}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm">
          <div>
            <p className="font-semibold">{velocity.open_opportunities}</p>
            <span className="text-muted-foreground">Opp. aperte</span>
          </div>
          <div>
            <p className="font-semibold">{pct(velocity.win_rate)}</p>
            <span className="text-muted-foreground">Tasso di chiusura</span>
          </div>
          <div>
            <p className="font-semibold">{fmt(velocity.avg_deal_size)}</p>
            <span className="text-muted-foreground">Ticket medio</span>
          </div>
          <div>
            <p className="font-semibold">{velocity.avg_cycle_days == null ? "—" : `${velocity.avg_cycle_days.toLocaleString("it-IT")} gg`}</p>
            <span className="text-muted-foreground">Ciclo medio</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── ExportCsvButton helper (Sprint 4) ────────────────────────────────────────

function ExportCsvButton({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      // v8.6.75 (LOOP-AZ-6) — h-9 mobile (Apple HIG min tap), h-7 desktop
      className="h-9 md:h-7 gap-1 text-xs"
      onClick={onClick}
      disabled={disabled}
    >
      <Download className="h-3.5 w-3.5" /> CSV
    </Button>
  );
}

// ─── QuoteRevenueCard (Sprint 3) — ricavo effettivo da preventivi ─────────────

function QuoteRevenueCard({
  companyId,
  dateFrom,
  dateTo,
  periodLabel,
  pipelineId,
}: {
  companyId: string;
  dateFrom: string;
  dateTo: string;
  periodLabel: string;
  pipelineId?: string;
}) {
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useQuoteRevenue(companyId, dateFrom, dateTo, pipelineId);
  const showSlowFallback = useSlowQueryFallback(isLoading);
  const showLoading = isLoading && !showSlowFallback;

  if (showLoading || isError || !data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            Ricavo firmato (IVA esclusa)
            <span className="text-xs text-muted-foreground font-normal">({periodLabel.toLowerCase()})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <WidgetState
            loading={showLoading}
            error={isError ? error : null}
            empty={showSlowFallback || (!isLoading && !isError && !data)}
            loadingText="Calcolo ricavo..."
            emptyText={showSlowFallback ? "Dati non arrivati: Sales OS resta utilizzabile." : "Nessun dato preventivi"}
            height={100}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Receipt className="h-4 w-4 text-primary" />
          Ricavo firmato (IVA esclusa)
          <span className="text-xs text-muted-foreground font-normal">({periodLabel.toLowerCase()})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{fmt(data.actual_revenue)}</div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {data.signed_quotes_count} preventivi firmati · ticket medio {fmt(data.avg_signed_ticket)}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-3 text-sm">
          <button
            onClick={() => navigate(`/azienda/marketing/preventivi?stato=in_corso`)}
            className="text-left rounded-md hover:bg-muted/50 p-1 -m-1 transition"
          >
            <p className="font-semibold flex items-center gap-1">
              <FileSignature className="h-3.5 w-3.5 text-amber-500" />
              {fmt(data.active_quotes_value)}
            </p>
            <span className="text-muted-foreground text-xs">
              {data.active_quotes_count} preventivi inviati
            </span>
          </button>
          <button
            onClick={() => navigate(`/azienda/marketing/opportunita?status=open`)}
            className="text-left rounded-md hover:bg-muted/50 p-1 -m-1 transition"
          >
            <p className="font-semibold">{data.opportunities_with_quote}</p>
            <span className="text-muted-foreground text-xs">
              Opp. con preventivo attivo
            </span>
          </button>
          <div>
            <p className="font-semibold flex items-center gap-1">
              <Percent className="h-3.5 w-3.5 text-emerald-600" />
              {pct(data.acceptance_rate)}
            </p>
            <span className="text-muted-foreground text-xs">
              Tasso di accettazione
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── SalesFocusPanel — priorità operative del venditore ──────────────────────

function SalesFocusPanel({
  companyId,
  daysBack,
  dateFrom,
  dateTo,
  periodLabel,
  onOpenStalled,
  onOpenConfig,
  pipelineId,
}: {
  companyId: string;
  daysBack: number;
  dateFrom: string;
  dateTo: string;
  periodLabel: string;
  onOpenStalled: () => void;
  onOpenConfig: () => void;
  pipelineId?: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: velocity, isError: erroreVelocity } = useSalesVelocity(companyId, daysBack, pipelineId);
  const { data: stalled, isLoading: stalledLoading, isError: erroreFerme } = useStalledOpportunities(companyId, pipelineId);
  const { data: leads, isLoading: leadsLoading, isError: erroreLead } = useTopLeads(companyId, 1);
  const { data: forecast, isError: erroreForecast } = useSalesForecast(companyId, 3, pipelineId);
  const { data: quoteRevenue, isError: errorePreventivi } = useQuoteRevenue(companyId, dateFrom, dateTo, pipelineId);
  // Un numero che non è arrivato non è uno zero: prima una lettura fallita
  // delle opportunità ferme diceva «Follow-up sotto controllo — OK».
  const nonArrivati: Partial<Record<SalesOSCommandAction["key"], boolean>> = {
    stalled: erroreFerme,
    lead: erroreLead,
    "lead-scoring": erroreLead,
    forecast: erroreForecast,
    "revenue-gap": errorePreventivi,
    "signed-revenue": errorePreventivi,
  };
  const qualcosaNonArrivato = erroreVelocity || erroreFerme || erroreLead || erroreForecast || errorePreventivi;

  const criticalStalled = (stalled ?? []).filter((opp) => opp.days_stalled >= opp.stalled_threshold * 2);
  const nextLead = leads?.[0];
  const hasUsefulLeadScore = leadHasUsefulScore(nextLead);
  const weightedForecast = (forecast ?? []).reduce((sum, item) => sum + item.weighted_revenue, 0);
  const staleCount = stalled?.length ?? 0;
  const actualRevenue = quoteRevenue?.actual_revenue ?? 0;
  const activeQuotesValue = quoteRevenue?.active_quotes_value ?? 0;
  const activeQuotesCount = quoteRevenue?.active_quotes_count ?? 0;

  const commandActions = buildSalesOSCommandActions({
    staleCount,
    criticalStalledCount: criticalStalled.length,
    topLeadName: nextLead?.full_name,
    topLeadScore: Number(nextLead?.lead_score ?? 0),
    hasUsefulLeadScore,
    weightedForecast,
    salesVelocity: velocity?.sales_velocity ?? 0,
    openOpportunities: velocity?.open_opportunities ?? 0,
    actualRevenue,
    signedQuotesCount: quoteRevenue?.signed_quotes_count ?? 0,
    activeQuotesValue,
    activeQuotesCount,
  });

  const NON_ARRIVATO = "Dati non arrivati";
  const metrics = [
    {
      label: "Velocity stimata",
      value: velocity ? `${fmt(velocity.sales_velocity)}/giorno` : erroreVelocity ? "—" : "...",
      detail: erroreVelocity ? NON_ARRIVATO : `${velocity?.open_opportunities ?? 0} opportunità aperte`,
    },
    {
      label: "Ricavo firmato",
      value: quoteRevenue ? fmt(actualRevenue) : errorePreventivi ? "—" : "...",
      detail: errorePreventivi ? NON_ARRIVATO : `${quoteRevenue?.signed_quotes_count ?? 0} preventivi firmati`,
    },
    {
      label: "Forecast pesato",
      value: forecast ? fmt(weightedForecast) : erroreForecast ? "—" : "...",
      detail: erroreForecast ? NON_ARRIVATO : "questo mese e i due successivi",
    },
    {
      label: "Preventivi aperti",
      value: quoteRevenue ? fmt(activeQuotesValue) : errorePreventivi ? "—" : "...",
      detail: errorePreventivi ? NON_ARRIVATO : `${activeQuotesCount} inviati da chiudere`,
    },
  ];

  const handleCommandClick = (target: SalesOSCommandTarget) => {
    if (target === "stalled") {
      onOpenStalled();
      return;
    }
    if (target === "config") {
      onOpenConfig();
      return;
    }
    if (target === "lead") {
      navigate(nextLead ? `/azienda/marketing/contatti/${nextLead.id}` : "/azienda/marketing/contatti");
      return;
    }
    if (target === "quotes") {
      navigate("/azienda/marketing/preventivi?stato=in_corso");
      return;
    }
    navigate("/azienda/marketing/opportunita?status=open");
  };

  const revenueGap =
    quoteRevenue &&
    actualRevenue <= 0 &&
    ((velocity?.sales_velocity ?? 0) > 0 || activeQuotesValue > 0 || (velocity?.open_opportunities ?? 0) > 0);

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4 text-orange-600" />
              Comando commerciale di oggi
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Lettura operativa del periodo: cosa è stimato, cosa è già firmato e quale azione sblocca vendite.
            </p>
          </div>
          <Badge variant="secondary">{periodLabel}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.3fr]">
          <div className="rounded-lg border bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Numeri senza ambiguità
              </p>
              {revenueGap && (
                <Badge variant="outline" className="border-amber-300 text-amber-700">
                  Gap firme
                </Badge>
              )}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {metrics.map((metric) => (
                <div key={metric.label} className="rounded-md bg-background p-3">
                  <p className="text-[11px] font-medium text-muted-foreground">{metric.label}</p>
                  <p className="mt-1 text-lg font-semibold leading-tight">{metric.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
                </div>
              ))}
            </div>
            {qualcosaNonArrivato && (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <span>Alcuni numeri non sono arrivati: quelli con «—» non sono zeri.</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0"
                  onClick={() => queryClient.invalidateQueries({ queryKey: salesOSKeys.all })}
                >
                  Riprova
                </Button>
              </div>
            )}
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {revenueGap
                ? "La pipeline si muove, ma nel periodo non risultano firme: priorità a preventivi, follow-up e motivi di perdita."
                : "Velocity e ricavo firmato sono separati: usa la prima per ritmo atteso, il secondo per risultato reale."}
            </p>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Cosa fare adesso</p>
                <p className="text-xs text-muted-foreground">Ordine suggerito per venditore o responsabile commerciale.</p>
              </div>
              <Badge variant="outline">{commandActions.length} azioni</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {commandActions.map((voce) => {
                const item = nonArrivati[voce.key]
                  ? { ...voce, icon: AlertTriangle, value: "—", detail: "Dati non arrivati: riprova tra poco.", tone: "text-red-600", badge: "Errore" }
                  : voce;
                const Icon = item.icon;
                const displayValue =
                  (item.key === "stalled" && stalledLoading) || (item.key === "lead-scoring" && leadsLoading)
                    ? "..."
                    : item.value;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleCommandClick(item.target)}
                    className="group min-h-[132px] rounded-lg border bg-background p-4 text-left transition hover:border-primary/40 hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-muted p-2">
                          <Icon className={`h-4 w-4 ${item.tone}`} />
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {item.badge}
                        </Badge>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                    </div>
                    <div className="mt-3">
                      <p className="text-sm font-semibold leading-tight">{item.title}</p>
                      <p className="mt-1 text-xl font-bold leading-tight">{displayValue}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.detail}</p>
                    </div>
                    <p className="mt-3 text-xs font-medium text-primary">{item.action}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── WeightedPipelineChart ────────────────────────────────────────────────────

function WeightedPipelineChart({ companyId, pipelineId }: { companyId: string; pipelineId?: string }) {
  const { data: stages, isLoading, isError, error } = useWeightedPipeline(companyId, pipelineId);
  const navigate = useNavigate();

  if (isLoading || isError || !stages || stages.length === 0) {
    return (
      <Card>
        <CardContent>
          <WidgetState
            loading={isLoading}
            error={isError ? error : null}
            empty={!isLoading && !isError && (!stages || stages.length === 0)}
            loadingText="Caricamento pipeline..."
            emptyText="Nessuna opportunità aperta."
            height={240}
          />
        </CardContent>
      </Card>
    );
  }

  const chartData = stages.map((s) => ({
    name:
      s.stage_name.length > 12
        ? s.stage_name.slice(0, 12) + "…"
        : s.stage_name,
    stage_id: s.stage_id,
    pipeline_id: s.pipeline_id,
    "Valore totale": Math.round(s.total_value),
    "Valore pesato": Math.round(s.weighted_value),
    "N° opp": s.opportunity_count,
    "Prob %": s.avg_probability,
  }));

  const handleBarClick = (data: { pipeline_id?: string; stage_id?: string }) => {
    if (!data?.pipeline_id) return;
    const params = new URLSearchParams({
      pipeline: data.pipeline_id,
      status: "open",
    });
    navigate(`/azienda/marketing/opportunita?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
        <MousePointerClick className="h-3 w-3" /> Clicca una colonna per filtrare le opportunità
      </p>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={chartData} onClick={(e: any) => {
          const payload = e?.activePayload?.[0]?.payload;
          if (payload) handleBarClick(payload);
        }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={formatCurrencyCompact} />
          <Tooltip
            formatter={(value: number, name: string) =>
              name === "Prob %" ? [`${value}%`, name] : [fmt(value), name]
            }
          />
          <Legend />
          <Bar dataKey="Valore totale" fill="hsl(var(--muted-foreground))" opacity={0.4} radius={[2, 2, 0, 0]} style={{ cursor: "pointer" }} />
          <Bar dataKey="Valore pesato" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} style={{ cursor: "pointer" }} />
        </BarChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-2 gap-4 text-center">
        <div>
          <p className="text-lg font-bold">
            {fmt(stages.reduce((a, s) => a + s.total_value, 0))}
          </p>
          <p className="text-xs text-muted-foreground">Valore totale pipeline</p>
        </div>
        <div>
          <p className="text-lg font-bold">
            {fmt(stages.reduce((a, s) => a + s.weighted_value, 0))}
          </p>
          <p className="text-xs text-muted-foreground">Valore pesato</p>
        </div>
      </div>
    </div>
  );
}

// ─── SalesForecastChart ───────────────────────────────────────────────────────

function SalesForecastChart({ companyId, pipelineId }: { companyId: string; pipelineId?: string }) {
  const { data: forecast, isLoading, isError, error } = useSalesForecast(companyId, 3, pipelineId);

  if (isLoading || isError || !forecast || forecast.length === 0) {
    return (
      <Card>
        <CardContent>
          <WidgetState
            loading={isLoading}
            error={isError ? error : null}
            empty={!isLoading && !isError && (!forecast || forecast.length === 0)}
            loadingText="Calcolo forecast..."
            emptyText="Nessuna opportunità con data chiusura impostata."
            height={180}
          />
        </CardContent>
      </Card>
    );
  }

  const chartData = forecast.map((f) => ({
    mese: new Date(f.forecast_month).toLocaleDateString("it-IT", {
      month: "short",
      year: "2-digit",
    }),
    "Atteso": Math.round(f.expected_revenue),
    "Pesato": Math.round(f.weighted_revenue),
    "N° opp": f.opportunity_count,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="mese" tick={{ fontSize: 11 }} />
        <YAxis
          tick={{ fontSize: 11 }}
          tickFormatter={formatCurrencyCompact}
        />
        <Tooltip formatter={(value: number, name: string) => [fmt(value), name]} />
        <Legend />
        <Line type="monotone" dataKey="Atteso" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" />
        <Line type="monotone" dataKey="Pesato" stroke="hsl(var(--primary))" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── StalledOpportunitiesPanel ────────────────────────────────────────────────

function StalledOpportunitiesPanel({ companyId, pipelineId }: { companyId: string; pipelineId?: string }) {
  const { data: stalled, isLoading, isError, error } = useStalledOpportunities(companyId, pipelineId);
  const navigate = useNavigate();

  const handleExport = () => {
    if (!stalled?.length) return;
    exportToCSV(
      stalled.map((s) => ({
        opportunita: s.opportunity_name,
        contatto: s.contact_name ?? "",
        stage: s.stage_name,
        giorni_ferma: String(s.days_stalled),
        threshold: String(s.stalled_threshold),
        valore: String(s.value ?? 0),
      })),
      [
        { key: "opportunita", label: "Opportunità" },
        { key: "contatto", label: "Contatto" },
        { key: "stage", label: "Stage" },
        { key: "giorni_ferma", label: "Ferma da (gg)" },
        { key: "threshold", label: "Threshold (gg)" },
        { key: "valore", label: "Valore (€)" },
      ],
      `opportunita-ferme-${new Date().toISOString().split("T")[0]}.csv`
    );
  };

  if (isLoading || isError) {
    return (
      <WidgetState
        loading={isLoading}
        error={isError ? error : null}
        loadingText="Analisi opportunità ferme..."
        height={160}
      />
    );
  }

  if (!stalled || stalled.length === 0)
    return (
      <div className="text-center py-8 space-y-1">
        <span className="text-3xl">✅</span>
        <p className="text-sm text-muted-foreground">Nessuna opportunità ferma — ottimo lavoro!</p>
      </div>
    );

  return (
    <>
    <div className="flex justify-end mb-2">
      <ExportCsvButton onClick={handleExport} />
    </div>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Opportunità</TableHead>
          <TableHead>Stage</TableHead>
          <TableHead>Ferma da</TableHead>
          <TableHead>Threshold</TableHead>
          <TableHead>Prossima azione</TableHead>
          <TableHead className="text-right">Valore</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stalled.map((s) => {
          const severity = severityLabel(s.days_stalled, s.stalled_threshold);
          const nextAction = severity.label === "Critica" ? "Chiama oggi" : "Riprogramma follow-up";
          return (
            <TableRow
              key={s.opportunity_id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => navigate(`/azienda/marketing/opportunita?apri=${s.opportunity_id}`)}
            >
              <TableCell>
                <p className="font-medium text-sm">{s.opportunity_name}</p>
                {s.contact_name && (
                  <p className="text-xs text-muted-foreground">{s.contact_name}</p>
                )}
              </TableCell>
              <TableCell>{s.stage_name}</TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={severity.variant} className="text-xs">
                    {s.days_stalled}gg
                  </Badge>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock3 className="h-3 w-3" />
                    {severity.label}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                {s.stalled_threshold}gg
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  <Badge variant={severity.variant} className="text-xs">
                    {nextAction}
                  </Badge>
                  <p className="text-xs text-muted-foreground">Apri e aggiorna prossimo step</p>
                </div>
              </TableCell>
              <TableCell className="text-right">
                {fmt(s.value)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
    </>
  );
}

// ─── RimandoClassificaVenditori ───────────────────────────────────────────────
// Qui c'era un confronto venditori calcolato nel browser con regole sue (la
// terza versione dello stesso numero). La classifica vive in un posto solo,
// Reportistica → Venditori, sulle funzioni del database.

function RimandoClassificaVenditori() {
  const navigate = useNavigate();
  const permissions = usePermissions();
  if (!permissions.canViewMarketingReports) return null;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Users className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium">Classifica venditori</p>
            <p className="text-xs text-muted-foreground">
              Fatturato, tasso di chiusura, appuntamenti e andamento di ogni venditore: sono in Reportistica → Venditori.
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="gap-1 shrink-0" onClick={() => navigate("/azienda/marketing/reportistica?tab=venditori")}>
          Apri la classifica <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── ConversionBySourceChart ──────────────────────────────────────────────────

function ConversionBySourceChart({ companyId, dateFrom, dateTo, pipelineId }: { companyId: string; dateFrom: string | null; dateTo: string; pipelineId?: string }) {
  const navigate = useNavigate();
  const { data: sources, isLoading, isError, error } = useConversionBySource(companyId, dateFrom, dateTo, pipelineId);

  if (isLoading || isError) {
    return (
      <WidgetState
        loading={isLoading}
        error={isError ? error : null}
        loadingText="Analisi fonti lead..."
        height={200}
      />
    );
  }

  if (!sources || sources.length === 0)
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">Nessun dato fonte lead disponibile.</p>
      </div>
    );

  // Sull'asse il nome leggibile (i moduli per nome, non «form_<id>»); il clic
  // filtra con la fonte vera, che è quella scritta sulle opportunità.
  const chartData = sources.slice(0, 8).map((s) => ({
    fonte: s.label.length > 15 ? s.label.slice(0, 15) + "…" : s.label,
    origine: s.source,
    Opportunità: s.total_opportunities,
    "Chiuse vinte": s.won_opportunities,
    "Win rate %": parseFloat(s.win_rate.toFixed(1)),
  }));

  const goSource = (src: string) =>
    navigate(`/azienda/marketing/opportunita?source=${encodeURIComponent(src)}`);

  return (
    <div className="space-y-4">
      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
        <MousePointerClick className="h-3 w-3" /> Clicca una barra o una fonte per filtrare le opportunità
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={chartData}
          onClick={(e: any) => {
            const origine = e?.activePayload?.[0]?.payload?.origine;
            if (origine) goSource(origine);
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="fonte" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Legend />
          <Tooltip
            formatter={(value: number, name: string) =>
              name === "Win rate %"
                ? [`${value.toFixed(1)}%`, name]
                : [value, name]
            }
          />
          <Bar dataKey="Opportunità" fill="hsl(var(--muted-foreground))" opacity={0.5} radius={[2, 2, 0, 0]} style={{ cursor: "pointer" }} />
          <Bar dataKey="Chiuse vinte" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} style={{ cursor: "pointer" }} />
        </BarChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {sources.slice(0, 4).map((s) => (
          <button
            key={s.source}
            onClick={() => goSource(s.source)}
            className="text-center rounded-md p-2 hover:bg-muted/60 transition"
          >
            <p className="text-xs text-muted-foreground truncate" title={s.label}>{s.label}</p>
            <p className="text-sm font-semibold">
              {fmt(s.total_won_value)}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── TopLeadsTable ────────────────────────────────────────────────────────────

function TopLeadsTable({ companyId, limit = 10 }: { companyId: string; limit?: number }) {
  const navigate = useNavigate();
  const { data: leads, isLoading, isError, error } = useTopLeads(companyId, limit);

  const handleExport = () => {
    if (!leads?.length) return;
    exportToCSV(
      leads.map((l) => ({
        nome: l.full_name,
        azienda: l.company_name ?? "",
        tier_icp: l.icp_tier ?? "",
        lead_score: String(l.lead_score ?? 0),
        icp_score: String(l.icp_score ?? 0),
        fonte: l.source ?? "",
        citta: l.city ?? "",
        opp_aperte: String(l.open_opportunities_count),
        ultima_attivita: l.last_activity_at ?? "",
      })),
      [
        { key: "nome", label: "Nome" },
        { key: "azienda", label: "Azienda" },
        { key: "tier_icp", label: "Tier ICP" },
        { key: "lead_score", label: "Lead score" },
        { key: "icp_score", label: "ICP score" },
        { key: "fonte", label: "Fonte" },
        { key: "citta", label: "Città" },
        { key: "opp_aperte", label: "Opp. aperte" },
        { key: "ultima_attivita", label: "Ultima attività" },
      ],
      `top-lead-${new Date().toISOString().split("T")[0]}.csv`
    );
  };

  if (isLoading || isError) {
    return (
      <WidgetState
        loading={isLoading}
        error={isError ? error : null}
        loadingText="Calcolo lead score..."
        height={160}
      />
    );
  }

  if (!leads || leads.length === 0)
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">Nessun lead con score disponibile.</p>
      </div>
    );

  const tierColor: Record<string, string> = {
    A: "bg-green-100 text-green-800",
    B: "bg-blue-100 text-blue-800",
    C: "bg-yellow-100 text-yellow-800",
    D: "bg-gray-100 text-gray-800",
  };

  return (
    <>
    <div className="flex justify-end mb-2">
      <ExportCsvButton onClick={handleExport} />
    </div>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Lead</TableHead>
          <TableHead>Tier ICP</TableHead>
          <TableHead>Score</TableHead>
          <TableHead>Fonte</TableHead>
          <TableHead className="text-right">Opp. aperte</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.map((lead) => {
          const hasScore = leadHasUsefulScore(lead);
          return (
            <TableRow
              key={lead.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => navigate(`/azienda/marketing/contatti/${lead.id}`)}
            >
              <TableCell>
                <p className="font-medium text-sm">{lead.full_name}</p>
                {lead.company_name && (
                  <p className="text-xs text-muted-foreground">{lead.company_name}</p>
                )}
              </TableCell>
              <TableCell>
                {lead.icp_tier ? (
                  <Badge className={tierColor[lead.icp_tier] ?? ""}>
                    {lead.icp_tier}
                  </Badge>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-16">
                      <Progress value={hasScore ? lead.lead_score : 0} className="h-2" />
                    </div>
                    <span className="text-sm font-semibold">
                      {hasScore ? lead.lead_score : "N/D"}
                    </span>
                  </div>
                  {!hasScore && (
                    <p className="text-xs text-muted-foreground">Score da configurare</p>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {lead.source ?? "—"}
              </TableCell>
              <TableCell className="text-right">
                {lead.open_opportunities_count > 0 ? (
                  <Badge>{lead.open_opportunities_count}</Badge>
                ) : (
                  "0"
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
    </>
  );
}

// ─── SalesOSDashboard (pagina principale) ────────────────────────────────────

export default function SalesOSDashboard() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? null;
  const [searchParams, setSearchParams] = useSearchParams();
  const queryTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<SalesOSTab>(
    () => (isSalesOSTab(queryTab) ? queryTab : "pipeline"),
  );
  // Con più pipeline i numeri messi insieme non dicono niente: cicli e tassi
  // di lavori diversi. Sta nell'URL come il periodo e la scheda.
  const { data: pipelines = [], isSuccess: pipelineCaricate } = usePipelines();
  const queryPipeline = searchParams.get("pipeline");
  const pipelineId = queryPipeline && /^[0-9a-f-]{36}$/i.test(queryPipeline)
    && (!pipelineCaricate || pipelines.some((p: { id: string }) => p.id === queryPipeline))
    ? queryPipeline
    : undefined;
  const setPipelineId = (value: string) => {
    const nextParams = new URLSearchParams(searchParams);
    if (value === "tutte") nextParams.delete("pipeline");
    else nextParams.set("pipeline", value);
    setSearchParams(nextParams, { replace: true });
  };

  // Il periodo sta nell'URL come la scheda: ricaricando non torna a «30 giorni».
  const queryPeriodo = searchParams.get("periodo");
  const period: SalesOSPeriod = PERIOD_OPTIONS.some((o) => o.value === queryPeriodo)
    ? (queryPeriodo as SalesOSPeriod)
    : "30d";
  const setPeriod = (value: SalesOSPeriod) => {
    const nextParams = new URLSearchParams(searchParams);
    if (value === "30d") nextParams.delete("periodo");
    else nextParams.set("periodo", value);
    setSearchParams(nextParams, { replace: true });
  };
  const [topLeadsLimit, setTopLeadsLimit] = useState(10);

  const range = useMemo(() => getPeriodRange(period), [period]);

  useEffect(() => {
    setActiveTab(isSalesOSTab(queryTab) ? queryTab : "pipeline");
  }, [queryTab]);

  const handleTabChange = (value: string) => {
    const nextTab = isSalesOSTab(value) ? value : "pipeline";
    setActiveTab(nextTab);

    const nextParams = new URLSearchParams(searchParams);
    if (nextTab === "pipeline") {
      nextParams.delete("tab");
    } else {
      nextParams.set("tab", nextTab);
    }
    setSearchParams(nextParams);
  };

  if (!companyId)
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
        <Target className="h-8 w-8 opacity-40" />
        <span>Seleziona un'azienda per visualizzare Sales OS.</span>
      </div>
    );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/50 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-200">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-950">Sales OS</h1>
              <p className="text-sm text-slate-600">
                Centro di comando commerciale
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          {pipelines.length > 1 && (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-2 py-1 shadow-sm">
              <Target className="h-4 w-4 text-orange-500" />
              <Select value={pipelineId ?? "tutte"} onValueChange={setPipelineId}>
                <SelectTrigger className="h-9 w-[190px] border-0 bg-transparent shadow-none" aria-label="Pipeline">
                  <SelectValue placeholder="Pipeline" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tutte">Tutte le pipeline</SelectItem>
                  {pipelines.map((p: { id: string; name: string }) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-2 py-1 shadow-sm">
            <Calendar className="h-4 w-4 text-orange-500" />
            <Select value={period} onValueChange={(v) => setPeriod(v as SalesOSPeriod)}>
              <SelectTrigger className="h-9 w-[180px] border-0 bg-transparent shadow-none">
                <SelectValue placeholder="Periodo" />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          </div>
        </div>
      </div>

      {/* KPI Bar — sempre visibile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SalesVelocityCard companyId={companyId} daysBack={range.daysBack} periodLabel={range.label} pipelineId={pipelineId} />
        <QuoteRevenueCard
          companyId={companyId}
          dateFrom={range.dateFrom}
          dateTo={range.dateTo}
          periodLabel={range.label}
          pipelineId={pipelineId}
        />
      </div>

      <SalesFocusPanel
        companyId={companyId}
        daysBack={range.daysBack}
        dateFrom={range.dateFrom}
        dateTo={range.dateTo}
        periodLabel={range.label}
        onOpenStalled={() => handleTabChange("stalled")}
        onOpenConfig={() => handleTabChange("config")}
        pipelineId={pipelineId}
      />

      {/* Tabs principali */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="flex h-auto w-full max-w-full justify-start gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:grid sm:max-w-2xl sm:grid-cols-5">
          <TabsTrigger value="pipeline" className="flex shrink-0 items-center gap-1.5 whitespace-nowrap data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <TrendingUp className="h-3.5 w-3.5" />
            Pipeline
          </TabsTrigger>
          <TabsTrigger value="stalled" className="flex shrink-0 items-center gap-1.5 whitespace-nowrap data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            Ferme
          </TabsTrigger>
          <TabsTrigger value="team" className="flex shrink-0 items-center gap-1.5 whitespace-nowrap data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <Flame className="h-3.5 w-3.5" />
            Lead
          </TabsTrigger>
          <TabsTrigger value="analisi" className="flex shrink-0 items-center gap-1.5 whitespace-nowrap data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <Zap className="h-3.5 w-3.5" />
            Analisi
          </TabsTrigger>
          <TabsTrigger value="config" className="flex shrink-0 items-center gap-1.5 whitespace-nowrap data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <Settings2 className="h-3.5 w-3.5" />
            Config
          </TabsTrigger>
        </TabsList>

        {/* TAB: Pipeline & Forecast */}
        <TabsContent value="pipeline" className="space-y-4 mt-4">
          {/* Deal Health Overview */}
          <DealHealthOverview companyId={companyId} pipelineId={pipelineId} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  Pipeline Pesata per Stage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <WeightedPipelineChart companyId={companyId} pipelineId={pipelineId} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  Forecast: questo mese e i due successivi
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Le trattative aperte con la data di chiusura già passata contano nel mese in corso.
                </p>
              </CardHeader>
              <CardContent>
                <SalesForecastChart companyId={companyId} pipelineId={pipelineId} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB: Opportunità ferme */}
        <TabsContent value="stalled" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Opportunità Ferme — Richiede Attenzione
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StalledOpportunitiesPanel companyId={companyId} pipelineId={pipelineId} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Lead (il valore resta «team» per i link salvati) */}
        <TabsContent value="team" className="space-y-4 mt-4">
          <RimandoClassificaVenditori />
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Top Lead per Score
              </CardTitle>
              <Select value={String(topLeadsLimit)} onValueChange={(v) => setTopLeadsLimit(Number(v))}>
                <SelectTrigger className="w-[110px] h-8 text-xs">
                  <SelectValue placeholder="Top 10" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">Top 10</SelectItem>
                  <SelectItem value="25">Top 25</SelectItem>
                  <SelectItem value="50">Top 50</SelectItem>
                  <SelectItem value="100">Top 100</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <TopLeadsTable companyId={companyId} limit={topLeadsLimit} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Config Lead Scoring (Sprint 4) */}
        <TabsContent value="config" className="mt-4">
          <LeadScoringConfigForm companyId={companyId} />
        </TabsContent>

        {/* TAB: Analisi conversione */}
        <TabsContent value="analisi" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Conversione per Fonte Lead
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ConversionBySourceChart companyId={companyId} dateFrom={range.dateFrom} dateTo={range.dateTo} pipelineId={pipelineId} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
