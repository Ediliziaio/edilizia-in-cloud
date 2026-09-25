import { memo, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calculateDealHealth, buildDealHealthInput } from "@/lib/dealHealthScore";
import { CheckCircle, AlertTriangle, XCircle, Skull } from "lucide-react";
import { salesOSKeys } from "@/hooks/useSalesOS";

interface DealHealthOverviewProps {
  companyId: string;
  /** Sales OS può guardare una pipeline sola: la salute segue la stessa scelta. */
  pipelineId?: string;
}

export const DealHealthOverview = memo(function DealHealthOverview({ companyId, pipelineId }: DealHealthOverviewProps) {
  const { data: opportunities } = useQuery({
    queryKey: [...salesOSKeys.all, 'deal-health', companyId, pipelineId ?? 'tutte'],
    enabled: !!companyId,
    queryFn: async () => {
      // Tutte le aperte e non cancellate: PostgREST ne dà al massimo 1000 per
      // chiamata, e prima le cancellate contavano e oltre le mille si perdeva
      // il resto. Le note si contano nel database come sulle schede del kanban:
      // senza, ogni trattativa perdeva 10 punti per «meno di 2 contatti registrati».
      const righe: any[] = [];
      for (let da = 0; da < 20_000; da += 1000) {
        let query = supabase
          .from('marketing_opportunities')
          .select('id, updated_at, last_activity_at, stage_changed_at, next_action, expected_close_date, probability, created_at, contact:marketing_contacts(is_decision_maker), marketing_contact_notes(count)')
          .eq('company_id', companyId)
          .eq('status', 'open')
          .is('deleted_at', null);
        if (pipelineId) query = query.eq('pipeline_id', pipelineId);
        const { data, error } = await query.order('id').range(da, da + 999);
        if (error) throw error;
        righe.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return righe;
    },
    staleTime: 1000 * 60 * 5,
  });

  const counts = useMemo(() => {
    const c = { healthy: 0, at_risk: 0, critical: 0, dead: 0 };
    if (!opportunities) return c;
    for (const opp of opportunities) {
      const oppRec = opp as typeof opp & {
        contact?: { is_decision_maker?: boolean } | { is_decision_maker?: boolean }[] | null;
        marketing_contact_notes?: { count?: number | null }[] | null;
      };
      const contact = Array.isArray(oppRec.contact) ? oppRec.contact[0] : oppRec.contact;
      const input = buildDealHealthInput({
        ...opp,
        notes_count: oppRec.marketing_contact_notes?.[0]?.count ?? 0,
        contact_is_decision_maker: contact?.is_decision_maker ?? null,
      });
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
    // Telefono: quattro numeri in una riga, senza icone.
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-sm:grid-cols-4 max-sm:gap-1.5">
      {items.map((item) => (
        <div key={item.label} className={`flex flex-col items-center p-3 rounded-lg max-sm:px-1 max-sm:py-2 ${item.bgClass}`}>
          <item.icon className={`h-4 w-4 ${item.iconClass} mb-1 max-sm:hidden`} />
          <span className={`text-xl font-bold max-sm:text-lg max-sm:leading-tight ${item.valueClass}`}>{item.count}</span>
          <span className="text-[10px] text-muted-foreground max-sm:whitespace-nowrap">{item.label}</span>
        </div>
      ))}
    </div>
  );
});
