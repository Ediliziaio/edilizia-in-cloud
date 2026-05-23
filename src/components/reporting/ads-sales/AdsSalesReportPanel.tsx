import {
  AlertTriangle,
  CalendarCheck,
  Euro,
  Target,
  Trophy,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { useAdsSalesReport } from "@/hooks/useAdsSalesReport";
import { cn } from "@/lib/utils";
import type { AdsSalesPlatform, AdsSalesProviderFilter } from "@/lib/reporting/adsSalesReport";

const PROVIDER_LABEL: Record<AdsSalesProviderFilter, string> = {
  all: "Meta + Google",
  meta: "Meta Ads",
  google: "Google Ads",
};

export function AdsSalesReportPanel({
  provider = "all",
  daysBack = 180,
  compact = false,
  className,
}: {
  provider?: AdsSalesProviderFilter;
  daysBack?: number;
  compact?: boolean;
  className?: string;
}) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const { rows, totals, isLoading, error } = useAdsSalesReport({ companyId, provider, daysBack });
  const visibleRows = compact ? rows.slice(0, 6) : rows;

  return (
    <Card className={cn("border-emerald-100 bg-emerald-50/20", className)}>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Trophy className="h-5 w-5 text-emerald-600" />
              CRM e vendite attribuite
            </CardTitle>
            <CardDescription>
              Fatturato generato, appuntamenti e vendite ricondotti alle campagne {PROVIDER_LABEL[provider]}.
            </CardDescription>
          </div>
          <Badge variant="outline" className="w-fit border-emerald-200 bg-white text-emerald-700">
            Ultimi {daysBack} giorni
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            Dati CRM parziali: {error}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile icon={Euro} label="Fatturato generato" value={formatMoney(totals.revenueCents)} loading={isLoading} />
          <MetricTile icon={Trophy} label="Vendite vinte" value={String(totals.won)} loading={isLoading} />
          <MetricTile icon={CalendarCheck} label="Costo appuntamento" value={formatMoney(totals.costPerAppointmentCents)} loading={isLoading} />
          <MetricTile icon={Target} label="Costo per vendita" value={formatMoney(totals.costPerSaleCents)} loading={isLoading} />
          {!compact && (
            <>
              <MetricTile icon={Users} label="Lead CRM" value={String(totals.leads)} loading={isLoading} />
              <MetricTile icon={Target} label="Opportunità" value={String(totals.opportunities)} loading={isLoading} />
              <MetricTile icon={CalendarCheck} label="Appuntamenti" value={String(totals.appointments)} loading={isLoading} />
              <MetricTile icon={Euro} label="ROAS vendite" value={`${totals.roas.toFixed(2)}x`} loading={isLoading} />
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
            Nessuna vendita attribuita nel periodo. Quando i contatti hanno UTM, ID Meta, GCLID o campagna Google,
            qui compaiono costo appuntamento, costo vendita e valore venduto.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Piattaforma</TableHead>
                  <TableHead>Campagna / sorgente</TableHead>
                  <TableHead className="text-right">Lead</TableHead>
                  <TableHead className="text-right">App.</TableHead>
                  <TableHead className="text-right">Vendite</TableHead>
                  <TableHead className="text-right">Spesa</TableHead>
                  <TableHead className="text-right">Fatturato</TableHead>
                  <TableHead className="text-right">CPL</TableHead>
                  <TableHead className="text-right">Costo vendita</TableHead>
                  <TableHead className="text-right">ROAS</TableHead>
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
                    <TableCell className="text-right tabular-nums">{row.metrics.appointments}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{row.metrics.won}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(row.metrics.spendCents)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-emerald-700">
                      {formatMoney(row.metrics.revenueCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(row.metrics.costPerLeadCents)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(row.metrics.costPerSaleCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.metrics.roas.toFixed(2)}x</TableCell>
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

function PlatformBadge({ platform }: { platform: AdsSalesPlatform }) {
  if (platform === "google") {
    return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Google</Badge>;
  }
  return <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100">Meta</Badge>;
}

function formatMoney(cents: number) {
  if (!cents) return "0 EUR";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
