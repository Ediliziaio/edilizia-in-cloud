import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CreditCard, DollarSign, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import type { CompanyHealthScore } from "@/hooks/useAdminRevenueData";
import { formatCurrency } from "@/lib/formatters";

interface AdminDunningProps {
  healthScores: CompanyHealthScore[];
}

interface DunningCompany {
  id: string;
  name: string;
  dunning_status: string;
  payment_failure_count: number;
  last_payment_failure_at: string | null;
  stripe_subscription_status: string;
}

// Severity order for sorting (highest = most urgent)
const DUNNING_SEVERITY: Record<string, number> = {
  churned: 4,
  critical: 3,
  escalated: 2,
  warning: 1,
};

// Human-readable labels for dunning status
const DUNNING_LABEL: Record<string, string> = {
  warning: "Scaduto oggi",
  escalated: "Scaduto 3gg",
  critical: "Ultimo avviso",
  churned: "Da sospendere",
};

// Tailwind classes for each status badge
const DUNNING_BADGE_CLASS: Record<string, string> = {
  warning: "bg-yellow-100 text-yellow-800 border-yellow-200",
  escalated: "bg-orange-100 text-orange-800 border-orange-200",
  critical: "bg-red-100 text-red-800 border-red-200",
  churned: "bg-red-900 text-red-100 border-red-800",
};

export function AdminDunning({ healthScores }: AdminDunningProps) {
  const expired = healthScores.filter((h) => h.status === "expired");
  const atRiskOrCritical = healthScores.filter(
    (h) => h.health === "at_risk" || h.health === "critical"
  );
  const revenueAtRisk = atRiskOrCritical.reduce((sum, c) => sum + c.priceMonthly, 0);

  // Fetch real dunning data from companies, sorted by severity
  const { data: dunningCompanies = [] } = useQuery({
    queryKey: ["admin-dunning-companies"],
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select(
          "id, name, dunning_status, payment_failure_count, last_payment_failure_at, stripe_subscription_status"
        )
        .neq("dunning_status", "none")
        .order("payment_failure_count", { ascending: false })
        .limit(20);
      const rows = (data || []) as DunningCompany[];
      // Sort by severity descending (churned > critical > escalated > warning)
      return rows.sort(
        (a, b) =>
          (DUNNING_SEVERITY[b.dunning_status] ?? 0) -
          (DUNNING_SEVERITY[a.dunning_status] ?? 0)
      );
    },
    refetchInterval: 60000,
  });

  // Counter by phase
  const countByStatus = dunningCompanies.reduce<Record<string, number>>((acc, c) => {
    acc[c.dunning_status] = (acc[c.dunning_status] ?? 0) + 1;
    return acc;
  }, {});

  const phasesSummary = (["churned", "critical", "escalated", "warning"] as const)
    .filter((s) => (countByStatus[s] ?? 0) > 0)
    .map((s) => `${countByStatus[s]} in ${DUNNING_LABEL[s].toLowerCase()}`)
    .join(", ");

  const metrics = [
    {
      label: "Trial scaduti",
      value: expired.length,
      icon: AlertTriangle,
      color: "text-destructive",
    },
    {
      label: "Aziende at-risk",
      value: atRiskOrCritical.length,
      icon: Users,
      color: "text-amber-500",
    },
    {
      label: "Revenue at risk",
      value: formatCurrency(revenueAtRisk),
      icon: DollarSign,
      color: "text-destructive",
    },
    {
      label: "In dunning",
      value: dunningCompanies.length,
      icon: CreditCard,
      color: "text-orange-500",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          Dunning & Rischio Churn
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* KPI counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {metrics.map((m) => (
            <div key={m.label} className="text-center space-y-1">
              <m.icon className={`h-5 w-5 mx-auto ${m.color}`} />
              <p className="text-xl font-bold">{m.value}</p>
              <p className="text-xs text-muted-foreground">{m.label}</p>
            </div>
          ))}
        </div>

        {/* Phase summary counter */}
        {phasesSummary && (
          <p className="text-xs text-muted-foreground mt-3 text-center">
            {phasesSummary}
          </p>
        )}

        {/* Dunning companies table */}
        {dunningCompanies.length > 0 && (
          <div className="mt-4 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Pagamenti in sofferenza — {dunningCompanies.length} aziende
            </p>
            <div className="space-y-2">
              {dunningCompanies.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm gap-2">
                  <span className="truncate flex-1 font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    ×{c.payment_failure_count} falliti
                  </span>
                  {c.dunning_status !== "none" && (
                    <Badge
                      className={`text-xs shrink-0 border ${
                        DUNNING_BADGE_CLASS[c.dunning_status] ?? ""
                      }`}
                    >
                      {DUNNING_LABEL[c.dunning_status] ?? c.dunning_status}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expired companies */}
        {expired.length > 0 && (
          <div className="mt-4 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Aziende scadute recenti
            </p>
            <div className="space-y-1">
              {expired.slice(0, 5).map((c) => (
                <div
                  key={c.companyId}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="truncate">{c.companyName}</span>
                  <Badge variant="destructive" className="text-xs">
                    Score {c.score}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
