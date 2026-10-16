import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import type { ExternalLaborRow, LaborLedgerRow } from "@/lib/orders/laborEconomics";
import { assertDailyHoursCompany } from "@/lib/orders/dailyHours";

/** Two bounded relational reads, only while the dedicated cost view is mounted.
 * Separate shapes/keys from oes-employees and operational assignment queries.
 */
export function useOrderLaborEconomics(orderId: string) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const { canViewCosts, canViewEmployees, canViewGiornaleLavori, isLoading } = usePermissions();
  const readRates = canViewCosts && canViewEmployees && !isLoading;
  const enabled = !!orderId && !!companyId && canViewCosts && !isLoading;
  const employees = useQuery({
    queryKey: ["order-labor-economics", orderId, companyId, readRates],
    enabled, staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const employeeFields = readRates
        ? "id,user_id,first_name,last_name,costo_orario,gross_salary,inps_rate,monthly_hours"
        : "id,first_name,last_name";
      const { data, error } = await supabase.from("order_employees")
        .select(`id,employee_id,hours_worked,total_cost,cost_preventivo,planned_hours,planned_hourly_rate,hourly_rate,employee:employees(${employeeFields}),orders!inner(company_id)`)
        .eq("order_id", orderId).eq("orders.company_id", companyId!).eq("employee.company_id", companyId!);
      if (error) throw error;
      return (data ?? []) as unknown as LaborLedgerRow[];
    },
  });
  const teams = useQuery({
    queryKey: ["order-subcontract-economics", orderId, companyId],
    enabled, staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("order_external_teams")
        .select("id,cost_preventivo,total_cost,vat_rate,team:external_teams(name,kind),orders!inner(company_id)")
        .eq("order_id", orderId).eq("orders.company_id", companyId!).eq("team.company_id", companyId!);
      if (error) throw error;
      return (data ?? []) as unknown as ExternalLaborRow[];
    },
  });
  const pendingReports = useQuery({
    queryKey: ["order-labor-pending",orderId,companyId], enabled:enabled && canViewGiornaleLavori === true,
    queryFn:async()=>{const {data,error}=await (supabase as any).rpc("ufficio_leggi_ore",{p_order_id:orderId,p_solo_riepilogo:true});if(error)throw error;assertDailyHoursCompany(data,companyId!);return Number(data?.pending??0);},
  });
  return { employees, teams, pendingReports, canCheckPending:canViewGiornaleLavori === true, readRates, allowed: canViewCosts && !isLoading };
}
