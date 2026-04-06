/**
 * @file SmsDashboard.tsx
 * @description Dashboard KPI per il modulo SMS transazionale.
 * @author Claude Code — AEDIX S.r.l.
 * @date 2026-04-07
 */

import { MessageSquare, CheckCircle2, XCircle, TrendingUp, ArrowDownLeft, CalendarDays } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSmsStats } from "@/hooks/useSmsStats";
import { SmsSkeletonLoader } from "@/components/sms/SmsSkeletonLoader";

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconClass = "",
  trend,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass?: string;
  trend?: { value: number; label: string };
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-5 w-5 ${iconClass}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground">
          {typeof value === "number" ? new Intl.NumberFormat("it-IT").format(value) : value}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        {trend && (
          <p className={`text-xs mt-1 font-medium ${trend.value >= 0 ? "text-green-600" : "text-red-600"}`}>
            {trend.value >= 0 ? "+" : ""}{trend.value.toFixed(1)}% {trend.label}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function SmsDashboard() {
  const { data: stats, isLoading } = useSmsStats();

  if (isLoading) {
    return <SmsSkeletonLoader variant="stats" />;
  }

  if (!stats) return null;

  const deltaConsegna = stats.tassoConsegna - stats.tassoConsegnaPrecedente;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard
          title="SMS Inviati (30gg)"
          value={stats.totaleInviati}
          subtitle="messaggi in uscita"
          icon={MessageSquare}
          iconClass="text-blue-600"
        />
        <KpiCard
          title="Consegnati"
          value={stats.totaleConsegnati}
          subtitle="con conferma delivery"
          icon={CheckCircle2}
          iconClass="text-green-600"
        />
        <KpiCard
          title="Tasso Consegna"
          value={`${stats.tassoConsegna.toFixed(1)}%`}
          icon={TrendingUp}
          iconClass="text-indigo-600"
          trend={{ value: deltaConsegna, label: "vs mese prec." }}
        />
        <KpiCard
          title="Falliti"
          value={stats.totaleFalliti}
          subtitle="errori di consegna"
          icon={XCircle}
          iconClass="text-red-500"
        />
        <KpiCard
          title="Ricevuti"
          value={stats.totaleRicevuti}
          subtitle="messaggi in entrata"
          icon={ArrowDownLeft}
          iconClass="text-purple-600"
        />
        <KpiCard
          title="Oggi"
          value={stats.inviatoOggi}
          subtitle={`${stats.inviatoSettimana} questa settimana`}
          icon={CalendarDays}
          iconClass="text-orange-500"
        />
      </div>
    </div>
  );
}
