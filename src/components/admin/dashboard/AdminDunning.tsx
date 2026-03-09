import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CreditCard, DollarSign, Users, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import type { CompanyHealthScore } from "@/hooks/useAdminRevenueData";

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

export function AdminDunning({ healthScores }: AdminDunningProps) {
  const expired = healthScores.filter((h) => h.status === "expired");
  const atRiskOrCritical = healthScores.filter((h) => h.health === "at_risk" || h.health === "critical");
  const revenueAtRisk = atRiskOrCritical.reduce((sum, c) => sum + c.priceMonthly, 0);

  // Fetch real dunning data from companies
  const { data: dunningCompanies } = useQuery({
    queryKey: ["admin-dunning-companies"],
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, name, dunning_status, payment_failure_count, last_payment_failure_at, stripe_subscription_status")
        .neq("dunning_status", "none")
        .order("payment_failure_count", { ascending: false })
        .limit(10);
      return (data || []) as DunningCompany[];
    },
    refetchInterval: 60000,
  });

  const dunningStatusColor: Record<string, string> = {
    warning: "bg-amber-100 text-amber-800",
    escalated: "bg-orange-100 text-orange-800",
    critical: "bg-red-100 text-red-800",
    churned: "bg-destructive text-destructive-foreground",
  };

  const metrics = [
    { label: "Trial scaduti", value: expired.length, icon: AlertTriangle, color: "text-destructive" },
    { label: "Aziende at-risk", value: atRiskOrCritical.length, icon: Users, color: "text-amber-500" },
    { label: "Revenue at risk", value: `€${revenueAtRisk.toLocaleString("it-IT")}`, icon: DollarSign, color: "text-destructive" },
    { label: "In dunning", value: dunningCompanies?.length || 0, icon: CreditCard, color: "text-orange-500" },
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {metrics.map((m) => (
            <div key={m.label} className="text-center space-y-1">
              <m.icon className={`h-5 w-5 mx-auto ${m.color}`} />
              <p className="text-xl font-bold">{m.value}</p>
              <p className="text-xs text-muted-foreground">{m.label}</p>
            </div>
          ))}
        </div>

        {/* Real dunning companies */}
        {dunningCompanies && dunningCompanies.length > 0 && (
          <div className="mt-4 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Pagamenti falliti</p>
            <div className="space-y-2">
              {dunningCompanies.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span className="truncate flex-1">{c.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">×{c.payment_failure_count}</span>
                    <Badge className={`text-[10px] ${dunningStatusColor[c.dunning_status] || ""}`}>
                      {c.dunning_status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
