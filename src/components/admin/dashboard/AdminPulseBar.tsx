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

      const [signupsRes, activeUsersRes, ordersRes, ticketsRes] = await Promise.all([
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
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 mr-1">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <span className="text-[11px] font-medium text-muted-foreground">Live</span>
      </div>
      {metrics.map((m) => (
        <Badge
          key={m.label}
          variant="secondary"
          className={`text-[11px] font-normal gap-1 px-2.5 py-1 ${
            m.highlight ? "border-primary/20 bg-primary/5" : ""
          }`}
        >
          <m.icon className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">{m.label}:</span>
          <span className="font-semibold text-foreground">
            {m.value}
            {"suffix" in m && m.suffix}
          </span>
        </Badge>
      ))}
    </div>
  );
}
