import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Building, Users, ClipboardList, MessageSquare, TrendingUp, TrendingDown, Minus, Activity, CalendarDays, Zap, Gift } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import type { AdminDashboardStats } from "@/hooks/useAdminDashboardData";

interface Props {
  stats: AdminDashboardStats;
  previousStats?: AdminDashboardStats | null;
}

function getDelta(current: number, previous: number | undefined) {
  if (!previous || previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return pct;
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const isPositive = delta > 0;
  const isNeutral = delta === 0;
  const Icon = isPositive ? TrendingUp : isNeutral ? Minus : TrendingDown;

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full ${
        isPositive
          ? "text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/40"
          : isNeutral
          ? "text-muted-foreground bg-muted"
          : "text-destructive bg-destructive/10"
      }`}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(delta)}%
    </span>
  );
}

export function AdminStatCards({ stats, previousStats }: Props) {
  const navigate = useNavigate();

  const statCards = [
    {
      title: "Aziende Paganti",
      value: stats.payingCompanies,
      delta: getDelta(stats.payingCompanies, previousStats?.payingCompanies),
      icon: Building,
      description: `${stats.accessActiveCompanies} accessi attivi · ${stats.totalCompanies} aziende`,
      href: "/admin/aziende",
      accent: "from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/10",
      iconBg: "bg-primary/10 text-primary",
    },
    {
      title: "Accessi Non Paganti",
      value: stats.nonPayingActiveCompanies + stats.freeActiveCompanies,
      delta: null,
      icon: Gift,
      description: `${formatCurrency(stats.excludedMrr)} MRR escluso`,
      href: "/admin/aziende?noPayment=1",
      accent: "from-orange-500/10 to-orange-500/5 dark:from-orange-500/20 dark:to-orange-500/10",
      iconBg: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    },
    {
      title: "Ordini Totali",
      value: stats.totalOrders,
      delta: getDelta(stats.totalOrders, previousStats?.totalOrders),
      icon: ClipboardList,
      description: formatCurrency(stats.totalOrdersValue) + " valore totale",
      href: "/admin/aziende",
      accent: "from-emerald-500/10 to-emerald-500/5 dark:from-emerald-500/20 dark:to-emerald-500/10",
      iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
      title: "Clienti Totali",
      value: stats.totalCustomers,
      delta: getDelta(stats.totalCustomers, previousStats?.totalCustomers),
      icon: Users,
      description: "Utenti registrati",
      href: "/admin/aziende",
      accent: "from-violet-500/10 to-violet-500/5 dark:from-violet-500/20 dark:to-violet-500/10",
      iconBg: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    },
    {
      title: "Supporto Aperto",
      value: stats.openSupportConversations,
      delta: null,
      icon: MessageSquare,
      description: "Conversazioni da gestire",
      href: "/admin/ticket",
      accent: stats.openSupportConversations > 0
        ? "from-orange-500/10 to-orange-500/5 dark:from-orange-500/20 dark:to-orange-500/10"
        : "from-emerald-500/10 to-emerald-500/5 dark:from-emerald-500/20 dark:to-emerald-500/10",
      iconBg: stats.openSupportConversations > 0
        ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
        : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
      title: "DAC (ultimi 24h)",
      value: stats.dac ?? 0,
      delta: null,
      icon: Activity,
      description: "Aziende attive oggi",
      href: "/admin/aziende",
      accent: "from-cyan-500/10 to-cyan-500/5 dark:from-cyan-500/20 dark:to-cyan-500/10",
      iconBg: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
    },
    {
      title: "WAC (ultimi 7gg)",
      value: stats.wac ?? 0,
      delta: null,
      icon: CalendarDays,
      description: "Aziende attive questa settimana",
      href: "/admin/aziende",
      accent: "from-indigo-500/10 to-indigo-500/5 dark:from-indigo-500/20 dark:to-indigo-500/10",
      iconBg: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    },
    {
      title: "Engagement Rate",
      value: `${stats.engagementRate ?? 0}%`,
      delta: null,
      icon: Zap,
      description: "DAC / accessi attivi",
      href: "/admin/aziende",
      accent: "from-amber-500/10 to-amber-500/5 dark:from-amber-500/20 dark:to-amber-500/10",
      iconBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
  ];

  return (
    <div className="grid gap-3 md:gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
      {statCards.map((stat) => (
        <Card
          key={stat.title}
          className="relative overflow-hidden cursor-pointer group hover:shadow-lg transition-all duration-200 border-border/50"
          onClick={() => navigate(stat.href)}
        >
          {/* Gradient accent top bar */}
          <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${stat.accent}`} />
          <CardContent className="pt-4 pb-3 md:pt-5 md:pb-4 px-3 md:px-4">
            <div className="flex items-start justify-between mb-2 md:mb-3">
              <div className={`p-2 md:p-2.5 rounded-xl ${stat.iconBg} transition-transform group-hover:scale-110`}>
                <stat.icon className="h-4 w-4" />
              </div>
              <DeltaBadge delta={stat.delta} />
            </div>
            <div className="space-y-0.5 md:space-y-1">
              <p className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                {typeof stat.value === "string" ? stat.value : stat.value.toLocaleString("it-IT")}
              </p>
              <p className="text-xs md:text-sm font-medium text-muted-foreground">{stat.title}</p>
              <p className="text-[10px] md:text-xs text-muted-foreground/70 truncate">{stat.description}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
