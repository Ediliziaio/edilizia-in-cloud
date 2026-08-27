import {
  AlertTriangle,
  CalendarCheck,
  Euro,
  Info,
  Loader2,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAdsCrmAttribution, type AdsCrmAttributionCampaign } from "@/hooks/useAdsCrmAttribution";
import type { AdsOptimizationSeverity } from "@/lib/ads/crmAttribution";

export function AdsCrmAttributionPanel({
  companyId,
  campaign,
}: {
  companyId?: string;
  campaign: AdsCrmAttributionCampaign;
}) {
  const { metrics, recommendations, attributionActive, qualityWarnings, source, isLoading } =
    useAdsCrmAttribution({ companyId, campaign });

  const spendSourceLabel: Record<typeof source, string> = {
    meta_insights: "Meta Insights",
    google_ads_stats: "Google Ads stats",
    campaign_costs: "Costi campagna",
    campaign_snapshot: "Snapshot campagna",
    none: "Spesa assente",
  };

  return (
    <Card className="border-emerald-100 bg-emerald-50/20">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              KPI CRM e conversioni
            </CardTitle>
            <CardDescription>
              Lead, appuntamenti, vendite e valore letti dal CRM esistente.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className={
                attributionActive
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }
            >
              {attributionActive ? "Attribution attiva" : "Attribution da completare"}
            </Badge>
            <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
              Spesa: {spendSourceLabel[source]}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 rounded-lg border bg-white p-3 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Calcolo KPI CRM...
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricTile icon={Users} label="Lead CRM" value={String(metrics.leads)} detail={`CPL ${formatMoney(metrics.costPerLeadCents)}`} />
            <MetricTile icon={Target} label="Opportunità" value={String(metrics.opportunities)} detail={`${formatPct(metrics.leadToOpportunityRatePct)} dei lead`} />
            <MetricTile icon={CalendarCheck} label="Appuntamenti" value={String(metrics.appointments)} detail={`Costo ${formatMoney(metrics.costPerAppointmentCents)}`} />
            <MetricTile icon={Trophy} label="Vendite" value={String(metrics.won)} detail={`CAC ${formatMoney(metrics.costPerSaleCents)}`} />
            <MetricTile icon={Euro} label="Valore venduto" value={formatMoney(metrics.revenueCents)} detail={`ROAS ${metrics.roas.toFixed(2)}x`} />
            <MetricTile icon={TrendingUp} label="Spesa rilevata" value={formatMoney(metrics.spendCents)} detail={`Costo/opportunità ${formatMoney(metrics.costPerOpportunityCents)}`} />
            <MetricTile icon={CalendarCheck} label="App. → vendita" value={formatPct(metrics.appointmentToSaleRatePct)} detail="Qualità commerciale" />
            <MetricTile icon={Target} label="Opp. → vendita" value={formatPct(metrics.opportunityToSaleRatePct)} detail="Qualità pipeline" />
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-lg border bg-white p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Info className="h-4 w-4 text-slate-500" />
              Decisione dopo 72 ore
            </div>
            <div className="space-y-2">
              {recommendations.map((recommendation) => (
                <div
                  key={`${recommendation.kind}-${recommendation.title}`}
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm",
                    recommendationTone(recommendation.severity),
                  )}
                >
                  <p className="font-semibold">{recommendation.title}</p>
                  <p className="mt-1 text-xs leading-relaxed opacity-80">{recommendation.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border bg-white p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Qualità tracking
            </div>
            {qualityWarnings.length > 0 ? (
              <ul className="space-y-2 text-xs leading-relaxed text-slate-600">
                {qualityWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs leading-relaxed text-emerald-700">
                Campagna, CRM e spesa sono collegati abbastanza per leggere CPL, costo appuntamento e costo vendita.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase text-slate-500">
        <Icon className="h-4 w-4 text-slate-400" />
        {label}
      </div>
      <p className="text-xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function recommendationTone(severity: AdsOptimizationSeverity) {
  if (severity === "critical") return "border-red-200 bg-red-50 text-red-800";
  if (severity === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  if (severity === "good") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function formatMoney(cents: number) {
  if (!cents) return "0 EUR";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2, useGrouping: "always" }).format(cents / 100);
}

function formatPct(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}
