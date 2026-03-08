import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Mail, TrendingUp, Users, MousePointerClick, AlertTriangle, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { formatEur } from "@/modules/ai-agents/lib/creditCalculator";

interface PlatformStats {
  total_sent: number;
  total_delivered: number;
  total_opened: number;
  total_clicked: number;
  total_bounced: number;
  total_unsubscribed: number;
  total_spam: number;
  total_credits_used: number;
  total_revenue: number;
  active_companies: number;
}

interface TopCompany {
  company_id: string;
  company_name: string;
  total_spent: number;
  balance: number;
}

type PeriodKey = "today" | "7d" | "30d" | "all";

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Oggi" },
  { key: "7d", label: "7 giorni" },
  { key: "30d", label: "30 giorni" },
  { key: "all", label: "Tutto" },
];

function getPeriodDates(period: PeriodKey): { from: string | null; to: string | null } {
  const now = new Date();
  const to = now.toISOString();
  switch (period) {
    case "today": {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return { from: start.toISOString(), to };
    }
    case "7d": {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return { from: start.toISOString(), to };
    }
    case "30d": {
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      return { from: start.toISOString(), to };
    }
    case "all":
    default:
      return { from: null, to: null };
  }
}

export function EmailDashboard() {
  const [period, setPeriod] = useState<PeriodKey>("30d");

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["platform-email-stats", period],
    queryFn: async () => {
      const { from, to } = getPeriodDates(period);
      const { data, error } = await supabase.rpc("get_platform_email_stats" as never, {
        p_date_from: from,
        p_date_to: to,
      } as never);
      if (error) throw error;
      const arr = data as unknown as PlatformStats[];
      return arr?.[0] ?? null;
    },
  });

  const { data: topCompanies, isLoading: topLoading } = useQuery({
    queryKey: ["email-top-companies"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_top_companies_by_email" as never, { p_limit: 10 } as never);
      if (error) throw error;
      return ((data as unknown as TopCompany[]) ?? []).map((r) => ({
        company_id: r.company_id,
        company_name: r.company_name || "—",
        total_spent: r.total_spent ?? 0,
        balance: r.balance ?? 0,
      }));
    },
  });

  if (statsLoading) return <Skeleton className="h-[400px]" />;

  const s = stats ?? {
    total_sent: 0, total_delivered: 0, total_opened: 0, total_clicked: 0,
    total_bounced: 0, total_unsubscribed: 0, total_spam: 0,
    total_credits_used: 0, total_revenue: 0, active_companies: 0,
  };

  const openRate = s.total_delivered > 0 ? ((s.total_opened / s.total_delivered) * 100).toFixed(1) : "0";
  const clickRate = s.total_opened > 0 ? ((s.total_clicked / s.total_opened) * 100).toFixed(1) : "0";
  const bounceRate = s.total_sent > 0 ? ((s.total_bounced / s.total_sent) * 100).toFixed(1) : "0";

  const kpis = [
    { label: "Email Inviate", value: s.total_sent.toLocaleString(), icon: Mail, color: "text-blue-600" },
    { label: "Consegnate", value: s.total_delivered.toLocaleString(), icon: Mail, color: "text-green-600" },
    { label: "Tasso Apertura", value: `${openRate}%`, icon: TrendingUp, color: "text-amber-600" },
    { label: "Tasso Click", value: `${clickRate}%`, icon: MousePointerClick, color: "text-purple-600" },
    { label: "Bounce Rate", value: `${bounceRate}%`, icon: AlertTriangle, color: "text-red-600" },
    { label: "Aziende Attive", value: s.active_companies.toLocaleString(), icon: Users, color: "text-primary" },
    { label: "Crediti Usati", value: formatEur(s.total_credits_used), icon: BarChart3, color: "text-primary" },
    { label: "Revenue Totale", value: formatEur(s.total_revenue), icon: TrendingUp, color: "text-green-700" },
  ];

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground mr-2">Periodo:</span>
        {PERIODS.map((p) => (
          <Button
            key={p.key}
            variant={period === p.key ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriod(p.key)}
            className="text-xs"
          >
            {p.label}
          </Button>
        ))}
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                <span className="text-xs text-muted-foreground">{kpi.label}</span>
              </div>
              <p className="text-2xl font-bold">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Top 10 Companies */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top 10 Aziende per Spesa Email</CardTitle>
          <CardDescription>Classifica aziende con maggiore utilizzo crediti email</CardDescription>
        </CardHeader>
        <CardContent>
          {topLoading ? (
            <Skeleton className="h-[200px]" />
          ) : !topCompanies?.length ? (
            <p className="text-sm text-muted-foreground">Nessun dato disponibile</p>
          ) : (
            <div className="space-y-2">
              {topCompanies.map((c, i) => (
                <div key={c.company_id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-muted-foreground w-6">#{i + 1}</span>
                    <span className="text-sm font-medium">{c.company_name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatEur(c.total_spent)}</p>
                      <p className="text-[10px] text-muted-foreground">spesi</p>
                    </div>
                    <Badge variant={c.balance > 0 ? "default" : "destructive"} className="text-[10px]">
                      {formatEur(c.balance)} saldo
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
