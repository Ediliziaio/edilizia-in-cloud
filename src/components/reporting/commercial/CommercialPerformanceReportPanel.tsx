import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  FileSignature,
  Link2,
  LineChart,
  ListChecks,
  Percent,
  RefreshCw,
  ShieldAlert,
  Target,
  TrendingDown,
  WalletCards,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { useCommercialPerformanceReport } from "@/hooks/useCommercialPerformanceReport";
import type { CommercialPerformanceReport } from "@/lib/reporting/commercialPerformanceReport";
import { cn } from "@/lib/utils";

export function CommercialPerformanceReportPanel({
  daysBack = 180,
  monthlyTargetCents,
}: {
  daysBack?: number;
  monthlyTargetCents?: number;
}) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const { report, isLoading, error } = useCommercialPerformanceReport({ companyId, daysBack, monthlyTargetCents });

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-5 w-5 text-orange-600" />
              Report commerciale
            </CardTitle>
            <CardDescription>
              Preventivi, forecast, qualità lead, margine e motivi di perdita collegati al CRM.
            </CardDescription>
          </div>
          <Badge variant="outline" className="w-fit border-orange-200 bg-orange-50 text-orange-700">
            Ultimi {daysBack} giorni
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            Dati commerciali parziali: {error}
          </div>
        )}

        <SyncHealthSection sync={report.sync} loading={isLoading} />

        <section className="space-y-3">
          <SectionTitle icon={FileSignature} title="Preventivi e offerte" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricTile label="Emessi" value={String(report.quotes.issued)} loading={isLoading} />
            <MetricTile label="Accettati" value={String(report.quotes.accepted)} loading={isLoading} tone="green" />
            <MetricTile label="Rifiutati" value={String(report.quotes.rejected)} loading={isLoading} tone="red" />
            <MetricTile label="Valore medio" value={formatMoney(report.quotes.averageValueCents)} loading={isLoading} />
            <MetricTile label="Tasso accettazione" value={`${report.quotes.acceptanceRate}%`} loading={isLoading} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <ProcessTile
              label="Tempo app -> preventivo"
              value={formatDays(report.quotes.avgAppointmentToQuoteDays)}
              detail="Media tra appuntamento completato e preventivo creato"
              loading={isLoading}
            />
            <ProcessTile
              label="Tempo preventivo -> vendita"
              value={formatDays(report.quotes.avgQuoteToSaleDays)}
              detail="Media tra preventivo e ordine/opportunità vinta"
              loading={isLoading}
            />
          </div>
        </section>

        <section className="space-y-3">
          <SectionTitle icon={LineChart} title="Forecast pipeline" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricTile label="Pipeline aperta" value={formatMoney(report.forecast.openValueCents)} loading={isLoading} />
            <MetricTile label="Atteso 30g" value={formatMoney(report.forecast.weighted30Cents)} loading={isLoading} />
            <MetricTile label="Atteso 60g" value={formatMoney(report.forecast.weighted60Cents)} loading={isLoading} />
            <MetricTile label="Atteso 90g" value={formatMoney(report.forecast.weighted90Cents)} loading={isLoading} />
            <MetricTile
              label="Rischio obiettivo"
              value={targetRiskLabel(report.forecast.monthlyTargetRisk)}
              loading={isLoading}
              tone={report.forecast.monthlyTargetRisk === "rischio" ? "red" : report.forecast.monthlyTargetRisk === "ok" ? "green" : "amber"}
            />
          </div>
          <div className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-700">
            <span className="font-medium text-slate-950">Opportunità senza prossimo step: </span>
            {isLoading ? <Skeleton className="ml-2 inline-block h-4 w-12 align-middle" /> : report.forecast.openWithoutNextStep}
            {report.forecast.monthlyTargetRisk === "target_non_configurato" && (
              <span className="ml-2 text-slate-500">Configura un target mensile per leggere il rischio obiettivo.</span>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <SectionTitle icon={Target} title="Qualità lead" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricTile label="Lead totali" value={String(report.leadQuality.total)} loading={isLoading} />
            <MetricTile label="Lead buoni" value={String(report.leadQuality.good)} loading={isLoading} tone="green" />
            <MetricTile label="Lead scarsi" value={String(report.leadQuality.poor)} loading={isLoading} tone="red" />
            <MetricTile label="Scartati" value={String(report.leadQuality.disqualified)} loading={isLoading} tone="amber" />
            <MetricTile label="Score medio" value={report.leadQuality.averageScore === null ? "N/D" : String(report.leadQuality.averageScore)} loading={isLoading} />
          </div>
          <SegmentTable rows={report.leadQuality.topSegments} loading={isLoading} />
        </section>

        <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-3">
            <SectionTitle icon={WalletCards} title="Margine reale stimato" />
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <MetricTile label="Margine stimato" value={formatMoney(report.margin.estimatedMarginCents)} loading={isLoading} tone="green" />
              <MetricTile
                label="Margine medio"
                value={report.margin.averageMarginPct === null ? "N/D" : `${report.margin.averageMarginPct}%`}
                loading={isLoading}
              />
              <MetricTile label="Copertura dati" value={`${report.margin.coveragePct}%`} loading={isLoading} tone={report.margin.coveragePct >= 80 ? "green" : "amber"} />
            </div>
            {report.margin.dataQualityWarning && !isLoading && (
              <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {report.margin.dataQualityWarning}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <SectionTitle icon={TrendingDown} title="Motivi di perdita" />
            <LossReasonsTable rows={report.lossReasons} loading={isLoading} />
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

function SyncHealthSection({
  sync,
  loading,
}: {
  sync: CommercialPerformanceReport["sync"];
  loading: boolean;
}) {
  const healthTone = sync.healthScore >= 90 ? "green" : sync.healthScore >= 70 ? "amber" : "red";

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SectionTitle icon={RefreshCw} title="Sincronizzazione CRM" />
        {!loading && (
          <Badge variant="outline" className={cn("w-fit", syncBadgeClassName(sync.healthLabel))}>
            {sync.healthLabel} · {sync.totalIssues} criticità
          </Badge>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Salute dati" value={`${sync.healthScore}/100`} loading={loading} tone={healthTone} />
        <MetricTile label="Preventivi senza opportunità" value={String(sync.quotesWithoutOpportunity)} loading={loading} tone={sync.quotesWithoutOpportunity ? "red" : "green"} />
        <MetricTile label="Vendite accettate senza ordine" value={String(sync.acceptedQuotesWithoutOrder)} loading={loading} tone={sync.acceptedQuotesWithoutOrder ? "red" : "green"} />
        <MetricTile label="Appuntamenti senza contatto" value={String(sync.appointmentsWithoutContact)} loading={loading} tone={sync.appointmentsWithoutContact ? "amber" : "green"} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[0.85fr_1.15fr]">
        <SyncRates sync={sync} loading={loading} />
        <SyncActionList actions={sync.actions} loading={loading} />
      </div>
    </section>
  );
}

function SyncRates({
  sync,
  loading,
}: {
  sync: CommercialPerformanceReport["sync"];
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-36 w-full rounded-lg" />;

  const rows = [
    { label: "Preventivi -> contatti", value: `${sync.quoteContactLinkPct}%` },
    { label: "Preventivi -> opportunità", value: `${sync.quoteOpportunityLinkPct}%` },
    { label: "Preventivi accettati -> ordini", value: `${sync.acceptedSalesLoopPct}%` },
  ];

  return (
    <div className="rounded-lg border bg-slate-50 p-3">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase text-slate-600">
        <Percent className="h-4 w-4" />
        Copertura collegamenti
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 text-sm">
            <span className="text-slate-600">{row.label}</span>
            <span className="font-semibold tabular-nums text-slate-950">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SyncActionList({
  actions,
  loading,
}: {
  actions: CommercialPerformanceReport["sync"]["actions"];
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-36 w-full rounded-lg" />;

  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase text-slate-600">
        <Link2 className="h-4 w-4" />
        Azioni di sincronizzazione
      </div>
      <div className="space-y-2">
        {actions.map((action) => {
          const Icon = action.severity === "good" ? CheckCircle2 : AlertTriangle;
          return (
            <div key={action.key} className={cn("flex gap-2 rounded-lg border p-3 text-sm", syncActionClassName(action.severity))}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">{action.title}</p>
                <p className="mt-1 text-xs opacity-80">{action.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: React.ComponentType<{ className?: string }>; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-slate-600" />
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{title}</h3>
    </div>
  );
}

function MetricTile({
  label,
  value,
  loading,
  tone = "default",
}: {
  label: string;
  value: string;
  loading: boolean;
  tone?: "default" | "green" | "red" | "amber";
}) {
  return (
    <div className={cn("rounded-lg border bg-white p-3", tone === "green" && "border-emerald-200 bg-emerald-50/40", tone === "red" && "border-rose-200 bg-rose-50/40", tone === "amber" && "border-amber-200 bg-amber-50/40")}>
      <div className="mb-2 text-xs font-medium uppercase text-slate-500">{label}</div>
      {loading ? <Skeleton className="h-7 w-24" /> : <p className="text-xl font-semibold text-slate-950">{value}</p>}
    </div>
  );
}

function ProcessTile({
  label,
  value,
  detail,
  loading,
}: {
  label: string;
  value: string;
  detail: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase text-slate-500">
        <ListChecks className="h-4 w-4 text-slate-400" />
        {label}
      </div>
      {loading ? <Skeleton className="h-7 w-24" /> : <p className="text-xl font-semibold text-slate-950">{value}</p>}
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function SegmentTable({
  rows,
  loading,
}: {
  rows: Array<{ label: string; leads: number; good: number; poor: number; averageScore: number | null }>;
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-28 w-full rounded-lg" />;
  if (!rows.length) {
    return <div className="rounded-lg border bg-white p-4 text-sm text-slate-600">Nessun lead con score ICP/AI nel periodo.</div>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Campagna / zona / sorgente</TableHead>
            <TableHead className="text-right">Lead</TableHead>
            <TableHead className="text-right">Buoni</TableHead>
            <TableHead className="text-right">Scarsi</TableHead>
            <TableHead className="text-right">Score medio</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.label}>
              <TableCell className="font-medium">{row.label}</TableCell>
              <TableCell className="text-right tabular-nums">{row.leads}</TableCell>
              <TableCell className="text-right tabular-nums text-emerald-700">{row.good}</TableCell>
              <TableCell className="text-right tabular-nums text-rose-700">{row.poor}</TableCell>
              <TableCell className="text-right tabular-nums">{row.averageScore ?? "N/D"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function LossReasonsTable({
  rows,
  loading,
}: {
  rows: Array<{ reason: string; count: number; valueCents: number }>;
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-52 w-full rounded-lg" />;
  if (!rows.length) {
    return <div className="rounded-lg border bg-white p-4 text-sm text-slate-600">Nessun motivo di perdita registrato nel periodo.</div>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Motivo</TableHead>
            <TableHead className="text-right">Casi</TableHead>
            <TableHead className="text-right">Valore perso</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.reason}>
              <TableCell className="capitalize">{row.reason}</TableCell>
              <TableCell className="text-right tabular-nums">{row.count}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(row.valueCents)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function syncBadgeClassName(label: CommercialPerformanceReport["sync"]["healthLabel"]) {
  if (label === "Allineato") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (label === "Da controllare") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function syncActionClassName(severity: CommercialPerformanceReport["sync"]["actions"][number]["severity"]) {
  if (severity === "good") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (severity === "critical") return "border-rose-200 bg-rose-50 text-rose-800";
  if (severity === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-sky-200 bg-sky-50 text-sky-800";
}

function targetRiskLabel(value: "ok" | "attenzione" | "rischio" | "target_non_configurato") {
  if (value === "ok") return "OK";
  if (value === "attenzione") return "Attenzione";
  if (value === "rischio") return "Rischio";
  return "Target mancante";
}

function formatDays(value: number | null) {
  return value === null ? "N/D" : `${value} giorni`;
}

function formatMoney(cents: number) {
  if (!cents) return "0 EUR";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2, useGrouping: "always" }).format(cents / 100);
}
