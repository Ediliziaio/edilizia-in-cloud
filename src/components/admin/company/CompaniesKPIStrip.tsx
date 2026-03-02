import { Building2, DollarSign, TrendingUp, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";

interface KPIStripProps {
  companies: Array<{
    id: string;
    status: string;
    subscription_plans: { price_monthly: number } | null;
  }>;
  healthData: Record<string, { score: number; health: string }>;
}

export function CompaniesKPIStrip({ companies, healthData }: KPIStripProps) {
  const activeCount = companies.filter((c) => c.status === "active").length;
  const totalMRR = companies.reduce((sum, c) => {
    if (c.status === "active" && c.subscription_plans?.price_monthly) {
      return sum + c.subscription_plans.price_monthly;
    }
    return sum;
  }, 0);

  const trialConvertible = companies.filter((c) =>
    ["active", "trial", "expired"].includes(c.status)
  ).length;
  const conversionRate = trialConvertible > 0 ? Math.round((activeCount / trialConvertible) * 100) : 0;

  const atRiskCount = companies.filter((c) => {
    const h = healthData[c.id];
    return h && (h.health === "at_risk" || h.health === "critical");
  }).length;

  const kpis = [
    {
      label: "Aziende Attive",
      value: activeCount.toString(),
      icon: Building2,
      accent: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "MRR Totale",
      value: formatCurrency(totalMRR),
      icon: DollarSign,
      accent: "text-emerald-600",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Conversione Trial",
      value: `${conversionRate}%`,
      icon: TrendingUp,
      accent: "text-blue-600",
      bg: "bg-blue-500/10",
    },
    {
      label: "A Rischio",
      value: atRiskCount.toString(),
      icon: AlertTriangle,
      accent: atRiskCount > 0 ? "text-amber-600" : "text-muted-foreground",
      bg: atRiskCount > 0 ? "bg-amber-500/10" : "bg-muted/50",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className="p-4 flex items-center gap-3">
          <div className={`rounded-lg p-2.5 ${kpi.bg}`}>
            <kpi.icon className={`h-5 w-5 ${kpi.accent}`} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">{kpi.label}</p>
            <p className={`text-xl font-bold tracking-tight ${kpi.accent}`}>{kpi.value}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}
