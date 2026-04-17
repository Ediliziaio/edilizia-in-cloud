import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Users, Building2, TrendingUp, Zap } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";

/** Compact pulse bar showing real-time platform vitals */
export function AdminPulseBar() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-pulse-bar"],
    queryFn: async () => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

      // Fail-soft: una singola query broken (RLS, colonna mancante) non deve
      // oscurare l'intera pulse bar. allSettled → degradiamo a 0 sulle query
      // rotte ma mostriamo ciò che abbiamo.
      const settled = await Promise.allSettled([
        supabase
          .from("companies")
          .select("id", { count: "exact", head: true })
          .gte("created_at", todayStart),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .gte("last_login_at", last24h),
        supabase
          .from("orders")
          .select("id, total_amount", { count: "exact" })
          .gte("created_at", todayStart),
        supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .gte("created_at", todayStart),
      ]);

      const pick = <T = any>(idx: number): T =>
        settled[idx].status === "fulfilled"
          ? ((settled[idx] as PromiseFulfilledResult<any>).value as T)
          : ({ data: null, error: null, count: 0 } as unknown as T);

      const signupsRes = pick<{ count: number | null }>(0);
      const activeUsersRes = pick<{ count: number | null }>(1);
      const ordersRes = pick<{ data: any[] | null; count: number | null }>(2);
      const ticketsRes = pick<{ count: number | null }>(3);

      const todayOrdersValue = (ordersRes.data || []).reduce(
        (sum, o: any) => sum + (Number(o.total_amount) || 0),
        0
      );

      return {
        signupsToday: signupsRes.count || 0,
        activeUsers24h: activeUsersRes.count || 0,
        ordersToday: ordersRes.count || 0,
        ordersValueToday: todayOrdersValue,
        ticketsToday: ticketsRes.count || 0,
      };
    },
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-7 w-24 rounded-full" />
        ))}
      </div>
    );
  }

  const metrics = [
    {
      icon: Building2,
      label: "Nuove oggi",
      value: data?.signupsToday || 0,
      highlight: (data?.signupsToday || 0) > 0,
    },
    {
      icon: Users,
      label: "Utenti attivi 24h",
      value: data?.activeUsers24h || 0,
      highlight: false,
    },
    {
      icon: TrendingUp,
      label: "Ordini oggi",
      value: `${data?.ordersToday || 0}`,
      suffix: data?.ordersValueToday ? ` · ${formatCurrency(data.ordersValueToday)}` : "",
      highlight: (data?.ordersToday || 0) > 0,
    },
    {
      icon: Zap,
      label: "Ticket oggi",
      value: data?.ticketsToday || 0,
      highlight: (data?.ticketsToday || 0) > 5,
    },
  ];

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
      <div className="flex items-center gap-1.5 mr-1">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <span className="text-xs font-medium text-muted-foreground">Live</span>
      </div>
      {metrics.map((m) => (
        <Badge
          key={m.label}
          variant="outline"
          className={`text-xs font-normal gap-1.5 px-3 py-1.5 bg-background shadow-sm ${
            m.highlight ? "border-primary/30 bg-primary/5" : "border-border"
          }`}
        >
          <m.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground whitespace-nowrap">{m.label}:</span>
          <span className="font-semibold text-foreground">
            {m.value}
            {"suffix" in m && m.suffix}
          </span>
        </Badge>
      ))}
    </div>
  );
}
