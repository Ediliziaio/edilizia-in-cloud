import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CreditCard, DollarSign, Users } from "lucide-react";
import type { CompanyHealthScore } from "@/hooks/useAdminRevenueData";

interface AdminDunningProps {
  healthScores: CompanyHealthScore[];
  currentMrr: number;
}

export function AdminDunning({ healthScores }: AdminDunningProps) {
  const expired = healthScores.filter((h) => h.status === "expired");
  const atRiskOrCritical = healthScores.filter((h) => h.health === "at_risk" || h.health === "critical");

  // Revenue at risk: sum actual plan prices of at-risk/critical companies
  const revenueAtRisk = atRiskOrCritical.reduce((sum, c) => sum + c.priceMonthly, 0);

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
      value: `€${revenueAtRisk.toLocaleString("it-IT")}`,
      icon: DollarSign,
      color: "text-destructive",
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
        <div className="grid grid-cols-3 gap-4">
          {metrics.map((m) => (
            <div key={m.label} className="text-center space-y-1">
              <m.icon className={`h-5 w-5 mx-auto ${m.color}`} />
              <p className="text-xl font-bold">{m.value}</p>
              <p className="text-xs text-muted-foreground">{m.label}</p>
            </div>
          ))}
        </div>
        {expired.length > 0 && (
          <div className="mt-4 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Aziende scadute recenti</p>
            <div className="space-y-1">
              {expired.slice(0, 5).map((c) => (
                <div key={c.companyId} className="flex items-center justify-between text-sm">
                  <span className="truncate">{c.companyName}</span>
                  <Badge variant="destructive" className="text-[10px]">Score {c.score}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
