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
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const { canViewCosts, canViewEmployees, canViewPersone, canViewGiornaleLavori, isLoading } = usePermissions();
  const readRates = canViewCosts && (canViewEmployees === true || canViewPersone === true) && !isLoading;
  const enabled = !!orderId && !!companyId && canViewCosts && !isLoading;
  const employees = useQuery({
    queryKey: ["order-labor-economics", orderId, companyId, readRates],
    enabled: enabled && readRates, staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const employeeFields = readRates
        ? "id,user_id,first_name,last_name,costo_orario,gross_salary,inps_rate,monthly_hours,profilo_costo,role_type,qualifica,area"
        : "id,first_name,last_name";
      const rateFields = readRates ? ",planned_hourly_rate,hourly_rate" : "";
      const { data, error } = await supabase.from("order_employees")
        .select(`id,employee_id,hours_worked,total_cost,cost_preventivo,planned_hours${rateFields},employee:employees(${employeeFields}),orders!inner(company_id)`)
        .eq("order_id", orderId).eq("orders.company_id", companyId!).eq("employee.company_id", companyId!);
      if (error) throw error;
      return (data ?? []) as unknown as LaborLedgerRow[];
    },
  });
  const aggregate = useQuery({
    queryKey: ["order-labor-aggregate", orderId, companyId, user?.id],
    enabled: enabled && !readRates, staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const client = supabase as unknown as { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: { cost: number; budget: number | null; unpriced: boolean } | null; error: Error | null }> };
      const { data, error } = await client.rpc("commessa_costo_personale_aggregato", { p_order_id: orderId });
      if (error) throw error;
      if (!data) throw new Error("Costo aggregato non disponibile");
      return data;
    },
  });
  const teams = useQuery({
    queryKey: ["order-subcontract-economics", orderId, companyId],
    enabled, staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("order_external_teams")
        .select("id,cost_preventivo,total_cost,vat_rate,team:external_teams(name,kind),fase:order_work_phases(name,position),orders!inner(company_id)")
        .eq("order_id", orderId).eq("orders.company_id", companyId!).eq("team.company_id", companyId!);
      if (error) throw error;
      return (data ?? []) as unknown as ExternalLaborRow[];
    },
  });
  const pendingReports = useQuery({
    queryKey: ["order-labor-pending",orderId,companyId], enabled:enabled && canViewGiornaleLavori === true,
    queryFn: async () => {
      const client = supabase as unknown as { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: { company_id: string; pending?: number } | null; error: Error | null }> };
      const { data, error } = await client.rpc("ufficio_leggi_ore", { p_order_id: orderId, p_solo_riepilogo: true });
      if (error) throw error;
      assertDailyHoursCompany(data, companyId!);
      return Number(data?.pending ?? 0);
    },
  });
  return { employees, teams, aggregate, pendingReports, canCheckPending:canViewGiornaleLavori === true, readRates, allowed: canViewCosts && !isLoading };
}
