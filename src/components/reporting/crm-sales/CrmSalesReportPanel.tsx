import type { ComponentType, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Calendar,
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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { useAdsSalesReport } from "@/hooks/useAdsSalesReport";
import { useCommercialPerformanceReport } from "@/hooks/useCommercialPerformanceReport";
import { isOpenOpportunity, type CommercialPerformanceReport } from "@/lib/reporting/commercialPerformanceReport";
import { AdsSalesReportPanel } from "@/components/reporting/ads-sales/AdsSalesReportPanel";
import {
  buildCommercialTrend,
  buildPeriodComparison,
  TREND_METRICS,
  type CommercialTrendMetric,
  type CommercialTrendPoint,
  type PeriodComparisonMetric,
} from "@/lib/reporting/commercialTrend";
import {
  buildFunnelConversion,
  buildPipelineAging,
  buildSalesEfficiency,
  buildSourceBreakdown,
  type SourceBreakdownRow,
} from "@/lib/reporting/commercialAnalytics";
import { downloadFile, escapeCsvCell } from "@/lib/csvExport";
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
  monthlyTargetCents: initialMonthlyTargetCents,
}: {
  daysBack?: number;
  monthlyTargetCents?: number;
}) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const [daysBack, setDaysBack] = useState(initialDaysBack);
  const [monthlyTargetCents, setMonthlyTargetCents] = useState<number | undefined>(initialMonthlyTargetCents);
  const [targetEuro, setTargetEuro] = useState("");

  // Obiettivo mensile: persistito per azienda in localStorage (niente migration DB).
  const targetKey = companyId ? `crm-report-target-${companyId}` : null;
  useEffect(() => {
    if (!targetKey) return;
    const saved = localStorage.getItem(targetKey);
    setMonthlyTargetCents(saved && saved !== "" ? Number(saved) || undefined : undefined);
  }, [targetKey]);
  useEffect(() => {
    setTargetEuro(monthlyTargetCents != null ? String(Math.round(monthlyTargetCents / 100)) : "");
  }, [monthlyTargetCents]);
  const commitTarget = (raw: string) => {
    const parsed = raw.trim() === "" ? undefined : Math.round(parseFloat(raw.replace(",", ".")) * 100);
    const next = Number.isFinite(parsed as number) && (parsed as number) > 0 ? parsed : undefined;
    setMonthlyTargetCents(next);
    if (targetKey) localStorage.setItem(targetKey, next == null ? "" : String(next));
  };

  const commercial = useCommercialPerformanceReport({ companyId, daysBack, monthlyTargetCents });
  const comparison = useCommercialPerformanceReport({ companyId, daysBack: daysBack * 2 });
  const ads = useAdsSalesReport({ companyId, daysBack, provider: "all" });
  const report = commercial.report;
  const loading = commercial.isLoading || ads.isLoading;
  const priorities = buildPriorityActions(report, ads.totals);
  const errors = [commercial.error, ads.error].filter(Boolean);

  const trend = useMemo(
    () =>
      buildCommercialTrend(
        { contacts: commercial.rows.contacts, quotes: commercial.rows.quotes, orders: commercial.rows.orders },
        daysBack,
      ),
    [commercial.rows, daysBack],
  );
  const [trendMetric, setTrendMetric] = useState<CommercialTrendMetric>("fatturatoCents");
  const periodCompare = useMemo(
    () =>
      buildPeriodComparison(
        { contacts: comparison.rows.contacts, quotes: comparison.rows.quotes, orders: comparison.rows.orders },
        daysBack,
      ),
    [comparison.rows, daysBack],
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

  const handleExport = () => {
    const rowsCsv: Array<[string, string, string]> = [
      ["Sezione", "Metrica", "Valore"],
      ["Periodo", "Giorni analizzati", String(daysBack)],
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
    downloadFile(`﻿${csv}`, `report-crm-vendite-${daysBack}gg.csv`, "text/csv;charset=utf-8;");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-slate-400" />
          <Select value={String(daysBack)} onValueChange={(v) => setDaysBack(Number(v))}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Ultimi 30 giorni</SelectItem>
              <SelectItem value="90">Ultimi 90 giorni</SelectItem>
              <SelectItem value="180">Ultimi 180 giorni</SelectItem>
              <SelectItem value="365">Ultimo anno</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-slate-400" />
          <Input
            type="number"
            inputMode="decimal"
            placeholder="Obiettivo mensile €"
            aria-label="Obiettivo di fatturato mensile in euro"
            value={targetEuro}
            onChange={(e) => setTargetEuro(e.target.value)}
            onBlur={(e) => commitTarget(e.target.value)}
            className="h-9 w-[180px]"
          />
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={handleExport} disabled={loading}>
            <Download className="h-4 w-4" />
            Esporta CSV
          </Button>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <Badge variant="outline" className="mb-3 border-orange-200 bg-orange-50 text-orange-700">
              Ultimi {daysBack} giorni
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
        <SectionHeader
          icon={TrendingUp}
          title="Rispetto al periodo precedente"
          description={`Confronto con i ${daysBack} giorni precedenti, a parità di durata.`}
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {periodCompare.map((m) => (
            <ComparisonCard key={m.key} metric={m} loading={comparison.isLoading} />
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <SectionHeader icon={Target} title="Cosa guardare prima" description="Tre letture rapide prima di aprire i dettagli." />
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
              detail={`${formatMoney(report.forecast.weighted30Cents)} forecast 30g · rischio ${targetRiskLabel(report.forecast.monthlyTargetRisk)}`}
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

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <SectionHeader icon={TrendingUp} title="Funnel commerciale" description="Dal lead pagato al fatturato, in una sola riga." />
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <FunnelStep label="Lead paid" value={String(ads.totals.leads)} detail="Meta + Google" loading={ads.isLoading} />
          <FunnelStep label="Appuntamenti" value={String(ads.totals.appointments)} detail={`CPA ${formatCostMetric(ads.totals.costPerAppointmentCents, ads.totals.spendCents, ads.totals.appointments)}`} loading={ads.isLoading} />
          <FunnelStep label="Preventivi" value={String(report.quotes.issued)} detail={`${report.quotes.acceptanceRate}% accettazione`} loading={commercial.isLoading} />
          <FunnelStep label="Vendite" value={String(ads.totals.won)} detail={`Costo ${formatCostMetric(ads.totals.costPerSaleCents, ads.totals.spendCents, ads.totals.won)}`} loading={ads.isLoading} />
          <FunnelStep label="Fatturato" value={formatMoney(ads.totals.revenueCents)} detail={`ROAS ${formatRoas(ads.totals)}`} loading={ads.isLoading} highlight />
        </div>
        <p className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Conversioni ed efficienza</p>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <MiniMetric label="Lead → 1° appunt." value={pctLabel(funnelConv.convLeadAppt)} loading={commercial.isLoading} />
          <MiniMetric label="1° appunt. → Prev." value={pctLabel(funnelConv.convApptQuote)} loading={commercial.isLoading} />
          <MiniMetric label="Prev. → Vendita" value={pctLabel(funnelConv.convQuoteWon)} loading={commercial.isLoading} tone="green" />
          <MiniMetric label="Sales velocity" value={`${formatMoney(salesEff.velocityCentsPerDay)}/g`} loading={commercial.isLoading} />
          <MiniMetric
            label="Copertura pipeline"
            value={salesEff.coverageRatio == null ? "N/D" : `${salesEff.coverageRatio}x`}
            loading={commercial.isLoading}
            tone={salesEff.coverageRatio != null && salesEff.coverageRatio >= 3 ? "green" : "amber"}
          />
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
          <SectionHeader icon={TrendingUp} title="Andamento nel tempo" description={daysBack > 120 ? "Aggregato per mese." : "Aggregato per settimana."} />
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

      <section className="space-y-4">
        <SectionHeader icon={BarChart3} title="Dettaglio operativo" description="Qui scendi sui numeri quando una priorità richiede analisi." />
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
            <SourceBreakdownTable rows={sourceRows} loading={commercial.isLoading} />
          </DetailPanel>
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader icon={Trophy} title="Canali paid che generano vendite" description="Meta e Google restano separati: lead, appuntamenti, vendite e fatturato non vengono mischiati." />
        <AdsSalesReportPanel provider="all" daysBack={daysBack} compact className="border-slate-200 bg-white shadow-sm" />
      </section>
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

function FunnelStep({
  label,
  value,
  detail,
  loading,
  highlight = false,
}: {
  label: string;
  value: string;
  detail: string;
  loading: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={cn("relative rounded-lg border bg-slate-50 p-3", highlight && "border-emerald-200 bg-emerald-50")}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
        <ArrowRight className="hidden h-4 w-4 text-slate-300 md:block" />
      </div>
      {loading ? (
        <>
          <Skeleton className="h-8 w-24" />
          <Skeleton className="mt-2 h-4 w-24" />
        </>
      ) : (
        <>
          <p className="text-xl font-semibold text-slate-950">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </>
      )}
    </div>
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

function ComparisonCard({ metric, loading }: { metric: PeriodComparisonMetric; loading: boolean }) {
  const value = metric.money ? formatMoney(metric.current) : String(metric.current);
  const delta = metric.deltaPct;
  const up = delta != null && delta >= 0;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase text-slate-500">{metric.label}</p>
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
              {Math.abs(delta)}% vs precedente
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
              <TableCell className="font-medium">{row.label}</TableCell>
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
        <div key={row.reason} className="flex items-center justify-between gap-3 rounded-lg border bg-slate-50 px-3 py-2 text-sm">
          <div>
            <p className="font-medium capitalize text-slate-900">{row.reason}</p>
            <p className="text-xs text-slate-500">{row.count} casi</p>
          </div>
          <p className="font-semibold tabular-nums text-slate-950">{formatMoney(row.valueCents)}</p>
        </div>
      ))}
    </div>
  );
}

function SourceBreakdownTable({ rows, loading }: { rows: SourceBreakdownRow[]; loading: boolean }) {
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
            <TableRow key={row.source}>
              <TableCell className="font-medium capitalize">{row.source}</TableCell>
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

function pctLabel(value: number | null) {
  return value == null ? "N/D" : `${value}%`;
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

function targetRiskLabel(value: "ok" | "attenzione" | "rischio" | "target_non_configurato") {
  if (value === "ok") return "OK";
  if (value === "attenzione") return "attenzione";
  if (value === "rischio") return "rischio";
  return "target mancante";
}

function formatDays(value: number | null) {
  return value === null ? "N/D" : `${value} giorni`;
}

function formatCostMetric(cents: number, spendCents: number, denominator: number) {
  if (denominator > 0 && spendCents === 0) return "N/D";
  return formatMoney(cents);
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
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
