import { useQuery } from "@tanstack/react-query";
import { parametriDaRighe } from "@/lib/costoPersonale";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  calculateCompanyStructureSnapshot,
  type CompanyStructureSnapshot,
  type StructureEmployee,
  type StructureFixedCost,
  type StructureOrder,
} from "@/lib/controlloGestione/strutturaCommessa";

export interface CompanyStructureResult extends CompanyStructureSnapshot {
  today: string;
}

/**
 * Fonte condivisa per la struttura aziendale. I costi con order_id sono già
 * diretti sulla commessa e vengono esclusi, come la quota ripartita sulle commesse; gli operai già imputabili ai
 * cantieri restano nella manodopera, non vengono ripetuti nell'overhead.
 */
export function useCompanyStructure(enabled = true) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? null;

  return useQuery({
    queryKey: ["economics", "company-structure", companyId],
    enabled: enabled && !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CompanyStructureResult> => {
      const [costsRes, employeesRes, operationalRes, ordersRes, parametriRes] = await Promise.all([
        supabase
          .from("company_costs")
          .select("amount, recurrence, recurrence_end_date, allocations")
          .eq("company_id", companyId!)
          .eq("cost_type", "fixed")
          .is("order_id", null)
          // Un costo fisso già finito non pesa più sulla struttura (stesso filtro di useMarginData).
          .or(`recurrence_end_date.is.null,recurrence_end_date.gte.${new Date().toLocaleDateString("en-CA")}`),
        supabase
          .from("employees")
          .select("id, gross_salary, inps_rate, role_type, area, qualifica, profilo_costo")
          .eq("company_id", companyId!)
          .eq("is_active", true),
        (supabase as any)
          .from("order_employees")
          .select("employee_id, orders!inner(company_id, deleted_at)")
          .eq("orders.company_id", companyId!)
          .is("orders.deleted_at", null)
          .limit(5000),
        supabase
          .from("orders")
          .select("status, percentuale_avanzamento, work_start_date, work_end_date")
          .eq("company_id", companyId!)
          .is("deleted_at", null)
          .limit(5000),
        (supabase as any)
          .from("costo_personale_parametri")
          .select("profilo, mensilita, inps, inail, cassa_edile, tfr, altri, ore_produttive")
          .eq("company_id", companyId!),
      ]);

      if (costsRes.error) throw costsRes.error;
      if (employeesRes.error) throw employeesRes.error;
      if (operationalRes.error) throw operationalRes.error;
      if (ordersRes.error) throw ordersRes.error;
      if (parametriRes.error) throw parametriRes.error;

      const today = new Date().toLocaleDateString("en-CA");
      const snapshot = calculateCompanyStructureSnapshot({
        fixedCosts: (costsRes.data ?? []) as StructureFixedCost[],
        employees: (employeesRes.data ?? []) as StructureEmployee[],
        operationalEmployeeIds: ((operationalRes.data ?? []) as Array<{ employee_id: string }>).map((row) => row.employee_id),
        orders: (ordersRes.data ?? []) as StructureOrder[],
        today,
        parametri: parametriDaRighe(parametriRes.data),
      });

      return { ...snapshot, today };
    },
  });
}
