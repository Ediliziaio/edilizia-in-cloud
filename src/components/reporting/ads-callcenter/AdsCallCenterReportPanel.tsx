import { AlertTriangle, Clock, PhoneCall, Target, Timer, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { useAdsCallCenterReport } from "@/hooks/useAdsCallCenterReport";
import { cn } from "@/lib/utils";
import type {
  AdsCallCenterPlatform,
  AdsCallCenterProviderFilter,
} from "@/lib/reporting/adsCallCenterReport";

const PROVIDER_LABEL: Record<AdsCallCenterProviderFilter, string> = {
  all: "Meta + Google",
  meta: "Meta Ads",
  google: "Google Ads",
};

export function AdsCallCenterReportPanel({
  provider = "all",
  daysBack = 180,
  compact = false,
  className,
}: {
  provider?: AdsCallCenterProviderFilter;
  daysBack?: number;
  compact?: boolean;
  className?: string;
}) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const { rows, totals, isLoading, error } = useAdsCallCenterReport({ companyId, provider, daysBack });
  const visibleRows = compact ? rows.slice(0, 6) : rows;

  return (
    <Card className={cn("border-sky-100 bg-sky-50/20", className)}>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <PhoneCall className="h-5 w-5 text-sky-600" />
              Lead ads e chiamate
            </CardTitle>
            <CardDescription>
              Verifica se i lead {PROVIDER_LABEL[provider]} vengono chiamati, in quanto tempo e con che esito.
            </CardDescription>
          </div>
          <Badge variant="outline" className="w-fit border-sky-200 bg-white text-sky-700">
            Ultimi {daysBack} giorni
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            Dati chiamate parziali: {error}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile icon={Users} label="Lead ads" value={String(totals.leads)} loading={isLoading} />
          <MetricTile icon={PhoneCall} label="Lead chiamati" value={`${totals.calledLeads} (${formatPct(totals.calledRatePct)})`} loading={isLoading} />
          <MetricTile icon={Target} label="Risposte" value={`${totals.answeredLeads} (${formatPct(totals.contactRatePct)})`} loading={isLoading} />
          <MetricTile icon={Clock} label="Speed to lead" value={formatMinutes(totals.avgSpeedToLeadMin)} loading={isLoading} />
          {!compact && (
            <>
              <MetricTile icon={PhoneCall} label="Tentativi / lead" value={formatNumber(totals.attemptsPerLead)} loading={isLoading} />
              <MetricTile icon={Timer} label="Durata media risposta" value={formatMinutes(totals.avgAnsweredDurationMin)} loading={isLoading} />
              <MetricTile icon={Target} label="Appuntamenti" value={String(totals.appointments)} loading={isLoading} />
              <MetricTile icon={Target} label="% App. su lead" value={formatPct(totals.appointmentRatePct)} loading={isLoading} />
            </>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="rounded-lg border bg-white p-4 text-sm text-slate-600">
            Nessuna chiamata attribuita ai lead ads nel periodo. Quando i contatti Meta o Google hanno ID campagna,
            UTM o GCLID e vengono chiamati dal call center, qui trovi speed to lead, risposte e appuntamenti.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Piattaforma</TableHead>
                  <TableHead>Campagna / sorgente</TableHead>
                  <TableHead className="text-right">Lead</TableHead>
                  <TableHead className="text-right">Chiamati</TableHead>
                  <TableHead className="text-right">Risposte</TableHead>
                  <TableHead className="text-right">% risposta</TableHead>
                  <TableHead className="text-right">Tentativi</TableHead>
                  <TableHead className="text-right">Speed</TableHead>
                  <TableHead className="text-right">App.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <PlatformBadge platform={row.platform} />
                    </TableCell>
                    <TableCell className="min-w-[220px]">
                      <div className="font-medium text-slate-900">{row.campaignName}</div>
                      <div className="text-xs text-slate-500">{row.sourceLabel}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.metrics.leads}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.metrics.calledLeads}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{row.metrics.answeredLeads}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPct(row.metrics.contactRatePct)}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.metrics.totalCalls}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMinutes(row.metrics.avgSpeedToLeadMin)}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.metrics.appointments}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase text-slate-500">
        <Icon className="h-4 w-4 text-slate-400" />
        {label}
      </div>
      {loading ? <Skeleton className="h-7 w-24" /> : <p className="text-xl font-semibold text-slate-950">{value}</p>}
    </div>
  );
}

function PlatformBadge({ platform }: { platform: AdsCallCenterPlatform }) {
  if (platform === "google") {
    return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Google</Badge>;
  }
  return <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100">Meta</Badge>;
}

function formatMinutes(value: number) {
  if (!value) return "0 min";
  if (value < 60) return `${formatNumber(value)} min`;
  return `${formatNumber(value / 60)} h`;
}

function formatPct(value: number) {
  return `${formatNumber(value)}%`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("it-IT", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value);
}
