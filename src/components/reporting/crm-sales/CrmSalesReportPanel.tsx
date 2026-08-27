import type { ComponentType, ReactNode } from "react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
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
import { CartesianGrid, Line, LineChart as RLineChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";

type PriorityTone = "critical" | "warning" | "good" | "info";

type PriorityAction = {
  title: string;
  detail: string;
  tone: PriorityTone;
};

type AdsSalesTotals = ReturnType<typeof useAdsSalesReport>["totals"];

export function CrmSalesReportPanel({
  daysBack: initialDaysBack = 180,
}: {
  daysBack?: number;
}) {
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
      ["KPI", "Fatturato attribuito (Ads)", formatMoney(ads.totals.revenueCents)],
      ["KPI", "Pipeline aperta", formatMoney(report.forecast.openValueCents)],
      ["KPI", "Preventivi emessi", String(report.quotes.issued)],
      ["KPI", "Tasso accettazione %", String(report.quotes.acceptanceRate)],
      ["KPI", "Salute CRM /100", String(report.sync.healthScore)],
      ["Funnel", "Lead paid", String(ads.totals.leads)],
      ["Funnel", "Appuntamenti", String(ads.totals.appointments)],
      ["Funnel", "Vendite vinte", String(ads.totals.won)],
      ["Forecast", "Atteso 30 giorni", formatMoney(report.forecast.weighted30Cents)],
      ["Forecast", "Margine stimato", formatMoney(report.margin.estimatedMarginCents)],
    ];
    for (const point of trend) {
      rowsCsv.push([
        "Andamento",
        point.label,
        `${formatMoney(point.fatturatoCents)} · ${point.preventivi} prev · ${point.lead} lead · ${point.vinte} vend`,
      ]);
    }
    const csv = rowsCsv.map((row) => row.map((cell) => escapeCsvCell(cell, ";")).join(";")).join("\r\n");
    downloadFile(`﻿${csv}`, `report-crm-vendite.csv`, "text/csv;charset=utf-8;");
  };

  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="h-4 w-4 text-slate-400" />
          <Select value={periodKey} onValueChange={setPeriodKey}>
            <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((o) => (
                <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
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
                aria-label="Data inizio"
                className="h-9 rounded-md border border-slate-200 px-2 text-sm text-slate-700"
              />
              <span className="text-slate-400">→</span>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
                aria-label="Data fine"
                className="h-9 rounded-md border border-slate-200 px-2 text-sm text-slate-700"
              />
            </div>
          )}
        </div>
        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={handleExport} disabled={loading}>
          <Download className="h-4 w-4" />
          Esporta CSV
        </Button>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <Badge variant="outline" className="mb-3 border-orange-200 bg-orange-50 text-orange-700">
              {periodLabel}
            </Badge>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">CRM e vendite</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Pipeline, preventivi, margini e campagne che generano vendite — con le azioni da fare per prime.
            </p>
          </div>

          <div className="grid w-full gap-3 sm:grid-cols-2 xl:max-w-3xl">
            <ExecutiveKpi
              icon={CircleDollarSign}
              label="Fatturato attribuito"
              value={formatMoney(ads.totals.revenueCents)}
              detail={`${ads.totals.won} vendite vinte da Meta + Google`}
              loading={loading}
              tone="green"
            />
            <ExecutiveKpi
              icon={LineChart}
              label="Pipeline aperta"
              value={formatMoney(report.forecast.openValueCents)}
              detail={`${formatMoney(report.forecast.weighted30Cents)} attesi entro 30 giorni`}
              loading={commercial.isLoading}
            />
            <ExecutiveKpi
              icon={FileSignature}
              label="Preventivi emessi"
              value={String(report.quotes.issued)}
              detail={`${report.quotes.acceptanceRate}% accettazione · ${formatMoney(report.quotes.averageValueCents)} medio`}
              loading={commercial.isLoading}
            />
            <ExecutiveKpi
              icon={ShieldAlert}
              label="Salute CRM"
              value={`${report.sync.healthScore}/100`}
              detail={`${report.sync.totalIssues} criticità da sistemare`}
              loading={commercial.isLoading}
              tone={report.sync.healthScore >= 90 ? "green" : report.sync.healthScore >= 70 ? "amber" : "red"}
            />
          </div>
        </div>

        {errors.length > 0 && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Dati parziali: {errors.join(" · ")}</span>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SectionHeader
            icon={TrendingUp}
            title="Confronto periodo"
            description={compareMode === "yoy" ? "Vs stesso periodo dell'anno scorso." : "Vs periodo precedente di pari durata."}
          />
          <Select value={compareMode} onValueChange={(v) => setCompareMode(v as "prev" | "yoy")}>
            <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="prev">Vs periodo precedente</SelectItem>
              <SelectItem value="yoy">Vs anno scorso</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <SectionHeader icon={TrendingUp} title="Funnel commerciale" description="Dal lead alla vendita: barre proporzionali e % di conversione tra gli stadi (sui primi appuntamenti)." />
        <div className="mt-4 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          {commercial.isLoading ? (
            <Skeleton className="h-40 w-full rounded-lg" />
          ) : (
            <CommercialFunnel conv={funnelConv} />
          )}
          <div className="grid grid-cols-2 gap-3 self-start">
            <MiniMetric label="Fatturato comm." value={formatMoney(fatturatoCommCents)} loading={commercial.isLoading} tone="green" />
            <MiniMetric label="Ticket medio" value={formatMoney(report.quotes.averageValueCents)} loading={commercial.isLoading} />
            <MiniMetric label="Sales velocity" value={`${formatMoney(salesEff.velocityCentsPerDay)}/g`} loading={commercial.isLoading} />
          </div>
        </div>
        {!commercial.isLoading && (
          <p className="mt-2 text-[11px] leading-snug text-slate-500">
            Conversioni sui <strong>primi appuntamenti</strong> del calendario marketing: {funnelConv.appuntamenti} primi su{" "}
            {funnelConv.appuntamentiTotali} totali ({Math.max(funnelConv.appuntamentiTotali - funnelConv.appuntamenti, 0)} follow-up).
          </p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SectionHeader icon={TrendingUp} title="Andamento nel tempo" description={`Aggregato per ${effectiveGranularity === "month" ? "mese" : effectiveGranularity === "week" ? "settimana" : "giorno"}.`} />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={granularity} onValueChange={(v) => setGranularity(v as TimeGranularity | "auto")}>
              <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="day">Giorno</SelectItem>
                <SelectItem value="week">Settimana</SelectItem>
                <SelectItem value="month">Mese</SelectItem>
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
                      ? "border-orange-300 bg-orange-50 text-orange-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 h-64 w-full">
          {commercial.isLoading ? (
            <Skeleton className="h-full w-full rounded-lg" />
          ) : trend.length === 0 ? (
            <p className="flex h-full items-center justify-center text-sm text-slate-500">Nessun dato nel periodo selezionato.</p>
          ) : (
            <TrendChart data={trend} metric={trendMetric} />
          )}
        </div>
      </section>

      <CollapsibleSection icon={BarChart3} title="Dettaglio operativo" description="Apri per i numeri di dettaglio: preventivi, forecast, qualità lead, perdite, fonti." defaultOpen={false}>
        <div className="grid gap-4 xl:grid-cols-2">
          <DetailPanel title="Preventivi e tempi" icon={FileSignature}>
            <div className="grid gap-3 sm:grid-cols-3">
              <MiniMetric label="Emessi" value={String(report.quotes.issued)} loading={commercial.isLoading} />
              <MiniMetric label="Accettati" value={String(report.quotes.accepted)} loading={commercial.isLoading} tone="green" />
              <MiniMetric label="Rifiutati" value={String(report.quotes.rejected)} loading={commercial.isLoading} tone="red" />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <MiniMetric label="App -> preventivo" value={formatDays(report.quotes.avgAppointmentToQuoteDays)} loading={commercial.isLoading} />
              <MiniMetric label="Preventivo -> vendita" value={formatDays(report.quotes.avgQuoteToSaleDays)} loading={commercial.isLoading} />
            </div>
          </DetailPanel>

          <DetailPanel title="Forecast e margine" icon={WalletCards}>
            <div className="grid gap-3 sm:grid-cols-3">
              <MiniMetric label="Atteso 30g" value={formatMoney(report.forecast.weighted30Cents)} loading={commercial.isLoading} />
              <MiniMetric label="Atteso 60g" value={formatMoney(report.forecast.weighted60Cents)} loading={commercial.isLoading} />
              <MiniMetric label="Atteso 90g" value={formatMoney(report.forecast.weighted90Cents)} loading={commercial.isLoading} />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <MiniMetric label="Margine stimato" value={formatMoney(report.margin.estimatedMarginCents)} loading={commercial.isLoading} tone="green" />
              <MiniMetric label="Margine medio" value={report.margin.averageMarginPct === null ? "N/D" : `${report.margin.averageMarginPct}%`} loading={commercial.isLoading} />
              <MiniMetric label="Copertura" value={`${report.margin.coveragePct}%`} loading={commercial.isLoading} tone={report.margin.coveragePct >= 80 ? "green" : "amber"} />
            </div>
            {aging.stale90 > 0 && !commercial.isLoading && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Pipeline ferma: {aging.stale90} opportunità aperte da oltre 90 giorni ({formatMoney(aging.staleValueCents)}) — da chiudere o archiviare.
              </p>
            )}
            {report.margin.dataQualityWarning && !commercial.isLoading && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {report.margin.dataQualityWarning}
              </p>
            )}
          </DetailPanel>

          <DetailPanel title="Qualità lead" icon={Users}>
            <div className="grid gap-3 sm:grid-cols-4">
              <MiniMetric label="Totali" value={String(report.leadQuality.total)} loading={commercial.isLoading} />
              <MiniMetric label="Buoni" value={String(report.leadQuality.good)} loading={commercial.isLoading} tone="green" />
              <MiniMetric label="Scarsi" value={String(report.leadQuality.poor)} loading={commercial.isLoading} tone="red" />
              <MiniMetric label="Score medio" value={report.leadQuality.averageScore === null ? "N/D" : String(report.leadQuality.averageScore)} loading={commercial.isLoading} />
            </div>
            <LeadSegmentTable rows={report.leadQuality.topSegments} loading={commercial.isLoading} />
          </DetailPanel>

          <DetailPanel title="Motivi di perdita" icon={Trophy}>
            <LossReasonsList rows={report.lossReasons} loading={commercial.isLoading} />
          </DetailPanel>

          <DetailPanel title="Fatturato e margine per fonte" icon={Megaphone}>
            <SourceBreakdownTable rows={sourceRows} loading={commercial.isLoading} onDrill={handleSourceDrill} />
          </DetailPanel>
        </div>
      </CollapsibleSection>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <SectionHeader icon={Target} title="Cosa guardare" description="Le tre letture chiave di salute commerciale." />
          <div className="mt-4 grid gap-3">
            <FocusCard
              label="1"
              title="Il dato è affidabile?"
              value={report.sync.healthLabel}
              detail={`${report.sync.quotesWithoutOpportunity} preventivi senza opportunità · ${report.sync.appointmentsWithoutContact} appuntamenti senza contatto`}
              loading={commercial.isLoading}
              tone={report.sync.healthScore >= 90 ? "green" : report.sync.healthScore >= 70 ? "amber" : "red"}
            />
            <FocusCard
              label="2"
              title="La pipeline ha prossime azioni?"
              value={`${report.forecast.openWithoutNextStep} senza prossimo step`}
              detail={`${formatMoney(report.forecast.weighted30Cents)} attesi a 30 giorni`}
              loading={commercial.isLoading}
              tone={report.forecast.openWithoutNextStep ? "amber" : "green"}
            />
            <FocusCard
              label="3"
              title="Il marketing produce vendite?"
              value={formatMoney(ads.totals.revenueCents)}
              detail={`${ads.totals.leads} lead paid · ${ads.totals.appointments} appuntamenti · ROAS ${formatRoas(ads.totals)}`}
              loading={ads.isLoading}
              tone={ads.totals.revenueCents > 0 ? "green" : "amber"}
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <SectionHeader icon={ListIcon} title="Da fare adesso" description="Priorità ordinate per impatto commerciale." />
          <div className="mt-4 space-y-3">
            {loading ? (
              <>
                <Skeleton className="h-20 w-full rounded-lg" />
                <Skeleton className="h-20 w-full rounded-lg" />
                <Skeleton className="h-20 w-full rounded-lg" />
              </>
            ) : (
              priorities.map((action) => (
                <div key={action.title} className={cn("rounded-lg border p-3", priorityClassName(action.tone))}>
                  <div className="flex items-start gap-3">
                    {action.tone === "good" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                    <div>
                      <p className="text-sm font-semibold">{action.title}</p>
                      <p className="mt-1 text-sm leading-5 opacity-85">{action.detail}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <CollapsibleSection icon={Trophy} title="Canali paid che generano vendite" description="Meta e Google: lead, appuntamenti, vendite e fatturato (tenuti separati)." defaultOpen={false}>
        <AdsSalesReportPanel provider="all" daysBack={adsDaysBack} compact className="border-slate-200 bg-white shadow-sm" />
      </CollapsibleSection>
    </div>
  );
}

export function buildPriorityActions(report: CommercialPerformanceReport, adsTotals: AdsSalesTotals): PriorityAction[] {
  const actions: PriorityAction[] = [];

  if (report.sync.healthScore < 90) {
    actions.push({
      title: "Prima rendi affidabile il CRM",
      detail: `${report.sync.totalIssues} criticità bloccano una lettura pulita: collega preventivi, opportunità e appuntamenti prima di scalare budget.`,
      tone: report.sync.healthScore < 70 ? "critical" : "warning",
    });
  }

  if (report.forecast.openWithoutNextStep > 0) {
    actions.push({
      title: "Assegna un prossimo step alla pipeline aperta",
      detail: `${report.forecast.openWithoutNextStep} opportunità aperte non hanno una prossima azione: sono soldi in pipeline ma senza guida commerciale.`,
      tone: "warning",
    });
  }

  if (report.leadQuality.total > 0 && report.leadQuality.poor >= report.leadQuality.good) {
    actions.push({
      title: "Rivedi la qualità dei lead prima dei volumi",
      detail: `${report.leadQuality.poor} lead risultano scarsi su ${report.leadQuality.total}: controlla zona, urgenza, budget e campagna sorgente.`,
      tone: "warning",
    });
  }

  if ((adsTotals.leads > 0 || adsTotals.won > 0) && adsTotals.spendCents === 0) {
    actions.push({
      title: "Importa la spesa Ads per leggere CPA e ROAS",
      detail: "Ci sono lead o vendite attribuite, ma la spesa risulta a zero: collega i costi campagna prima di giudicare costo appuntamento e ritorno.",
      tone: "info",
    });
  }

  if (report.margin.coveragePct < 80) {
    actions.push({
      title: "Completa margini e costi interni",
      detail: `Copertura margine al ${report.margin.coveragePct}%: senza margine reale il fatturato non basta per decidere cosa scalare.`,
      tone: "info",
    });
  }

  if (adsTotals.leads > 0 && adsTotals.won === 0) {
    actions.push({
      title: "Non giudicare le Ads solo dal CPL",
      detail: `${adsTotals.leads} lead paid non hanno ancora vendite vinte attribuite: prima verifica follow-up e preventivi, poi ottimizzi creatività e budget.`,
      tone: "warning",
    });
  }

  if (!actions.length) {
    actions.push({
      title: "Sistema leggibile: puoi ottimizzare le campagne",
      detail: "CRM, pipeline e margini sono abbastanza puliti: ora confronta ROAS, costo vendita e qualità lead per decidere dove spingere.",
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
    <div className={cn("rounded-lg border bg-white p-3", toneClassName(tone))}>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      {loading ? (
        <>
          <Skeleton className="h-8 w-28" />
          <Skeleton className="mt-2 h-4 w-44" />
        </>
      ) : (
        <>
          <p className="text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
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
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-slate-700 shadow-sm">
        {label}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-950">{title}</p>
        {loading ? (
          <>
            <Skeleton className="mt-2 h-6 w-40" />
            <Skeleton className="mt-2 h-4 w-56" />
          </>
        ) : (
          <>
            <p className="mt-1 text-lg font-semibold text-slate-950">{value}</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">{detail}</p>
          </>
        )}
      </div>
    </div>
  );
}

function CommercialFunnel({ conv }: { conv: FunnelConversion }) {
  const max = Math.max(conv.lead, 1);
  const stages: Array<{ label: string; value: number; conv: number | null }> = [
    { label: "Lead", value: conv.lead, conv: null },
    { label: "1° appuntamento", value: conv.appuntamenti, conv: conv.convLeadAppt },
    { label: "Preventivi", value: conv.preventivi, conv: conv.convApptQuote },
    { label: "Vendite", value: conv.vinti, conv: conv.convQuoteWon },
  ];
  return (
    <div className="space-y-3">
      {stages.map((s) => {
        const width = s.value > 0 ? Math.max((s.value / max) * 100, 5) : 0;
        return (
          <div key={s.label}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium text-slate-700">{s.label}</span>
              <span className="tabular-nums text-slate-500">
                <span className="font-semibold text-slate-900">{s.value}</span>
                {s.conv != null && <span className="ml-2 text-slate-400">{s.conv}% dal precedente</span>}
              </span>
            </div>
            <div className="h-7 w-full overflow-hidden rounded-md bg-slate-100">
              <div className="h-full rounded-md bg-gradient-to-r from-orange-400 to-orange-500 transition-all" style={{ width: `${width}%` }} />
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
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="space-y-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div>
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-orange-600" />
            <h3 className="text-base font-semibold text-slate-950">{title}</h3>
          </div>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
        <ChevronDown className={cn("h-5 w-5 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
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
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-orange-600" />
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{title}</h3>
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
        <Icon className="h-4 w-4 text-orange-600" />
        <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      </div>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
    </div>
  );
}

function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const pts = values.filter((v) => Number.isFinite(v));
  if (pts.length < 2) return null;
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const range = max - min || 1;
  const w = 72;
  const h = 20;
  const step = w / (pts.length - 1);
  const d = pts
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ComparisonCard({ metric, loading, spark }: { metric: PeriodComparisonMetric; loading: boolean; spark?: number[] }) {
  const value = metric.money ? formatMoney(metric.current) : String(metric.current);
  const delta = metric.deltaPct;
  const up = delta != null && delta >= 0;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase text-slate-500">{metric.label}</p>
        {!loading && spark && spark.length >= 2 && (
          <Sparkline values={spark} className={cn("mt-0.5 shrink-0", up ? "text-emerald-500/70" : "text-rose-500/70")} />
        )}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-6 w-24" />
      ) : (
        <>
          <p className="mt-1 text-lg font-semibold text-slate-950">{value}</p>
          {delta === null ? (
            <p className="mt-1 text-xs text-slate-400">nessun confronto</p>
          ) : (
            <p
              className={cn(
                "mt-1 inline-flex items-center gap-1 text-xs font-medium",
                up ? "text-emerald-700" : "text-rose-700",
              )}
            >
              {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {Math.abs(delta)}%
            </p>
          )}
        </>
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
    <div className={cn("rounded-lg border bg-slate-50 p-3", toneClassName(tone))}>
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      {loading ? <Skeleton className="mt-2 h-6 w-20" /> : <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>}
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
  if (loading) return <Skeleton className="mt-3 h-28 w-full rounded-lg" />;
  if (!rows.length) {
    return <p className="mt-3 rounded-lg border bg-slate-50 p-3 text-sm text-slate-600">Nessun lead con score ICP/AI nel periodo.</p>;
  }

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Segmento</TableHead>
            <TableHead className="text-right">Lead</TableHead>
            <TableHead className="text-right">Buoni</TableHead>
            <TableHead className="text-right">Scarsi</TableHead>
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
              <TableCell className="text-right tabular-nums text-emerald-700">{row.good}</TableCell>
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
  loading,
}: {
  rows: Array<{ reason: string; count: number; valueCents: number }>;
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-32 w-full rounded-lg" />;
  if (!rows.length) {
    return <p className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-600">Nessun motivo di perdita registrato nel periodo.</p>;
  }

  return (
    <div className="space-y-2">
      {rows.slice(0, 5).map((row) => (
        <div key={row.reason} className="rounded-lg border bg-slate-50 px-3 py-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium capitalize text-slate-900">{row.reason}</p>
              <p className="text-xs text-slate-500">{row.count} casi</p>
            </div>
            <p className="font-semibold tabular-nums text-slate-950">{formatMoney(row.valueCents)}</p>
          </div>
          <TableBar value={row.valueCents} max={Math.max(...rows.map((r) => r.valueCents), 1)} tone="rose" />
        </div>
      ))}
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
  if (loading) return <Skeleton className="h-32 w-full rounded-lg" />;
  if (!rows.length) {
    return <p className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-600">Nessuna fonte con dati nel periodo.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fonte</TableHead>
            <TableHead className="text-right">Lead</TableHead>
            <TableHead className="text-right">Vinti</TableHead>
            <TableHead className="text-right">Fatturato</TableHead>
            <TableHead className="text-right">Margine</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.slice(0, 6).map((row) => (
            <TableRow
              key={row.source}
              className={onDrill ? "cursor-pointer hover:bg-slate-50" : undefined}
              onClick={onDrill ? () => onDrill(row.source) : undefined}
              title={onDrill ? `Apri i contatti con fonte "${row.source}"` : undefined}
            >
              <TableCell className="font-medium capitalize">
                <span className="inline-flex items-center gap-1">
                  {row.source}
                  {onDrill && <ChevronRight className="h-3 w-3 text-slate-400" />}
                </span>
                <TableBar value={row.fatturatoCents} max={Math.max(...rows.map((r) => r.fatturatoCents), 1)} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{row.lead}</TableCell>
              <TableCell className="text-right tabular-nums text-emerald-700">{row.vinti}</TableCell>
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
  if (tone === "good") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (tone === "critical") return "border-rose-200 bg-rose-50 text-rose-800";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-sky-200 bg-sky-50 text-sky-800";
}

function toneClassName(tone: "default" | "green" | "amber" | "red") {
  if (tone === "green") return "border-emerald-200 bg-emerald-50/50";
  if (tone === "amber") return "border-amber-200 bg-amber-50/50";
  if (tone === "red") return "border-rose-200 bg-rose-50/50";
  return "border-slate-200";
}

function formatDays(value: number | null) {
  return value === null ? "N/D" : `${value} giorni`;
}

function formatRoas(metrics: Pick<AdsSalesTotals, "revenueCents" | "spendCents" | "roas">) {
  if (metrics.spendCents === 0) return "N/D";
  return `${metrics.roas.toFixed(2)}x`;
}

function TrendChart({ data, metric }: { data: CommercialTrendPoint[]; metric: CommercialTrendMetric }) {
  const meta = TREND_METRICS.find((m) => m.key === metric);
  const isMoney = !!meta?.money;
  const isPercent = !!meta?.percent;
  const labelForMetric = meta?.label ?? "";
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RLineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
          width={isMoney ? 64 : 40}
          allowDecimals={false}
          tickFormatter={(value) => (isMoney ? formatMoneyShort(Number(value)) : isPercent ? `${value}%` : String(value))}
        />
        <RechartsTooltip
          formatter={(value: number | string) => [
            isMoney ? formatMoney(Number(value)) : isPercent ? `${value}%` : String(value),
            labelForMetric,
          ]}
          labelStyle={{ color: "#0f172a", fontWeight: 600 }}
          contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
        />
        <Line type="monotone" dataKey={metric} stroke="#f97316" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 5 }} connectNulls />
      </RLineChart>
    </ResponsiveContainer>
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

function formatMoney(cents: number) {
  if (!cents) return "0 €";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2, useGrouping: "always" }).format(cents / 100);
}
