import { Building2, DollarSign, TrendingUp, AlertTriangle, Gift, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/formatters";
import { getAdminRevenueBreakdown } from "@/lib/adminRevenue";
import { cn } from "@/lib/utils";

interface KPIStripProps {
  companies: Array<{
    id: string;
    status: string;
    payment_method?: string | null;
    stripe_customer_id?: string | null;
    stripe_subscription_status?: string | null;
    is_platform_admin_company?: boolean | null;
    subscription_plans: { price_monthly: number; price_yearly?: number | null } | null;
  }>;
  healthData: Record<string, { score: number; health: string }>;
  /** True mentre i dati caricano: mostra skeleton invece di "0" finti. */
  isLoading?: boolean;
  /** Quale KPI è attualmente highlighted (matcha il filtro applicato) */
  activeKpi?: "active" | "paying" | "mrr" | "excluded" | "atRisk" | null;
  /** Callback al click su una KPI: applica il filtro corrispondente */
  onKpiClick?: (kpi: "active" | "paying" | "excluded" | "atRisk") => void;
}

/**
 * KPI strip cliccabile: ogni card è un filtro one-click.
 * - Accessi Attivi → status=active
 * - Aziende Paganti → revenue=paying
 * - MRR Pagante → revenue=paying (sinonimo, stessa filtraggio)
 * - MRR Escluso → revenue=complimentary (regalate)
 * - A Rischio → health=at_risk
 *
 * Active state: ring-2 + bg accentato. Hover: lift + shadow.
 */
export function CompaniesKPIStrip({ companies, healthData, activeKpi = null, onKpiClick, isLoading = false }: KPIStripProps) {
  // Durante il load i KPI mostravano "0"/"0,00 €" come fossero dati reali —
  // skeleton finché i numeri non sono veri.
  if (isLoading && companies.length === 0) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-muted" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-20 animate-pulse rounded bg-muted" />
              <div className="h-5 w-14 animate-pulse rounded bg-muted" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  const revenue = getAdminRevenueBreakdown(companies);
  const activeCount = revenue.accessActiveCompanies;
  const payingCount = revenue.payingCompanies;
  const totalMRR = revenue.mrr;
  const excludedMRR = revenue.excludedMrr;
  const compedCount = revenue.nonPayingActiveCompanies;

  const atRiskCount = companies.filter((c) => {
    const h = healthData[c.id];
    return h && (h.health === "at_risk" || h.health === "critical");
  }).length;

  const kpis: Array<{
    key: "active" | "paying" | "mrr" | "excluded" | "atRisk";
    label: string;
    value: string;
    sub?: string;
    icon: typeof Building2;
    accent: string;
    bg: string;
    ring: string;
    onClick?: () => void;
  }> = [
    {
      key: "active",
      label: "Accessi Attivi",
      value: activeCount.toLocaleString("it-IT"),
      sub: `${revenue.totalCompanies} totali`,
      icon: Building2,
      accent: "text-primary",
      bg: "bg-primary/10",
      ring: "ring-primary/40",
      onClick: () => onKpiClick?.("active"),
    },
    {
      key: "paying",
      label: "Aziende Paganti",
      value: payingCount.toLocaleString("it-IT"),
      sub: activeCount > 0 ? `${Math.round((payingCount / activeCount) * 100)}% degli attivi` : undefined,
      icon: TrendingUp,
      accent: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-500/10",
      ring: "ring-blue-500/40",
      onClick: () => onKpiClick?.("paying"),
    },
    {
      key: "mrr",
      label: "MRR Pagante",
      value: formatCurrency(totalMRR),
      sub: payingCount > 0 ? `media ${formatCurrency(totalMRR / payingCount)}/azienda` : "—",
      icon: DollarSign,
      accent: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/10",
      ring: "ring-emerald-500/40",
      onClick: () => onKpiClick?.("paying"),
    },
    {
      key: "excluded",
      label: "MRR Escluso",
      value: formatCurrency(excludedMRR),
      sub: compedCount > 0 ? `${compedCount} regalate` : "nessuna comp",
      icon: Gift,
      accent: excludedMRR > 0 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground",
      bg: excludedMRR > 0 ? "bg-orange-500/10" : "bg-muted/40",
      ring: "ring-orange-500/40",
      onClick: () => onKpiClick?.("excluded"),
    },
    {
      key: "atRisk",
      label: "A Rischio",
      value: atRiskCount.toLocaleString("it-IT"),
      sub: atRiskCount > 0 ? "richiedono attenzione" : "tutto sotto controllo",
      icon: AlertTriangle,
      accent: atRiskCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
      bg: atRiskCount > 0 ? "bg-amber-500/10" : "bg-muted/40",
      ring: "ring-amber-500/40",
      onClick: () => onKpiClick?.("atRisk"),
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {kpis.map((kpi) => {
        const isActive = activeKpi === kpi.key;
        const isClickable = !!kpi.onClick;
        return (
          <Card
            key={kpi.key}
            className={cn(
              "p-4 flex items-center gap-3 transition-all duration-200",
              isClickable && "cursor-pointer hover:shadow-md hover:-translate-y-0.5",
              isActive && `ring-2 ${kpi.ring} shadow-sm`,
              !isActive && isClickable && "hover:ring-1 hover:ring-border"
            )}
            onClick={kpi.onClick}
            role={isClickable ? "button" : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onKeyDown={(e) => {
              if (isClickable && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                kpi.onClick?.();
              }
            }}
            aria-pressed={isClickable ? isActive : undefined}
            aria-label={`${kpi.label}: ${kpi.value}${kpi.sub ? `. ${kpi.sub}` : ""}${isClickable ? ". Click per filtrare" : ""}`}
          >
            <div className={`rounded-lg p-2.5 shrink-0 ${kpi.bg}`}>
              <kpi.icon className={`h-5 w-5 ${kpi.accent}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-xs text-muted-foreground font-medium truncate">{kpi.label}</p>
                {isActive && (
                  <Badge variant="secondary" className="h-4 px-1 text-[9px] gap-0.5 shrink-0">
                    <X className="h-2.5 w-2.5" /> attivo
                  </Badge>
                )}
              </div>
              <p className={`text-xl font-bold tracking-tight truncate ${kpi.accent}`}>{kpi.value}</p>
              {kpi.sub && (
                <p className="text-[10px] text-muted-foreground/80 truncate" title={kpi.sub}>{kpi.sub}</p>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
