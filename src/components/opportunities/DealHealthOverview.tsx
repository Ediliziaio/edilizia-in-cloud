import { memo, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calculateDealHealth, buildDealHealthInput } from "@/lib/dealHealthScore";
import { CheckCircle, AlertTriangle, XCircle, Skull } from "lucide-react";
import { salesOSKeys } from "@/hooks/useSalesOS";

interface DealHealthOverviewProps {
  companyId: string;
}

export const DealHealthOverview = memo(function DealHealthOverview({ companyId }: DealHealthOverviewProps) {
  const { data: opportunities } = useQuery({
    queryKey: [...salesOSKeys.all, 'deal-health', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketing_opportunities')
        .select('id, updated_at, next_action, expected_close_date, probability, created_at')
        .eq('company_id', companyId)
        .eq('status', 'open');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });

  const counts = useMemo(() => {
    const c = { healthy: 0, at_risk: 0, critical: 0, dead: 0 };
    if (!opportunities) return c;
    for (const opp of opportunities) {
      const input = buildDealHealthInput(opp);
      const health = calculateDealHealth(input);
      c[health.status]++;
    }
    return c;
  }, [opportunities]);

  const total = counts.healthy + counts.at_risk + counts.critical + counts.dead;
  if (total === 0) return null;

  const items = [
    { label: 'In salute', count: counts.healthy, icon: CheckCircle, bgClass: 'bg-emerald-50 dark:bg-emerald-950/20', iconClass: 'text-emerald-600', valueClass: 'text-emerald-700 dark:text-emerald-400' },
    { label: 'A rischio', count: counts.at_risk, icon: AlertTriangle, bgClass: 'bg-amber-50 dark:bg-amber-950/20', iconClass: 'text-amber-600', valueClass: 'text-amber-700 dark:text-amber-400' },
    { label: 'Critici', count: counts.critical, icon: XCircle, bgClass: 'bg-red-50 dark:bg-red-950/20', iconClass: 'text-red-600', valueClass: 'text-red-700 dark:text-red-400' },
    { label: 'Da recuperare', count: counts.dead, icon: Skull, bgClass: 'bg-slate-100 dark:bg-slate-900/30', iconClass: 'text-slate-500', valueClass: 'text-slate-700 dark:text-slate-400' },
  ];

  return (
    <div className="grid grid-cols-4 gap-3">
      {items.map((item) => (
        <div key={item.label} className={`flex flex-col items-center p-3 rounded-lg ${item.bgClass}`}>
          <item.icon className={`h-4 w-4 ${item.iconClass} mb-1`} />
          <span className={`text-xl font-bold ${item.valueClass}`}>{item.count}</span>
          <span className="text-[10px] text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
});
