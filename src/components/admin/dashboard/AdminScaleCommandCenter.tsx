import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CreditCard, HeartPulse, LifeBuoy, ShieldCheck, TrendingUp, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/formatters";
import type { AdminDashboardStats, AdminMrrStats } from "@/hooks/useAdminDashboardData";

interface Props {
  stats: AdminDashboardStats;
  mrrStats: AdminMrrStats;
  healthSummary?: { healthy: number; atRisk: number; critical: number };
  avgMonthlyGrowth?: number;
  avgMonthlyChurnMrr?: number;
}

function SignalLink({
  to,
  title,
  value,
  tone,
}: {
  to: string;
  title: string;
  value: string;
  tone: "good" | "warn" | "bad" | "neutral";
}) {
  const toneClass = {
    good: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
    bad: "border-red-200 bg-red-50 text-red-800",
    neutral: "border-border bg-muted/30 text-foreground",
  }[tone];

  return (
    <Link
      to={to}
      className={`flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted ${toneClass}`}
    >
      <div className="min-w-0">
        <p className="text-xs font-medium opacity-80">{title}</p>
        <p className="text-sm font-semibold truncate">{value}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 opacity-70" />
    </Link>
  );
}

export function AdminScaleCommandCenter({
  stats,
  mrrStats,
  healthSummary,
  avgMonthlyGrowth = 0,
  avgMonthlyChurnMrr = 0,
}: Props) {
  const nonPayingAccesses = stats.nonPayingActiveCompanies + stats.freeActiveCompanies;
  const totalHealth =
    (healthSummary?.healthy ?? 0) +
    (healthSummary?.atRisk ?? 0) +
    (healthSummary?.critical ?? 0);
  const healthyPct =
    totalHealth > 0 ? Math.round(((healthSummary?.healthy ?? 0) / totalHealth) * 100) : 100;
  const revenueNetTrend = avgMonthlyGrowth - avgMonthlyChurnMrr;

  const signals = [
    {
      to: "/admin/aziende?noPayment=1",
      title: "Accessi non paganti",
      value:
        nonPayingAccesses > 0
          ? `${nonPayingAccesses} da verificare · ${formatCurrency(stats.excludedMrr)} esclusi`
          : "Nessun accesso anomalo",
      tone: nonPayingAccesses > 0 ? ("warn" as const) : ("good" as const),
    },
    {
      to: "/admin/aziende?health=critical",
      title: "Aziende critiche",
      value:
        (healthSummary?.critical ?? 0) > 0
          ? `${healthSummary?.critical ?? 0} critici · ${healthSummary?.atRisk ?? 0} a rischio`
          : `${healthSummary?.atRisk ?? 0} a rischio`,
      tone: (healthSummary?.critical ?? 0) > 0 ? ("bad" as const) : (healthSummary?.atRisk ?? 0) > 0 ? ("warn" as const) : ("good" as const),
    },
    {
      to: "/admin/aziende?status=trial&sort=trial&dir=asc",
      title: "Trial in scadenza",
      value: `${mrrStats.trialExpiringSoon} entro pochi giorni`,
      tone: mrrStats.trialExpiringSoon > 0 ? ("warn" as const) : ("good" as const),
    },
    {
      to: "/admin/ticket",
      title: "Supporto aperto",
      value: `${stats.openSupportConversations} conversazioni`,
      tone: stats.openSupportConversations > 0 ? ("warn" as const) : ("good" as const),
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Centro operativo
          </CardTitle>
          <Badge variant={nonPayingAccesses > 0 || (healthSummary?.critical ?? 0) > 0 ? "secondary" : "default"}>
            {nonPayingAccesses > 0 || (healthSummary?.critical ?? 0) > 0 ? "Azioni aperte" : "Sotto controllo"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-lg border p-3">
            <TrendingUp className="h-4 w-4 text-emerald-600 mb-2" />
            <p className="text-xs text-muted-foreground">MRR pagante</p>
            <p className="text-xl font-bold">{formatCurrency(mrrStats.mrr)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <Users className="h-4 w-4 text-primary mb-2" />
            <p className="text-xs text-muted-foreground">Aziende paganti</p>
            <p className="text-xl font-bold">{stats.payingCompanies.toLocaleString("it-IT")}</p>
          </div>
          <div className="rounded-lg border p-3">
            <HeartPulse className="h-4 w-4 text-rose-600 mb-2" />
            <p className="text-xs text-muted-foreground">Salute aziende</p>
            <div className="flex items-center gap-2">
              <p className="text-xl font-bold">{healthyPct}%</p>
              <Progress value={healthyPct} className="h-2 flex-1" />
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <CreditCard className="h-4 w-4 text-blue-600 mb-2" />
            <p className="text-xs text-muted-foreground">Trend netto mensile</p>
            <p className={`text-xl font-bold ${revenueNetTrend < 0 ? "text-destructive" : ""}`}>
              {formatCurrency(revenueNetTrend)}
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {signals.map((signal) => (
            <SignalLink key={signal.title} {...signal} />
          ))}
        </div>

        {(healthSummary?.critical ?? 0) > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Prima priorita: recuperare aziende critiche e pagamenti in sofferenza.</span>
          </div>
        )}
        {stats.openSupportConversations > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <LifeBuoy className="h-4 w-4 shrink-0" />
            <span>Supporto aperto: evita accumuli prima che la base clienti cresca.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
