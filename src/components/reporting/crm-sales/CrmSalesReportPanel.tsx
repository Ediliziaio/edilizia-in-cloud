import type { ComponentType, ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  FileSignature,
  LineChart,
  ShieldAlert,
  Target,
  TrendingUp,
  Trophy,
  Users,
  WalletCards,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { useAdsSalesReport } from "@/hooks/useAdsSalesReport";
import { useCommercialPerformanceReport } from "@/hooks/useCommercialPerformanceReport";
import type { CommercialPerformanceReport } from "@/lib/reporting/commercialPerformanceReport";
import { AdsSalesReportPanel } from "@/components/reporting/ads-sales/AdsSalesReportPanel";
import { cn } from "@/lib/utils";

type PriorityTone = "critical" | "warning" | "good" | "info";

type PriorityAction = {
  title: string;
  detail: string;
  tone: PriorityTone;
};

type AdsSalesTotals = ReturnType<typeof useAdsSalesReport>["totals"];

export function CrmSalesReportPanel({
  daysBack = 180,
  monthlyTargetCents,
}: {
  daysBack?: number;
  monthlyTargetCents?: number;
}) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const commercial = useCommercialPerformanceReport({ companyId, daysBack, monthlyTargetCents });
  const ads = useAdsSalesReport({ companyId, daysBack, provider: "all" });
  const report = commercial.report;
  const loading = commercial.isLoading || ads.isLoading;
  const priorities = buildPriorityActions(report, ads.totals);
  const errors = [commercial.error, ads.error].filter(Boolean);

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <Badge variant="outline" className="mb-3 border-orange-200 bg-orange-50 text-orange-700">
              Ultimi {daysBack} giorni
            </Badge>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">CRM e vendite, senza rumore</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Prima capisci se il CRM è misurabile, poi guardi pipeline, preventivi e campagne che generano vendite.
              I dettagli restano sotto, ma la decisione è leggibile subito.
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

function formatMoney(cents: number) {
  if (!cents) return "0 €";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
