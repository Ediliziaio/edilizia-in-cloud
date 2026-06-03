import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Building, Euro, Hourglass, MessageSquare, TrendingUp, TrendingDown, Minus, Activity, CalendarDays, CreditCard, Gift } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import type { AdminDashboardStats, AdminMrrStats } from "@/hooks/useAdminDashboardData";

interface Props {
  stats: AdminDashboardStats;
  mrrStats: AdminMrrStats;
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

export function AdminStatCards({ stats, mrrStats, previousStats }: Props) {
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
      title: "MRR Attuale",
      value: formatCurrency(mrrStats.mrr),
      delta: null,
      icon: Euro,
      description: `${mrrStats.activeCount} aziende attive · churn mese ${mrrStats.churnRate}%`,
      href: "/admin/aziende?revenue=paying",
      accent: "from-blue-500/10 to-blue-500/5 dark:from-blue-500/20 dark:to-blue-500/10",
      iconBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    {
      title: "Trial in scadenza",
      value: mrrStats.trialExpiringSoon,
      delta: null,
      icon: Hourglass,
      description: `${mrrStats.trialCount} trial totali · da convertire`,
      href: "/admin/aziende?status=trial",
      accent: mrrStats.trialExpiringSoon > 0
        ? "from-amber-500/10 to-amber-500/5 dark:from-amber-500/20 dark:to-amber-500/10"
        : "from-blue-500/10 to-blue-500/5 dark:from-blue-500/20 dark:to-blue-500/10",
      iconBg: mrrStats.trialExpiringSoon > 0
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : "bg-blue-500/10 text-blue-600 dark:text-blue-400",
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
      accent: "from-blue-500/10 to-blue-500/5 dark:from-blue-500/20 dark:to-blue-500/10",
      iconBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    {
      title: "WAC (ultimi 7gg)",
      value: stats.wac ?? 0,
      delta: null,
      icon: CalendarDays,
      description: "Aziende attive questa settimana",
      href: "/admin/aziende",
      accent: "from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/10",
      iconBg: "bg-primary/10 text-primary",
    },
    {
      title: "Aziende senza carta",
      value: stats.noPaymentMethodActive,
      delta: null,
      icon: CreditCard,
      description: "Attive senza metodo di pagamento",
      href: "/admin/aziende?noPayment=1",
      accent: stats.noPaymentMethodActive > 0
        ? "from-rose-500/10 to-rose-500/5 dark:from-rose-500/20 dark:to-rose-500/10"
        : "from-emerald-500/10 to-emerald-500/5 dark:from-emerald-500/20 dark:to-emerald-500/10",
      iconBg: stats.noPaymentMethodActive > 0
        ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
        : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
  ];

  return (
    // Layout ottimizzato: 2 colonne su mobile, 4 da lg in su (2 righe × 4 cards).
    // Su xl si espande a 8 colonne ma con padding interno maggiore — niente più
    // descrizioni troncate aggressivamente.
    <div className="grid gap-3 md:gap-4 grid-cols-2 md:grid-cols-4 2xl:grid-cols-8">
      {statCards.map((stat) => {
        const isZero =
          typeof stat.value === "number" ? stat.value === 0 : stat.value === "0%" || stat.value === "0";
        return (
          <Card
            key={stat.title}
            className="relative overflow-hidden cursor-pointer group hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 border-border/50"
            onClick={() => navigate(stat.href)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate(stat.href);
              }
            }}
            aria-label={`${stat.title}: ${stat.value}. ${stat.description}`}
          >
            {/* Gradient accent top bar */}
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${stat.accent}`} />
            <CardContent className="pt-4 pb-3 md:pt-5 md:pb-4 px-3 md:px-4">
              <div className="flex items-start justify-between mb-2 md:mb-3">
                <div
                  className={`p-2 md:p-2.5 rounded-xl ${stat.iconBg} transition-transform group-hover:scale-110`}
                >
                  <stat.icon className="h-4 w-4" />
                </div>
                <DeltaBadge delta={stat.delta} />
              </div>
              <div className="space-y-0.5 md:space-y-1">
                <p
                  className={`text-2xl md:text-3xl font-bold tracking-tight ${
                    isZero ? "text-muted-foreground/60" : "text-foreground"
                  }`}
                >
                  {typeof stat.value === "string" ? stat.value : stat.value.toLocaleString("it-IT")}
                </p>
                <p className="text-xs md:text-sm font-medium text-muted-foreground">{stat.title}</p>
                <p
                  className="text-[10px] md:text-xs text-muted-foreground/70 truncate"
                  title={stat.description}
                >
                  {stat.description}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
