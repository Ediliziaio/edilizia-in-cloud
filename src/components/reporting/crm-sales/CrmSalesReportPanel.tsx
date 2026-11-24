import type { ComponentType, ReactNode } from "react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronRight,
  Download,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  FileSignature,
  LineChart,
  Megaphone,
  ShieldAlert,
  Target,
  TrendingUp,
  Trophy,
  Users,
  WalletCards,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { useAdsSalesReport } from "@/hooks/useAdsSalesReport";
import { useCommercialPerformanceReport } from "@/hooks/useCommercialPerformanceReport";
import { useCompanyStaff } from "@/hooks/useOpportunitiesData";
import { isOpenOpportunity, type CommercialPerformanceReport } from "@/lib/reporting/commercialPerformanceReport";
import { AdsSalesReportPanel } from "@/components/reporting/ads-sales/AdsSalesReportPanel";
import {
  autoGranularity,
  buildCommercialTrend,
  buildPeriodComparison,
  TREND_METRICS,
  type CommercialTrendMetric,
  type CommercialTrendPoint,
  type PeriodComparisonMetric,
  type TimeGranularity,
} from "@/lib/reporting/commercialTrend";
import {
  buildFunnelConversion,
  buildPipelineAging,
  buildSalesEfficiency,
  buildSourceBreakdown,
  type FunnelConversion,
  type SourceBreakdownRow,
} from "@/lib/reporting/commercialAnalytics";
import { downloadFile, escapeCsvCell } from "@/lib/csvExport";
import {
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
  subMonths,
  subYears,
} from "date-fns";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { useId } from "react";
import { COLORI_GRAFICO, PillolaVariazione, StatGrafico, TESTO_ASSE, TooltipScheda, defsGrafico, idSvg } from "@/components/charts/grafici/comune";
import { Tendenza } from "@/components/dashboard/RiquadroNumero";
import { usePreferisceMenoMovimento } from "@/hooks/usePreferisceMenoMovimento";
import { cn } from "@/lib/utils";

import { useIsMobile } from "@/hooks/use-mobile";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
type PriorityTone = "critical" | "warning" | "good" | "info";

type PriorityAction = {
  title: string;
  detail: string;
  /** Frase con i segnaposto e i suoi valori: a schermo si traduce da qui (title e detail restano in italiano). */
  detailKey?: string;
  detailValues?: Record<string, string | number>;
  tone: PriorityTone;
};

type AdsSalesTotals = ReturnType<typeof useAdsSalesReport>["totals"];

// Telefono: le sezioni stanno a filo pagina, senza riquadro.
const SEZIONE_SENZA_RIQUADRO_TELEFONO = "max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none";

