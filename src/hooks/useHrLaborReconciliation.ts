import { useQuery } from "@tanstack/react-query";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { hrMonthBounds, reconcileHrLabor, type HrCostDay, type HrCostReport } from "@/lib/personale/laborReconciliation";
interface HrLaborResult { linked: boolean; summary: ReturnType<typeof reconcileHrLabor> | null }

/** No whole-company payroll load. No timers. Only expanded selected person/month. */
export function useHrLaborReconciliation(profiloId: string, month: string, open: boolean) {
  const companyId = useEffectiveCompanyId();
  const p = usePermissions();
  const allowed = p.canViewPersone && p.canViewCosts && !p.isLoading;
  const reportsAllowed = p.canViewOrders && p.canViewGiornaleLavori;
  return useQuery<HrLaborResult>({
    queryKey: ["hr-labor-reconciliation", companyId, profiloId, month, reportsAllowed],
    enabled: open && allowed && !!companyId && !!profiloId,
    staleTime: 60_000,
    queryFn: async () => {
      const bounds = hrMonthBounds(month);
      const { data: profile, error: profileError } = await supabase.from("hr_profili")
        .select("id,employee_id,user_id").eq("company_id", companyId!).eq("id", profiloId).maybeSingle();
      if (profileError) throw profileError;
      if (!profile) throw new Error("Profilo HR non disponibile per questa azienda.");
      if (!profile.employee_id) return { linked: false as const, summary: null };
      const daysPromise = supabase.from("hr_giornate")
        .select("data,stato,ore_lavorate,ore_straordinario,anomalia")
        .eq("company_id", companyId!).eq("profilo_id", profiloId).gte("data", bounds.start).lte("data", bounds.end);
      const reportsPromise = reportsAllowed ? supabase.from("campo_rapportini")
        .select("id,company_id,order_id,user_id,data_lavoro,stato,approvato,updated_at,ore_lavorate,ore_straordinario,presenze,costo_registrato_at,presenze_registrate,order:orders(order_code,description)")
        .eq("company_id", companyId!).gte("data_lavoro", bounds.start).lte("data_lavoro", bounds.end)
        .in("stato", ["approvato", "inviato"])
        .or([
          `presenze_registrate.cs.${JSON.stringify([{ employee_id: profile.employee_id }])}`,
          `presenze.cs.${JSON.stringify([{ employee_id: profile.employee_id }])}`,
          ...(profile.user_id ? [`user_id.eq.${profile.user_id}`] : []),
        ].join(",")) : Promise.resolve({ data: null, error: null });
      const [days, reports] = await Promise.all([daysPromise, reportsPromise]);
      if (days.error) throw days.error;
      if (reports.error) throw reports.error;
      // API page limit: never display a clipped payroll/cost total as complete.
      if ((days.data?.length ?? 0) > 31 || (reports.data?.length ?? 0) >= 1000) throw new Error("Troppi risultati per un riepilogo completo: verifica i dati del mese.");
      return { linked: true as const, summary: reconcileHrLabor({ companyId: companyId!, employeeId: profile.employee_id,
        userId: profile.user_id, month, days: (days.data ?? []) as HrCostDay[], reports: reports.data as unknown as HrCostReport[] | null }) };
    },
  });
}
