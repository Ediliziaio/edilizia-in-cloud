import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { reviewHourlyCost } from "@/lib/campo/laborCostReview";

/** One selected employee only. Reference for planning, never reprices past reports. */
export function useAssignmentHourlyCost(employeeId: string | undefined) {
  const { effectiveCompany } = useAuth();
  const { canViewCosts, canViewEmployees, isLoading } = usePermissions();
  const companyId = effectiveCompany?.id;
  const allowed = !!canViewCosts && !!canViewEmployees && !isLoading;
  const query = useQuery({
    queryKey: ["assignment-hourly-cost", companyId, employeeId, allowed],
    enabled: allowed && !!companyId && !!employeeId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("employees")
        .select("id,user_id,costo_orario,gross_salary,inps_rate,monthly_hours")
        .eq("id", employeeId!).eq("company_id", companyId!).eq("is_active", true).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Dipendente non disponibile nell'azienda selezionata.");
      return reviewHourlyCost(data);
    },
  });
  return { ...query, allowed };
}
