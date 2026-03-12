import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Building, Users, ClipboardList, MessageSquare, TrendingUp, TrendingDown, Minus } from "lucide-react";
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
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
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
      title: "Aziende Attive",
      value: stats.totalCompanies,
      delta: getDelta(stats.totalCompanies, previousStats?.totalCompanies),
      icon: Building,
      description: "Registrate sulla piattaforma",
      href: "/admin/aziende",
      accent: "from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/10",
      iconBg: "bg-primary/10 text-primary",
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
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {statCards.map((stat) => (
        <Card
          key={stat.title}
          className="relative overflow-hidden cursor-pointer group hover:shadow-lg transition-all duration-200 border-border/50"
          onClick={() => navigate(stat.href)}
        >
          {/* Gradient accent top bar */}
          <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${stat.accent}`} />
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between mb-3">
              <div className={`p-2.5 rounded-xl ${stat.iconBg} transition-transform group-hover:scale-110`}>
                <stat.icon className="h-4 w-4" />
              </div>
              <DeltaBadge delta={stat.delta} />
            </div>
            <div className="space-y-1">
              <p className="text-3xl font-bold tracking-tight text-foreground">{stat.value.toLocaleString("it-IT")}</p>
              <p className="text-xs font-medium text-muted-foreground">{stat.title}</p>
              <p className="text-[11px] text-muted-foreground/70">{stat.description}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
