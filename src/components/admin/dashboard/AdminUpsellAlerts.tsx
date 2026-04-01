import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight, AlertTriangle, ClipboardList, Users, Flame } from "lucide-react";
import type { UpsellAlert } from "@/hooks/useAdminRevenueData";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ChurnRisk {
  company_id: string;
  company_name: string;
  score: number;
  churn_risk: number;
  plan_name: string | null;
  mrr: number;
  signals: string[];
}

function ChurnRiskSection() {
  const { data: atRisk } = useQuery<ChurnRisk[]>({
    queryKey: ["churn-risk-companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_health_scores" as never)
        .select(`
          company_id,
          score,
          churn_risk,
          signals,
          company:companies!company_id(name, subscription_plan_id, subscription_plans:subscription_plan_id(name, price_monthly))
        ` as never)
        .lt("score" as never, 30)
        .order("churn_risk" as never, { ascending: false })
        .limit(10);
      if (error) throw error;
      return ((data || []) as any[]).map((row) => ({
        company_id: row.company_id,
        company_name: row.company?.name || "—",
        score: row.score,
        churn_risk: row.churn_risk ?? 0,
        plan_name: row.company?.subscription_plans?.name ?? null,
        mrr: row.company?.subscription_plans?.price_monthly ?? 0,
        signals: row.signals || [],
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  if (!atRisk || atRisk.length === 0) return null;

  return (
    <Card className="border-destructive/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Flame className="h-4 w-4 text-destructive" />
          Aziende a Rischio Churn
          <Badge variant="destructive" className="text-[10px]">{atRisk.length}</Badge>
        </CardTitle>
        <CardDescription className="text-xs">Health score &lt; 30 — ordinate per churn risk decrescente</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {atRisk.map((c) => (
          <div key={c.company_id} className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
            {/* Score circle */}
            <div className="shrink-0 h-9 w-9 rounded-full bg-destructive/10 flex items-center justify-center">
              <span className="text-sm font-bold text-destructive">{c.score}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium truncate">{c.company_name}</span>
                {c.plan_name && <Badge variant="outline" className="text-[10px] h-4">{c.plan_name}</Badge>}
                {c.mrr > 0 && <span className="text-[10px] text-muted-foreground">€{c.mrr}/mo</span>}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-destructive font-medium">Churn risk: {c.churn_risk}%</span>
                {c.signals.length > 0 && (
                  <span className="text-[10px] text-muted-foreground truncate">· {c.signals.slice(0, 2).join(", ")}</span>
                )}
              </div>
            </div>
            <Button size="sm" variant="ghost" asChild className="shrink-0">
              <Link to={`/admin/aziende/${c.company_id}`}>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

interface Props {
  alerts: UpsellAlert[];
}

export function AdminUpsellAlerts({ alerts }: Props) {
  if (alerts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Upsell Alerts</CardTitle>
          <CardDescription>Nessun tenant vicino ai limiti del piano</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Upsell Alerts
          <Badge variant="secondary" className="text-[10px]">{alerts.length}</Badge>
        </CardTitle>
        <CardDescription>Tenant che si avvicinano ai limiti del piano (≥70%)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.slice(0, 10).map((alert) => (
          <div key={`${alert.companyId}-${alert.metric}`} className="flex items-center gap-3 rounded-lg border p-3">
            <div className="p-2 rounded-md bg-muted">
              {alert.metric === "orders" ? (
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Users className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium truncate">{alert.companyName}</p>
                <Badge variant="outline" className="text-[10px] shrink-0">{alert.planName}</Badge>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Progress
                  value={Math.min(alert.pct, 100)}
                  className="h-2 flex-1"
                />
                <span className={`text-xs font-medium whitespace-nowrap ${
                  alert.pct >= 90 ? "text-destructive" : "text-amber-600"
                }`}>
                  {alert.current}/{alert.limit} {alert.metric === "orders" ? "ordini" : "utenti"} ({alert.pct}%)
                </span>
              </div>
            </div>
            <Button size="sm" variant="ghost" asChild>
              <Link to={`/admin/aziende/${alert.companyId}`}>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        ))}
        {alerts.length > 10 && (
          <p className="text-xs text-center text-muted-foreground pt-2">
            …e altri {alerts.length - 10} alert
          </p>
        )}
      </CardContent>
    </Card>
    <ChurnRiskSection />
    </div>
  );
}
