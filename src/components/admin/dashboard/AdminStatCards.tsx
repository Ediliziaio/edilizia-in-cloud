import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Building, Euro, Hourglass, MessageSquare, TrendingUp, TrendingDown, Minus, Activity, CalendarDays, CreditCard, Gift, Factory } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { supabase } from "@/integrations/supabase/client";
import type { AdminDashboardStats, AdminMrrStats } from "@/hooks/useAdminDashboardData";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any;

/**
 * Incasso wholesale/mese dai produttori white-label: somma dei piani dei
 * rivenditori comped scontata della % wholesale del produttore padre. Era
 * visibile solo in /admin/produttori — il dashboard mostrava "0,00 €" ovunque
 * mentre i soldi veri stavano qui. Query self-contained (cache 5 min).
 */
function useWholesaleMrr() {
  return useQuery({
    queryKey: ["admin-wholesale-mrr"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<number> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data: brand } = await sb
        .from("company_branding").select("company_id").eq("whitelabel_tier", "agency");
      const ids: string[] = [...new Set((brand ?? []).map((b: AnyRow) => b.company_id).filter(Boolean))];
      if (ids.length === 0) return 0;
      const [parentsRes, rivsRes] = await Promise.all([
        sb.from("companies").select("id, reseller_wholesale_pct").in("id", ids),
        sb.from("companies")
          .select("parent_company_id, billing_comped, subscription_plans:subscription_plan_id(price_monthly)")
          .in("parent_company_id", ids).eq("billing_comped", true),
      ]);
      const pctById = new Map<string, number>(
        ((parentsRes.data ?? []) as AnyRow[]).map((p) => [p.id, Number(p.reseller_wholesale_pct ?? 0)]),
      );
      let tot = 0;
      for (const r of (rivsRes.data ?? []) as AnyRow[]) {
        const price = Number(r.subscription_plans?.price_monthly ?? 0);
        const pct = Math.min(100, Math.max(0, pctById.get(r.parent_company_id) ?? 0));
        tot += price * (1 - pct / 100);
      }
      return Math.round(tot * 100) / 100;
    },
  });
}

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
  const { data: wholesaleMrr } = useWholesaleMrr();

  const statCards = [
    {
      title: "Aziende Paganti",
      value: stats.payingCompanies,
      delta: getDelta(stats.payingCompanies, previousStats?.payingCompanies),
      icon: Building,
      description: `${stats.accessActiveCompanies} accessi attivi · ${stats.totalCompanies} aziende`,
      href: "/admin/aziende",
      grad: "from-blue-500 to-indigo-500",
    },
    {
      // Era "Accessi Non Paganti": criptico. Sono le aziende comped/regalate
      // (demo, partner, white-label) + quelle su piano free.
      title: "Aziende Comped",
      value: stats.nonPayingActiveCompanies + stats.freeActiveCompanies,
      delta: null,
      icon: Gift,
      description: `${formatCurrency(stats.excludedMrr)} a listino non fatturati`,
      href: "/admin/aziende?noPayment=1",
      grad: "from-orange-500 to-amber-400",
    },
    {
      title: "MRR Attuale",
      value: formatCurrency(mrrStats.mrr),
      delta: null,
      icon: Euro,
      description: `${mrrStats.activeCount} aziende attive · churn mese ${mrrStats.churnRate}%`,
      href: "/admin/aziende?revenue=paying",
      grad: "from-emerald-500 to-teal-400",
    },
    {
      title: "Wholesale/mese",
      value: wholesaleMrr === undefined ? "…" : formatCurrency(wholesaleMrr),
      delta: null,
      icon: Factory,
      description: "Incasso dai produttori white-label",
      href: "/admin/produttori",
      grad: "from-violet-500 to-purple-400",
    },
    {
      title: "Trial in scadenza",
      value: mrrStats.trialExpiringSoon,
      delta: null,
      icon: Hourglass,
      description: `${mrrStats.trialCount} trial totali · da convertire`,
      href: "/admin/aziende?status=trial",
      grad: mrrStats.trialExpiringSoon > 0 ? "from-amber-500 to-orange-400" : "from-sky-500 to-blue-400",
    },
    {
      title: "Supporto Aperto",
      value: stats.openSupportConversations,
      delta: null,
      icon: MessageSquare,
      description: "Conversazioni da gestire",
      href: "/admin/ticket",
      grad: stats.openSupportConversations > 0 ? "from-orange-500 to-amber-400" : "from-emerald-500 to-teal-400",
    },
    {
      title: "DAC (ultimi 24h)",
      value: stats.dac ?? 0,
      delta: null,
      icon: Activity,
      description: "Aziende attive oggi",
      href: "/admin/aziende",
      grad: "from-sky-500 to-blue-400",
    },
    {
      title: "WAC (ultimi 7gg)",
      value: stats.wac ?? 0,
      delta: null,
      icon: CalendarDays,
      description: "Aziende attive questa settimana",
      href: "/admin/aziende",
      grad: "from-indigo-500 to-blue-400",
    },
    {
      title: "Aziende senza carta",
      value: stats.noPaymentMethodActive,
      delta: null,
      icon: CreditCard,
      description: "Attive senza metodo di pagamento",
      href: "/admin/aziende?noPayment=1",
      grad: stats.noPaymentMethodActive > 0 ? "from-rose-500 to-red-400" : "from-emerald-500 to-teal-400",
    },
  ];

  return (
    // Layout ottimizzato: 2 colonne su mobile, 4 da lg in su (2 righe × 4 cards).
    // Su xl si espande a 8 colonne ma con padding interno maggiore — niente più
    // descrizioni troncate aggressivamente.
    <div className="grid gap-3 md:gap-4 grid-cols-2 md:grid-cols-4 2xl:grid-cols-8">
      {statCards.map((stat, i) => {
        const isZero =
          typeof stat.value === "number" ? stat.value === 0 : stat.value === "0%" || stat.value === "0";
        return (
          <Card
            key={stat.title}
            style={{ animationDelay: `${i * 55}ms` }}
            className="group relative overflow-hidden cursor-pointer opacity-0 animate-fade-in-up border-border/50 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/[0.08] hover:border-transparent motion-reduce:animate-none motion-reduce:opacity-100"
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
            {/* Barra accento superiore (vivida) + alone che si accende in hover */}
            <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${stat.grad}`} />
            <div className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br ${stat.grad} opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-20`} />
            <CardContent className="pt-4 pb-3 md:pt-5 md:pb-4 px-3 md:px-4">
              <div className="flex items-start justify-between mb-2 md:mb-3">
                <div
                  className={`grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br ${stat.grad} text-white shadow-sm transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-3`}
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