export function CrmSalesReportPanel({
  daysBack: initialDaysBack = 180,
}: {
  daysBack?: number;
}) {
  const tr = useT();
  const isMobile = useIsMobile();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const navigate = useNavigate();

  const initialPeriodKey = [30, 90, 180].includes(initialDaysBack) ? `${initialDaysBack}g` : "90g";
  const [periodKey, setPeriodKey] = useState(initialPeriodKey);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [granularity, setGranularity] = useState<TimeGranularity | "auto">("auto");
  const [compareMode, setCompareMode] = useState<"prev" | "yoy">("prev");
  const [trendMetric, setTrendMetric] = useState<CommercialTrendMetric>("fatturatoCents");

  const { from, to } = useMemo(() => resolvePeriod(periodKey, customFrom, customTo), [periodKey, customFrom, customTo]);
  const baseline = useMemo(() => resolveBaseline(from, to, compareMode), [from, to, compareMode]);
  const periodLabel =
    periodKey === "custom"
      ? `${from.toLocaleDateString("it-IT")} – ${to.toLocaleDateString("it-IT")}`
      : PERIOD_OPTIONS.find((o) => o.key === periodKey)?.label ?? "Periodo";
  // periodLabel va nel CSV e resta in italiano; a schermo si usa quello tradotto.
  const periodLabelUi =
    periodKey === "custom"
      ? `${from.toLocaleDateString(intlCampo())} – ${to.toLocaleDateString(intlCampo())}`
      : tr(PERIOD_OPTIONS.find((o) => o.key === periodKey)?.label ?? "Periodo");
  const adsDaysBack = Math.max(1, differenceInCalendarDays(to, from));
  const effectiveGranularity = granularity === "auto" ? autoGranularity(from, to) : granularity;

  const commercial = useCommercialPerformanceReport({ companyId, fromDate: from.toISOString(), toDate: to.toISOString() });
  const comparison = useCommercialPerformanceReport({ companyId, fromDate: baseline.from.toISOString(), toDate: baseline.to.toISOString() });
  const ads = useAdsSalesReport({ companyId, daysBack: adsDaysBack, provider: "all" });
  const report = commercial.report;
  const loading = commercial.isLoading || ads.isLoading;
  const priorities = buildPriorityActions(report, ads.totals);
  const errors = [commercial.error, ads.error].filter(Boolean);

  const trend = useMemo(
    () =>
      buildCommercialTrend(
        { contacts: commercial.rows.contacts, quotes: commercial.rows.quotes, orders: commercial.rows.orders },
        { from, to, granularity: effectiveGranularity },
      ),
    [commercial.rows, from, to, effectiveGranularity],
  );
  const periodCompare = useMemo(
    () =>
      buildPeriodComparison(
        { contacts: commercial.rows.contacts, quotes: commercial.rows.quotes, orders: commercial.rows.orders },
        { contacts: comparison.rows.contacts, quotes: comparison.rows.quotes, orders: comparison.rows.orders },
      ),
    [commercial.rows, comparison.rows],
  );
  const funnelConv = useMemo(
    () =>
      buildFunnelConversion({
        contacts: commercial.rows.contacts,
        appointments: commercial.rows.appointments,
        quotes: commercial.rows.quotes,
        orders: commercial.rows.orders,
      }),
    [commercial.rows],
  );
  const sourceRows = useMemo(
    () => buildSourceBreakdown(commercial.rows.contacts, commercial.rows.quotes, commercial.rows.orders),
    [commercial.rows],
  );
  const aging = useMemo(() => buildPipelineAging(commercial.rows.opportunities), [commercial.rows]);
  const salesEff = useMemo(
    () =>
      buildSalesEfficiency({
        openOppCount: commercial.rows.opportunities.filter((o) => isOpenOpportunity(o.status)).length,
        winRatePct: funnelConv.convQuoteWon ?? 0,
        avgDealCents: report.quotes.averageValueCents,
        cycleDays: report.quotes.avgQuoteToSaleDays,
        openValueCents: report.forecast.openValueCents,
        monthlyTargetCents: report.forecast.monthlyTargetCents,
        wonThisMonthCents: report.forecast.wonThisMonthCents,
      }),
    [commercial.rows, funnelConv, report],
  );
  const fatturatoCommCents = useMemo(() => sourceRows.reduce((s, r) => s + r.fatturatoCents, 0), [sourceRows]);

  const handleSourceDrill = (source: string) => {
    const base = "/azienda/marketing/contatti";
    // "Diretto / Altro" è l'etichetta sintetica dei lead senza fonte → usa il
    // filtro qualità "no_source" già supportato dalla pagina Contatti.
    navigate(
      source === "Diretto / Altro" ? `${base}?qualita=no_source` : `${base}?source=${encodeURIComponent(source)}`,
    );
  };

  const handleExport = () => {
    const rowsCsv: Array<[string, string, string]> = [
      ["Sezione", "Metrica", "Valore"],
      ["Periodo", "Intervallo", periodLabel],
      ["KPI", "Fatturato attribuito (Ads)", formatMoneyCsv(ads.totals.revenueCents)],
      ["KPI", "Pipeline aperta", formatMoneyCsv(report.forecast.openValueCents)],
      ["KPI", "Preventivi emessi", String(report.quotes.issued)],
      ["KPI", "Tasso accettazione %", String(report.quotes.acceptanceRate)],
      ["KPI", "Salute CRM /100", String(report.sync.healthScore)],
      ["Funnel", "Lead paid", String(ads.totals.leads)],
      ["Funnel", "Appuntamenti", String(ads.totals.appointments)],
      ["Funnel", "Vendite vinte", String(ads.totals.won)],
      ["Forecast", "Atteso 30 giorni", formatMoneyCsv(report.forecast.weighted30Cents)],
      ["Forecast", "Margine stimato", formatMoneyCsv(report.margin.estimatedMarginCents)],
    ];
    for (const point of trend) {
      rowsCsv.push([
        "Andamento",
        point.label,
        `${formatMoneyCsv(point.fatturatoCents)} · ${point.preventivi} prev · ${point.lead} lead · ${point.vinte} vend`,
      ]);
    }
    const csv = rowsCsv.map((row) => row.map((cell) => escapeCsvCell(cell, ";")).join(";")).join("\r\n");
    downloadFile(`﻿${csv}`, `report-crm-vendite.csv`, "text/csv;charset=utf-8;");
  };

  return (
    <div className="space-y-5 max-sm:space-y-3">
      {/* Telefono: solo il periodo, senza barra fissa né riquadro. */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm max-sm:static max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none">
        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground/80 max-sm:hidden" />
          <Select value={periodKey} onValueChange={setPeriodKey}>
            <SelectTrigger className="h-9 w-[200px] max-sm:w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((o) => (
                <SelectItem key={o.key} value={o.key}>{tr(o.label)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {periodKey === "custom" && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)}
                aria-label={tr("Data inizio")}
                className="h-9 rounded-md border border-border px-2 text-sm text-muted-foreground"
              />
              <span className="text-muted-foreground/80">→</span>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
                aria-label={tr("Data fine")}
                className="h-9 rounded-md border border-border px-2 text-sm text-muted-foreground"
              />
            </div>
          )}
        </div>
        {/* Niente export su telefono. */}
        {!isMobile && (
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={handleExport} disabled={loading}>
            <Download className="h-4 w-4" />
            {tr("Esporta CSV")}
          </Button>
        )}
      </div>

      {/* Telefono: i quattro numeri 2×2, senza titolo, periodo e spiegazione (li dice già la pagina). */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl max-sm:hidden">
            <Badge variant="outline" className="mb-3 border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-200">
              {periodLabelUi}
            </Badge>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">{tr("CRM e vendite")}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {tr("Pipeline, preventivi, margini e campagne che generano vendite — con le azioni da fare per prime.")}
            </p>
          </div>

          <div className="grid w-full gap-3 sm:grid-cols-2 xl:max-w-3xl max-sm:grid-cols-2 max-sm:gap-2">
            <ExecutiveKpi
              icon={CircleDollarSign}
              label={tr("Fatturato da Meta e Google")}
              value={formatMoney(ads.totals.revenueCents)}
              detail={tr("{n} vendite vinte da Meta + Google", { n: ads.totals.won })}
              loading={loading}
              tone="green"
            />
            <ExecutiveKpi
              icon={LineChart}
              label={tr("Pipeline aperta")}
              value={formatMoney(report.forecast.openValueCents)}
              detail={tr("{importo} attesi entro 30 giorni", { importo: formatMoney(report.forecast.weighted30Cents) })}
              loading={commercial.isLoading}
            />
            <ExecutiveKpi
              icon={FileSignature}
              label={tr("Preventivi emessi")}
              value={String(report.quotes.issued)}
              detail={tr("{percentuale}% accettazione · {importo} medio", { percentuale: report.quotes.acceptanceRate, importo: formatMoney(report.quotes.averageValueCents) })}
              loading={commercial.isLoading}
            />
            <ExecutiveKpi
              icon={ShieldAlert}
              label={tr("Salute CRM")}
              value={`${report.sync.healthScore}/100`}
              detail={tr("{n} criticità da sistemare", { n: report.sync.totalIssues })}
              loading={commercial.isLoading}
              tone={report.sync.healthScore >= 90 ? "green" : report.sync.healthScore >= 70 ? "amber" : "red"}
            />
          </div>
        </div>

        {errors.length > 0 && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{tr("Dati parziali: {errors}", { errors: errors.join(" · ") })}</span>
          </div>
        )}
      </section>

      <section className={cn("rounded-xl border border-border bg-card p-4 shadow-sm", SEZIONE_SENZA_RIQUADRO_TELEFONO)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SectionHeader
            icon={TrendingUp}
            title={isMobile ? tr("Vs periodo precedente") : tr("Confronto periodo")}
            description={compareMode === "yoy" ? tr("Vs stesso periodo dell'anno scorso.") : tr("Vs periodo precedente di pari durata.")}
          />
          {/* Telefono: il confronto resta sul periodo precedente. */}
          <Select value={compareMode} onValueChange={(v) => setCompareMode(v as "prev" | "yoy")}>
            <SelectTrigger className="h-9 w-[200px] max-sm:hidden"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="prev">{tr("Vs periodo precedente")}</SelectItem>
              <SelectItem value="yoy">{tr("Vs anno scorso")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 max-sm:mt-1.5 max-sm:grid-cols-2 max-sm:gap-2">
          {periodCompare.map((m) => (
            <ComparisonCard
              key={m.key}
              metric={m}
              loading={comparison.isLoading}
              spark={trend.map((t) => Number(t[m.key] ?? 0))}
            />
          ))}
        </div>
      </section>

      <section className={cn("rounded-xl border border-border bg-card p-4 shadow-sm", SEZIONE_SENZA_RIQUADRO_TELEFONO)}>
        <SectionHeader icon={TrendingUp} title={tr("Funnel commerciale")} description={tr("Dal lead alla vendita: barre proporzionali e % di conversione tra gli stadi (sui primi appuntamenti).")} />
        <div className="mt-4 grid gap-5 lg:grid-cols-[1.5fr_1fr] max-sm:mt-1.5 max-sm:gap-2">
          {commercial.isLoading ? (
            <Skeleton className="h-40 w-full rounded-lg" />
          ) : (
            <CommercialFunnel conv={funnelConv} />
          )}
          <div className="grid grid-cols-2 gap-3 self-start max-sm:grid-cols-3 max-sm:gap-2">
            <MiniMetric label={tr("Fatturato comm.")} value={formatMoney(fatturatoCommCents)} loading={commercial.isLoading} tone="green" />
            <MiniMetric label={tr("Ticket medio")} value={formatMoney(report.quotes.averageValueCents)} loading={commercial.isLoading} />
            {/* 0 €/g voleva dire «non calcolabile» (nessuna vendita chiusa), non zero. */}
            <MiniMetric label={tr("Sales velocity")} value={salesEff.velocityCentsPerDay > 0 ? `${formatMoney(salesEff.velocityCentsPerDay)}/g` : "—"} loading={commercial.isLoading} />
            {!commercial.isLoading && (report.forecast.monthlyTargetCents ?? 0) > 0 && (
              <div className="col-span-2 max-sm:col-span-3">
                <ObiettivoMese vintoCents={report.forecast.wonThisMonthCents ?? 0} obiettivoCents={report.forecast.monthlyTargetCents ?? 0} />
              </div>
            )}
          </div>
        </div>
        {!commercial.isLoading && (
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground max-sm:hidden">
            {/* Le parentesi quadre segnano il pezzo in grassetto: il traduttore le tiene attorno alle sue parole. */}
            {tr("Conversioni sui [primi appuntamenti] del calendario marketing: {primi} primi su {totali} totali ({followup} follow-up).", {
              primi: funnelConv.appuntamenti,
              totali: funnelConv.appuntamentiTotali,
              followup: Math.max(funnelConv.appuntamentiTotali - funnelConv.appuntamenti, 0),
            })
              .split(/[[\]]/)
              .map((pezzo, i) => (i === 1 ? <strong key={i}>{pezzo}</strong> : pezzo))}
          </p>
        )}
      </section>

      {/* Telefono: il grafico dell'andamento, il dettaglio operativo e i canali paid restano al computer. */}
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm max-sm:hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SectionHeader icon={TrendingUp} title={tr("Andamento nel tempo")} description={effectiveGranularity === "month" ? tr("Aggregato per mese.") : effectiveGranularity === "week" ? tr("Aggregato per settimana.") : tr("Aggregato per giorno.")} />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={granularity} onValueChange={(v) => setGranularity(v as TimeGranularity | "auto")}>
              <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{tr("Auto")}</SelectItem>
                <SelectItem value="day">{tr("Giorno")}</SelectItem>
                <SelectItem value="week">{tr("Settimana")}</SelectItem>
                <SelectItem value="month">{tr("Mese")}</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-1.5">
              {TREND_METRICS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setTrendMetric(m.key)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                    trendMetric === m.key
                      ? "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-300"
                      : "border-border text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  {tr(m.label)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 w-full">
          {commercial.isLoading ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : trend.length === 0 ? (
            <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">{tr("Nessun dato nel periodo selezionato.")}</p>
          ) : (
            <TrendChart data={trend} metric={trendMetric} />
          )}
        </div>
      </section>

      <CollapsibleSection icon={BarChart3} title={tr("Dettaglio operativo")} description={tr("Apri per i numeri di dettaglio: preventivi, forecast, qualità lead, perdite, fonti.")} defaultOpen={false} className="max-sm:hidden">
        <div className="grid gap-4 xl:grid-cols-2">
          <DetailPanel title={tr("Preventivi e tempi")} icon={FileSignature}>
            <div className="grid gap-3 sm:grid-cols-3">
              <MiniMetric label={tr("Emessi")} value={String(report.quotes.issued)} loading={commercial.isLoading} />
              <MiniMetric label={tr("Accettati")} value={String(report.quotes.accepted)} loading={commercial.isLoading} tone="green" />
              <MiniMetric label={tr("Rifiutati")} value={String(report.quotes.rejected)} loading={commercial.isLoading} tone="red" />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <MiniMetric label={tr("App -> preventivo")} value={report.quotes.avgAppointmentToQuoteDays === null ? "N/D" : tr("{n} giorni", { n: report.quotes.avgAppointmentToQuoteDays })} loading={commercial.isLoading} />
              <MiniMetric label={tr("Preventivo -> vendita")} value={report.quotes.avgQuoteToSaleDays === null ? "N/D" : tr("{n} giorni", { n: report.quotes.avgQuoteToSaleDays })} loading={commercial.isLoading} />
            </div>
          </DetailPanel>

          <DetailPanel title={tr("Forecast e margine")} icon={WalletCards}>
            <div className="grid gap-3 sm:grid-cols-3">
              <MiniMetric label={tr("Atteso 30g")} value={formatMoney(report.forecast.weighted30Cents)} loading={commercial.isLoading} />
              <MiniMetric label={tr("Atteso 60g")} value={formatMoney(report.forecast.weighted60Cents)} loading={commercial.isLoading} />
              <MiniMetric label={tr("Atteso 90g")} value={formatMoney(report.forecast.weighted90Cents)} loading={commercial.isLoading} />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <MiniMetric label={tr("Margine stimato")} value={formatMoney(report.margin.estimatedMarginCents)} loading={commercial.isLoading} tone="green" />
              <MiniMetric label={tr("Margine medio")} value={report.margin.averageMarginPct === null ? "N/D" : `${report.margin.averageMarginPct}%`} loading={commercial.isLoading} />
              <MiniMetric label={tr("Copertura")} value={`${report.margin.coveragePct}%`} loading={commercial.isLoading} tone={report.margin.coveragePct >= 80 ? "green" : "amber"} />
            </div>
            {aging.stale90 > 0 && !commercial.isLoading && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 p-3 text-sm text-amber-800">{tr("Pipeline ferma: {stale90} opportunità aperte da oltre 90 giorni ({staleValueCents}) — da chiudere o archiviare.", { stale90: String(aging.stale90 ?? ""), staleValueCents: formatMoney(aging.staleValueCents) })}</p>
            )}
            {report.margin.dataQualityWarning && !commercial.isLoading && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 p-3 text-sm text-amber-800">
                {tr(report.margin.dataQualityWarning)}
              </p>
            )}
          </DetailPanel>

          <DetailPanel title={tr("Qualità lead")} icon={Users}>
            <div className="grid gap-3 sm:grid-cols-4">
              <MiniMetric label={tr("Totali")} value={String(report.leadQuality.total)} loading={commercial.isLoading} />
              <MiniMetric label={tr("Buoni")} value={String(report.leadQuality.good)} loading={commercial.isLoading} tone="green" />
              <MiniMetric label={tr("Scarsi")} value={String(report.leadQuality.poor)} loading={commercial.isLoading} tone="red" />
              <MiniMetric label={tr("Score medio")} value={report.leadQuality.averageScore === null ? "N/D" : String(report.leadQuality.averageScore)} loading={commercial.isLoading} />
            </div>
            <LeadSegmentTable rows={report.leadQuality.topSegments} loading={commercial.isLoading} />
          </DetailPanel>

          <DetailPanel title={tr("Motivi di perdita")} icon={Trophy}>
            <LossReasonsList rows={report.lossReasons} perVenditore={report.lossByOwner ?? []} loading={commercial.isLoading} />
          </DetailPanel>

          <DetailPanel title={tr("Fatturato e margine per fonte")} icon={Megaphone}>
            <SourceBreakdownTable rows={sourceRows} loading={commercial.isLoading} onDrill={handleSourceDrill} />
          </DetailPanel>
        </div>
      </CollapsibleSection>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        {/* Telefono: le tre letture ripetono i numeri in alto; resta solo «Da fare adesso». */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm max-sm:hidden">
          <SectionHeader icon={Target} title={tr("Cosa guardare")} description={tr("Le tre letture chiave di salute commerciale.")} />
          <div className="mt-4 grid gap-3">
            <FocusCard
              label="1"
              title={tr("Il dato è affidabile?")}
              value={tr(report.sync.healthLabel)}
              detail={tr("{preventivi} preventivi senza opportunità · {appuntamenti} appuntamenti senza contatto", { preventivi: report.sync.quotesWithoutOpportunity, appuntamenti: report.sync.appointmentsWithoutContact })}
              loading={commercial.isLoading}
              tone={report.sync.healthScore >= 90 ? "green" : report.sync.healthScore >= 70 ? "amber" : "red"}
            />
            <FocusCard
              label="2"
              title={tr("La pipeline ha prossime azioni?")}
              value={tr("{n} senza prossimo step", { n: report.forecast.openWithoutNextStep })}
              detail={tr("{importo} attesi a 30 giorni", { importo: formatMoney(report.forecast.weighted30Cents) })}
              loading={commercial.isLoading}
              tone={report.forecast.openWithoutNextStep ? "amber" : "green"}
            />
            <FocusCard
              label="3"
              title={tr("Il marketing produce vendite?")}
              value={formatMoney(ads.totals.revenueCents)}
              detail={tr("{lead} lead paid · {appuntamenti} appuntamenti · ROAS {roas}", { lead: ads.totals.leads, appuntamenti: ads.totals.appointments, roas: formatRoas(ads.totals) })}
              loading={ads.isLoading}
              tone={ads.totals.revenueCents > 0 ? "green" : "amber"}
            />
          </div>
        </div>

        <div className={cn("rounded-xl border border-border bg-card p-4 shadow-sm", SEZIONE_SENZA_RIQUADRO_TELEFONO)}>
          <SectionHeader icon={ListIcon} title={tr("Da fare adesso")} description={tr("Priorità ordinate per impatto commerciale.")} />
          <div className="mt-4 space-y-3 max-sm:mt-1.5 max-sm:space-y-2">
            {loading ? (
              <>
                <Skeleton className="h-20 w-full rounded-lg" />
                <Skeleton className="h-20 w-full rounded-lg" />
                <Skeleton className="h-20 w-full rounded-lg" />
              </>
            ) : (
              priorities.map((action) => (
                <div key={action.title} className={cn("rounded-lg border p-3 max-sm:px-3 max-sm:py-2", priorityClassName(action.tone))}>
                  <div className="flex items-start gap-3 max-sm:gap-2">
                    {action.tone === "good" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                    <div>
                      <p className="text-sm font-semibold max-sm:text-[13px]">{tr(action.title)}</p>
                      <p className="mt-1 text-sm leading-5 opacity-85 max-sm:mt-0.5 max-sm:text-[11px] max-sm:leading-4">{action.detailKey ? tr(action.detailKey, action.detailValues) : tr(action.detail)}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <CollapsibleSection icon={Trophy} title={tr("Canali paid che generano vendite")} description={tr("Meta e Google: lead, appuntamenti, vendite e fatturato (tenuti separati).")} defaultOpen={false} className="max-sm:hidden">
        <AdsSalesReportPanel provider="all" daysBack={adsDaysBack} compact className="border-border bg-card shadow-sm" />
      </CollapsibleSection>
    </div>
  );
}

export function buildPriorityActions(report: CommercialPerformanceReport, adsTotals: AdsSalesTotals): PriorityAction[] {
  const actions: PriorityAction[] = [];

  if (report.sync.healthScore < 90) {
    actions.push({
      title: "Prima rendi affidabile il CRM",
      detail: `${report.sync.totalIssues} collegamenti mancanti tra preventivi, opportunità e appuntamenti.`,
      detailKey: "{n} collegamenti mancanti tra preventivi, opportunità e appuntamenti.",
      detailValues: { n: report.sync.totalIssues },
      tone: report.sync.healthScore < 70 ? "critical" : "warning",
    });
  }

  if (report.forecast.openWithoutNextStep > 0) {
    actions.push({
      title: "Assegna un prossimo step alla pipeline aperta",
      detail: `${report.forecast.openWithoutNextStep} opportunità aperte senza prossima azione.`,
      detailKey: "{n} opportunità aperte senza prossima azione.",
      detailValues: { n: report.forecast.openWithoutNextStep },
      tone: "warning",
    });
  }

  if (report.leadQuality.total > 0 && report.leadQuality.poor >= report.leadQuality.good) {
    actions.push({
      title: "Rivedi la qualità dei lead prima dei volumi",
      detail: `${report.leadQuality.poor} lead scarsi su ${report.leadQuality.total}: guarda zona, urgenza, budget e campagna.`,
      detailKey: "{scarsi} lead scarsi su {totale}: guarda zona, urgenza, budget e campagna.",
      detailValues: { scarsi: report.leadQuality.poor, totale: report.leadQuality.total },
      tone: "warning",
    });
  }

  if ((adsTotals.leads > 0 || adsTotals.won > 0) && adsTotals.spendCents === 0) {
    actions.push({
      title: "Importa la spesa Ads per leggere CPA e ROAS",
      detail: "Lead o vendite da Ads ma spesa a zero: senza i costi CPA e ROAS non si calcolano.",
      tone: "info",
    });
  }

  if (report.margin.coveragePct < 80) {
    actions.push({
      title: "Completa margini e costi interni",
      detail: `Margine noto sul ${report.margin.coveragePct}% del fatturato.`,
      detailKey: "Margine noto sul {percentuale}% del fatturato.",
      detailValues: { percentuale: report.margin.coveragePct },
      tone: "info",
    });
  }

  if (adsTotals.leads > 0 && adsTotals.won === 0) {
    actions.push({
      title: "Non giudicare le Ads solo dal CPL",
      detail: `${adsTotals.leads} lead da Ads senza vendite: prima follow-up e preventivi, poi creatività e budget.`,
      detailKey: "{n} lead da Ads senza vendite: prima follow-up e preventivi, poi creatività e budget.",
      detailValues: { n: adsTotals.leads },
      tone: "warning",
    });
  }

  if (!actions.length) {
    actions.push({
      title: "Sistema leggibile: puoi ottimizzare le campagne",
      detail: "Dati puliti: confronta ROAS, costo vendita e qualità lead.",
      tone: "good",
    });
  }

  return actions.slice(0, 4);
}

function ExecutiveKpi({
  icon: Icon,
  label,
  value,
  detail,
  loading,
  tone = "default",
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
  loading: boolean;
  tone?: "default" | "green" | "amber" | "red";
}) {
  return (
    // Telefono: nome e cifra; senza icona né riga di dettaglio.
    <div className={cn("rounded-lg border bg-card p-3 max-sm:min-w-0 max-sm:px-2.5 max-sm:py-2", toneClassName(tone))}>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground max-sm:mb-0.5 max-sm:truncate max-sm:text-[11px] max-sm:font-medium max-sm:normal-case">
        <Icon className="h-4 w-4 max-sm:hidden" />
        {label}
      </div>
      {loading ? (
        <>
          <Skeleton className="h-8 w-28 max-sm:h-6 max-sm:w-20" />
          <Skeleton className="mt-2 h-4 w-44 max-sm:hidden" />
        </>
      ) : (
        <>
          <p className="text-2xl font-semibold tracking-tight text-foreground max-sm:truncate max-sm:text-base">{value}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground max-sm:hidden">{detail}</p>
        </>
      )}
    </div>
  );
}

function FocusCard({
  label,
  title,
  value,
  detail,
  loading,
  tone,
}: {
  label: string;
  title: string;
  value: string;
  detail: string;
  loading: boolean;
  tone: "green" | "amber" | "red";
}) {
  return (
    <div className={cn("flex gap-3 rounded-lg border p-3", toneClassName(tone))}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card text-sm font-semibold text-muted-foreground shadow-sm">
        {label}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {loading ? (
          <>
            <Skeleton className="mt-2 h-6 w-40" />
            <Skeleton className="mt-2 h-4 w-56" />
          </>
        ) : (
          <>
            <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
          </>
        )}
      </div>
    </div>
  );
}

function CommercialFunnel({ conv }: { conv: FunnelConversion }) {
  const t = useT();
  // 15/11/2026: la barra più lunga è lo stadio più grande (gli appuntamenti possono superare i
  // lead del periodo: comprendono lead arrivati prima), e un passaggio sopra il 100% non è una
  // conversione: si scrive che lo stadio comprende contatti di prima.
  const max = Math.max(conv.lead, conv.appuntamenti, conv.preventivi, conv.vinti, 1);
  const stages: Array<{ label: string; value: number; conv: number | null }> = [
    { label: "Lead", value: conv.lead, conv: null },
    { label: t("1° appuntamento"), value: conv.appuntamenti, conv: conv.convLeadAppt },
    { label: t("Preventivi"), value: conv.preventivi, conv: conv.convApptQuote },
    { label: t("Vendite"), value: conv.vinti, conv: conv.convQuoteWon },
  ];
  return (
    <div className="space-y-3 max-sm:space-y-1.5">
      {stages.map((s, i) => {
        const width = s.value > 0 ? Math.max((s.value / max) * 100, 5) : 0;
        return (
          <div key={s.label}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium text-muted-foreground">{s.label}</span>
              <span className="tabular-nums text-muted-foreground">
                <span className="font-semibold text-foreground">{s.value}</span>
                {s.conv != null && s.conv <= 100 && (
                  <span className="ml-2 text-muted-foreground/80">
                    {s.conv}%<span className="max-sm:hidden"> {t("dal precedente")}</span>
                  </span>
                )}
                {s.conv != null && s.conv > 100 && (
                  <span className="ml-2 text-muted-foreground/80" title={t("Più dello stadio precedente: comprende contatti arrivati prima del periodo.")}>
                    {t("anche contatti di prima")}
                  </span>
                )}
              </span>
            </div>
            <div className="h-7 w-full overflow-hidden rounded-md bg-muted max-sm:h-4">
              <div className="cg-barra-cresce h-full rounded-md bg-gradient-to-r from-orange-400 to-orange-500" style={{ width: `${width}%`, animationDelay: `${200 + i * 110}ms` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TableBar({ value, max, tone = "orange" }: { value: number; max: number; tone?: "orange" | "rose" }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const track = tone === "rose" ? "bg-rose-100" : "bg-orange-100";
  const fill = tone === "rose" ? "bg-rose-400" : "bg-orange-400";
  return (
    <div className={cn("mt-1 h-1 w-full overflow-hidden rounded-full", track)}>
      <div className={cn("h-full rounded-full", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

function CollapsibleSection({
  icon: Icon,
  title,
  description,
  defaultOpen = true,
  className,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={cn("space-y-4", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div>
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-orange-600" />
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground/80 transition-transform", open && "rotate-180")} />
      </button>
      {open && children}
    </section>
  );
}

function DetailPanel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-orange-600" />
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-orange-600 max-sm:hidden" />
        <h3 className="text-base font-semibold text-foreground max-sm:text-[13px]">{title}</h3>
      </div>
      <p className="mt-1 text-sm text-muted-foreground max-sm:hidden">{description}</p>
    </div>
  );
}

function ComparisonCard({ metric, loading, spark }: { metric: PeriodComparisonMetric; loading: boolean; spark?: number[] }) {
  const t = useT();
  const value = metric.money ? formatMoney(metric.current) : String(metric.current);
  const delta = metric.deltaPct;
  const up = delta != null && delta >= 0;
  return (
    // Telefono: nome, cifra e variazione sulla stessa riga; senza minigrafico.
    <div className="rounded-lg border border-border bg-muted/50 p-3 max-sm:min-w-0 max-sm:px-2.5 max-sm:py-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase text-muted-foreground max-sm:truncate max-sm:text-[11px] max-sm:normal-case">{t(metric.label)}</p>
        {!loading && spark && spark.length >= 2 && (
          <span className="mt-0.5 shrink-0 max-sm:hidden">
            <Tendenza valori={spark} colore={up ? "#10b981" : "#ef4444"} etichetta={t("Andamento di {label}", { label: t(metric.label) })} />
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-6 w-24 max-sm:mt-1 max-sm:h-5 max-sm:w-16" />
      ) : (
        <div className="max-sm:flex max-sm:items-baseline max-sm:justify-between max-sm:gap-1">
          <p className="mt-1 text-lg font-semibold text-foreground max-sm:mt-0 max-sm:truncate max-sm:text-base">{value}</p>
          {delta === null ? (
            <p className="mt-1 text-xs text-muted-foreground max-sm:hidden">{t("nessun confronto")}</p>
          ) : (
            <PillolaVariazione pct={delta} className="mt-1 max-sm:mt-0 max-sm:shrink-0" titolo={t("Rispetto al periodo di confronto")} />
          )}
        </div>
      )}
    </div>
  );
}

function MiniMetric({
  label,
  value,
  loading,
  tone = "default",
}: {
  label: string;
  value: string;
  loading: boolean;
  tone?: "default" | "green" | "amber" | "red";
}) {
  return (
    <div className={cn("rounded-lg border bg-muted/50 p-3 max-sm:min-w-0 max-sm:px-2 max-sm:py-1.5", toneClassName(tone))}>
      <p className="text-xs font-medium uppercase text-muted-foreground max-sm:truncate max-sm:text-[11px] max-sm:normal-case">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-6 w-20 max-sm:mt-1 max-sm:h-5 max-sm:w-14" />
      ) : (
        <p className="mt-2 text-lg font-semibold text-foreground max-sm:mt-0 max-sm:truncate max-sm:text-[13px]">{value}</p>
      )}
    </div>
  );
}

function LeadSegmentTable({
  rows,
  loading,
}: {
  rows: Array<{ label: string; leads: number; good: number; poor: number; averageScore: number | null }>;
  loading: boolean;
}) {
  const t = useT();
  if (loading) return <Skeleton className="mt-3 h-28 w-full rounded-lg" />;
  if (!rows.length) {
    return <p className="mt-3 rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">{t("Nessun lead con score ICP/AI nel periodo.")}</p>;
  }

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("Segmento")}</TableHead>
            <TableHead className="text-right">Lead</TableHead>
            <TableHead className="text-right">{t("Buoni")}</TableHead>
            <TableHead className="text-right">{t("Scarsi")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.slice(0, 5).map((row) => (
            <TableRow key={row.label}>
              <TableCell className="font-medium">
                {row.label}
                <TableBar value={row.leads} max={Math.max(...rows.map((r) => r.leads), 1)} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{row.leads}</TableCell>
              <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">{row.good}</TableCell>
              <TableCell className="text-right tabular-nums text-rose-700">{row.poor}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function LossReasonsList({
  rows,
  perVenditore,
  loading,
}: {
  rows: Array<{ reason: string; count: number; valueCents: number }>;
  perVenditore: Array<{ ownerId: string | null; count: number; valueCents: number; topReason: string }>;
  loading: boolean;
}) {
  const tr = useT();
  const [tutti, setTutti] = useState(false);
  const { data: staff = [] } = useCompanyStaff();
  const nome = (id: string | null) => (id ? staff.find((s) => s.id === id)?.name || tr("Venditore") : tr("Senza venditore"));
  if (loading) return <Skeleton className="h-32 w-full rounded-lg" />;
  if (!rows.length) {
    return <p className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">{tr("Nessun motivo di perdita registrato nel periodo.")}</p>;
  }

  const totale = rows.reduce((t, r) => t + r.count, 0);
  return (
    <div className="space-y-2">
      {rows.slice(0, tutti ? rows.length : 5).map((row) => (
        <div key={row.reason} className="rounded-lg border bg-muted/50 px-3 py-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium capitalize text-foreground">{row.reason}</p>
              <p className="text-xs text-muted-foreground">{tr("{n} casi", { n: row.count })}{totale ? ` · ${Math.round((row.count / totale) * 100)}%` : ""}</p>
            </div>
            <p className="font-semibold tabular-nums text-foreground">{formatMoney(row.valueCents)}</p>
          </div>
          <TableBar value={row.valueCents} max={Math.max(...rows.map((r) => r.valueCents), 1)} tone="rose" />
        </div>
      ))}
      {rows.length > 5 && (
        <button type="button" className="text-xs font-medium text-muted-foreground hover:underline" onClick={() => setTutti((v) => !v)}>
          {tutti ? tr("Mostra i primi 5") : tr("Mostra tutti i {n} motivi", { n: rows.length })}
        </button>
      )}
      {perVenditore.length > 0 && (
        <div className="pt-2">
          <p className="pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr("Perse per venditore")}</p>
          <table className="w-full text-sm">
            <tbody>
              {perVenditore.slice(0, 8).map((v) => (
                <tr key={v.ownerId ?? "nessuno"} className="border-t">
                  <td className="py-1 pr-2">{nome(v.ownerId)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{v.count}</td>
                  <td className="py-1 pr-2 text-xs capitalize text-muted-foreground">{v.topReason}</td>
                  <td className="py-1 text-right tabular-nums">{formatMoney(v.valueCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SourceBreakdownTable({
  rows,
  loading,
  onDrill,
}: {
  rows: SourceBreakdownRow[];
  loading: boolean;
  onDrill?: (source: string) => void;
}) {
  const t = useT();
  if (loading) return <Skeleton className="h-32 w-full rounded-lg" />;
  if (!rows.length) {
    return <p className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">{t("Nessuna fonte con dati nel periodo.")}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("Fonte")}</TableHead>
            <TableHead className="text-right">Lead</TableHead>
            <TableHead className="text-right">{t("Vinti")}</TableHead>
            <TableHead className="text-right">{t("Fatturato")}</TableHead>
            <TableHead className="text-right">{t("Margine")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.slice(0, 6).map((row) => (
            <TableRow
              key={row.source}
              className={onDrill ? "cursor-pointer hover:bg-muted/50" : undefined}
              onClick={onDrill ? () => onDrill(row.source) : undefined}
              title={onDrill ? t("Apri i contatti con fonte \"{source}\"", { source: String(row.source ?? "") }) : undefined}
            >
              <TableCell className="font-medium capitalize">
                <span className="inline-flex items-center gap-1">
                  {row.source}
                  {onDrill && <ChevronRight className="h-3 w-3 text-muted-foreground/80" />}
                </span>
                <TableBar value={row.fatturatoCents} max={Math.max(...rows.map((r) => r.fatturatoCents), 1)} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{row.lead}</TableCell>
              <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">{row.vinti}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(row.fatturatoCents)}</TableCell>
              <TableCell className="text-right tabular-nums">{row.marginePct == null ? "—" : `${row.marginePct}%`}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ListIcon({ className }: { className?: string }) {
  return <Target className={className} />;
}

function priorityClassName(tone: PriorityTone) {
  if (tone === "good") return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200";
  if (tone === "critical") return "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200";
  return "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200";
}

function toneClassName(tone: "default" | "green" | "amber" | "red") {
  if (tone === "green") return "border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/30 dark:bg-emerald-500/10";
  if (tone === "amber") return "border-amber-200 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/10";
  if (tone === "red") return "border-rose-200 bg-rose-50/50 dark:border-rose-500/30 dark:bg-rose-500/10";
  return "border-border";
}

function formatRoas(metrics: Pick<AdsSalesTotals, "revenueCents" | "spendCents" | "roas">) {
  if (metrics.spendCents === 0) return "N/D";
  return `${metrics.roas.toFixed(2)}x`;
}

function TrendChart({ data, metric }: { data: CommercialTrendPoint[]; metric: CommercialTrendMetric }) {
  const t = useT();
  const meta = TREND_METRICS.find((m) => m.key === metric);
  const isMoney = !!meta?.money;
  const isPercent = !!meta?.percent;
  const labelForMetric = meta ? t(meta.label) : "";
  const id = idSvg(useId());
  const fermo = usePreferisceMenoMovimento();
  const fmt = (v: number) => (isMoney ? formatMoney(v) : isPercent ? `${v}%` : v.toLocaleString(intlCampo()));
  // Riga sopra il grafico: punto più alto, più basso e media della metrica scelta.
  const valori = data.map((d) => ({ d, v: d[metric] })).filter((x): x is { d: CommercialTrendPoint; v: number } => typeof x.v === "number");
  const alto = valori.length ? valori.reduce((a, b) => (b.v > a.v ? b : a)) : null;
  const basso = valori.length ? valori.reduce((a, b) => (b.v < a.v ? b : a)) : null;
  const media = valori.length ? valori.reduce((s, x) => s + x.v, 0) / valori.length : null;
  return (
    <div className="space-y-3">
      {/* Senza nessun valore diverso da zero la riga direbbe tre volte «0». */}
      {alto && basso && media != null && alto.v !== 0 && (
        <div className="grid grid-cols-3 gap-3 rounded-xl border bg-muted/30 px-3 py-2">
          <StatGrafico etichetta={t("Più alto")} valore={fmt(alto.v)} nota={alto.d.label} />
          <StatGrafico etichetta={t("Più basso")} valore={fmt(basso.v)} nota={basso.d.label} />
          <StatGrafico etichetta={t("Media")} valore={fmt(isMoney ? Math.round(media) : Math.round(media * 10) / 10)} nota={t("su {n} punti", { n: valori.length })} />
        </div>
      )}
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            {defsGrafico(id, { serie: COLORI_GRAFICO.arancio })}
            <CartesianGrid fill={`url(#${id}-punti)`} strokeDasharray="4 6" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={TESTO_ASSE} tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis
              tick={TESTO_ASSE}
              tickLine={false}
              axisLine={false}
              width={isMoney ? 64 : 40}
              allowDecimals={false}
              tickFormatter={(value) => (isMoney ? formatMoneyShort(Number(value)) : isPercent ? `${value}%` : String(value))}
            />
            <RechartsTooltip
              cursor={{ stroke: COLORI_GRAFICO.arancio, strokeOpacity: 0.35, strokeDasharray: "3 3" }}
              content={(p) => (
                <TooltipScheda
                  active={p.active}
                  payload={(p.payload ?? []).filter((x) => x.name !== "area").map((x) => ({ ...x, name: labelForMetric })) as never}
                  label={String(p.label ?? "")}
                  formato={(v) => fmt(v)}
                />
              )}
            />
            <Area type="monotone" dataKey={metric} name="area" stroke="none" fill={`url(#${id}-sfuma-serie)`} connectNulls isAnimationActive={!fermo} animationDuration={900} activeDot={false} legendType="none" />
            <Line
              type="monotone"
              dataKey={metric}
              stroke={COLORI_GRAFICO.arancio}
              strokeWidth={2.5}
              filter={`url(#${id}-ombra)`}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--background))", fill: COLORI_GRAFICO.arancio }}
              connectNulls
              isAnimationActive={!fermo}
              animationDuration={900}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Riquadro scuro: il venduto del mese contro l'obiettivo mensile (se c'è). */
function ObiettivoMese({ vintoCents, obiettivoCents }: { vintoCents: number; obiettivoCents: number }) {
  const t = useT();
  const pct = obiettivoCents > 0 ? (vintoCents / obiettivoCents) * 100 : 0;
  const oggi = new Date();
  const fineMese = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 0);
  const giorniRimasti = fineMese.getDate() - oggi.getDate();
  const manca = Math.max(0, obiettivoCents - vintoCents);
  const raggiunto = pct >= 100;
  return (
    <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-4 text-slate-50 shadow-sm dark:border-slate-700">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">{t("Obiettivo del mese")}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums tracking-tight">{Math.round(pct)}%</span>
        <span className="text-xs text-muted-foreground/80">{raggiunto ? t("raggiunto") : t("{giorniRimasti} giorni alla fine del mese", { giorniRimasti: String(giorniRimasti ?? "") })}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(pct, 100))} aria-label={t("Obiettivo del mese")}>
        <div className={cn("cg-barra-cresce h-full rounded-full bg-gradient-to-r", raggiunto ? "from-emerald-400 to-teal-300" : "from-orange-400 to-amber-300")} style={{ width: `${Math.max(2, Math.min(pct, 100))}%` }} />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <div><dt className="text-muted-foreground/80">{t("Venduto")}</dt><dd className="font-semibold tabular-nums">{formatMoneyShort(vintoCents)}</dd></div>
        <div><dt className="text-muted-foreground/80">{t("Obiettivo")}</dt><dd className="font-semibold tabular-nums">{formatMoneyShort(obiettivoCents)}</dd></div>
        <div><dt className="text-muted-foreground/80">{t("Manca")}</dt><dd className={cn("font-semibold tabular-nums", manca === 0 && "text-emerald-300")}>{manca === 0 ? t("niente") : formatMoneyShort(manca)}</dd></div>
      </dl>
    </div>
  );
}

const PERIOD_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "30g", label: "Ultimi 30 giorni" },
  { key: "90g", label: "Ultimi 90 giorni" },
  { key: "180g", label: "Ultimi 180 giorni" },
  { key: "mese-corrente", label: "Questo mese" },
  { key: "mese-scorso", label: "Mese scorso" },
  { key: "trimestre", label: "Questo trimestre" },
  { key: "anno", label: "Quest'anno (YTD)" },
  { key: "custom", label: "Personalizzato…" },
];

function resolvePeriod(key: string, customFrom: string, customTo: string): { from: Date; to: Date } {
  const now = new Date();
  switch (key) {
    case "30g": return { from: startOfDay(subDays(now, 30)), to: now };
    case "90g": return { from: startOfDay(subDays(now, 90)), to: now };
    case "180g": return { from: startOfDay(subDays(now, 180)), to: now };
    case "mese-corrente": return { from: startOfMonth(now), to: now };
    case "mese-scorso": {
      const m = subMonths(now, 1);
      return { from: startOfMonth(m), to: endOfMonth(m) };
    }
    case "trimestre": return { from: startOfQuarter(now), to: now };
    case "anno": return { from: startOfYear(now), to: now };
    case "custom": {
      const f = customFrom ? startOfDay(new Date(customFrom)) : startOfDay(subDays(now, 30));
      const t = customTo ? endOfDay(new Date(customTo)) : now;
      return f.getTime() <= t.getTime() ? { from: f, to: t } : { from: t, to: f };
    }
    default: return { from: startOfDay(subDays(now, 90)), to: now };
  }
}

function resolveBaseline(from: Date, to: Date, mode: "prev" | "yoy"): { from: Date; to: Date } {
  if (mode === "yoy") return { from: subYears(from, 1), to: subYears(to, 1) };
  const span = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - span), to: from };
}

function formatMoneyShort(cents: number) {
  const eur = cents / 100;
  if (Math.abs(eur) >= 1000) return `${(eur / 1000).toFixed(eur % 1000 === 0 ? 0 : 1)}k €`;
  return `${Math.round(eur)} €`;
}

/** Importi per il CSV: sempre in formato italiano, qualunque sia la lingua dell'app. */
function formatMoneyCsv(cents: number) {
  if (!cents) return "0 €";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2, useGrouping: "always" }).format(cents / 100);
}

function formatMoney(cents: number) {
  if (!cents) return "0 €";
  return new Intl.NumberFormat(intlCampo(), {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2, useGrouping: "always" }).format(cents / 100);
}
