import { useQuery } from "@tanstack/react-query";
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
 * diretti sulla commessa e vengono esclusi; gli operai già imputabili ai
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
      const [costsRes, employeesRes, operationalRes, ordersRes] = await Promise.all([
        supabase
          .from("company_costs")
          .select("amount, recurrence")
          .eq("company_id", companyId!)
          .eq("cost_type", "fixed")
          .is("order_id", null),
        supabase
          .from("employees")
          .select("id, gross_salary, inps_rate, role_type, area, qualifica")
          .eq("company_id", companyId!)
          .eq("is_active", true),
        (supabase as any)
          .from("order_employees")
          .select("employee_id, orders!inner(company_id)")
          .eq("orders.company_id", companyId!)
          .limit(5000),
        supabase
          .from("orders")
          .select("status, percentuale_avanzamento, work_start_date, work_end_date")
          .eq("company_id", companyId!)
          .limit(5000),
      ]);

      if (costsRes.error) throw costsRes.error;
      if (employeesRes.error) throw employeesRes.error;
      if (operationalRes.error) throw operationalRes.error;
      if (ordersRes.error) throw ordersRes.error;

      const today = new Date().toLocaleDateString("en-CA");
      const snapshot = calculateCompanyStructureSnapshot({
        fixedCosts: (costsRes.data ?? []) as StructureFixedCost[],
        employees: (employeesRes.data ?? []) as StructureEmployee[],
        operationalEmployeeIds: ((operationalRes.data ?? []) as Array<{ employee_id: string }>).map((row) => row.employee_id),
        orders: (ordersRes.data ?? []) as StructureOrder[],
        today,
      });

      return { ...snapshot, today };
    },
  });
}
