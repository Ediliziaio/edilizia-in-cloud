/**
 * Pannello KPI con 4 card principali: Spesa, CTR, Conversioni, CPC.
 * Mostra skeleton loader durante il caricamento e empty state se nessun dato.
 *
 * @param kpis - KPI aggregati calcolati dall'hook
 * @param isLoading - Stato di caricamento
 */
import { Euro, MousePointerClick, Target, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatCurrency,
  formatPercent,
  formatNumber,
} from "@/lib/google-ads/formatters";
import type { GoogleAdsKPIs } from "@/types/google-ads";

interface GoogleAdsOverviewProps {
  kpis: GoogleAdsKPIs;
  isLoading: boolean;
}

interface KpiCardDef {
  label: string;
  icon: React.ElementType;
  value: string;
  sub: string;
  color: string;
}

function buildCards(kpis: GoogleAdsKPIs): KpiCardDef[] {
  return [
    {
      label: "Spesa Totale",
      icon: Euro,
      value: formatCurrency(kpis.totalSpend),
      sub: `${formatNumber(kpis.totalClicks)} click totali`,
      color: "text-emerald-600",
    },
    {
      label: "CTR Medio",
      icon: MousePointerClick,
      value: formatPercent(kpis.avgCTR),
      sub: `${formatNumber(kpis.totalImpressions)} impressioni`,
      color: "text-blue-600",
    },
    {
      label: "Conversioni",
      icon: Target,
      value: formatNumber(kpis.totalConversions),
      sub: `da ${formatNumber(kpis.totalClicks)} click`,
      color: "text-violet-600",
    },
    {
      label: "CPC Medio",
      icon: TrendingUp,
      value: formatCurrency(kpis.avgCPC),
      sub: "costo per click",
      color: "text-orange-600",
    },
  ];
}

export function GoogleAdsOverview({ kpis, isLoading }: GoogleAdsOverviewProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = buildCards(kpis);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  {card.label}
                </span>
                <Icon className={`h-4 w-4 ${card.color}`} />
              </div>
              <div className="text-2xl font-bold tabular-nums">{card.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{card.sub}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
