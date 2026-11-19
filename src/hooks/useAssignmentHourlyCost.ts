import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { reviewHourlyCost } from "@/lib/campo/laborCostReview";
import { leggiParametriCosto } from "@/hooks/useParametriCostoPersonale";

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
        .select("id,user_id,costo_orario,gross_salary,inps_rate,monthly_hours,profilo_costo,role_type,qualifica,area")
        .eq("id", employeeId!).eq("company_id", companyId!).eq("is_active", true).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Dipendente non disponibile nell'azienda selezionata.");
      return reviewHourlyCost(data, await leggiParametriCosto(companyId!));
    },
  });
  return { ...query, allowed };
}

/** One company-scoped read for the people in the forecast, including crew members. */
export function useCostiOrariPrevisione(ids: readonly string[]) {
  const { effectiveCompany } = useAuth();
  const { canViewCosts, canViewEmployees, isLoading } = usePermissions();
  const companyId = effectiveCompany?.id;
  const allowed = !!canViewCosts && !!canViewEmployees && !isLoading;
  const persone = [...new Set(ids)].sort();
  const query = useQuery({
    queryKey: ["assignment-hourly-forecast", companyId, persone],
    enabled: allowed && !!companyId && persone.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const gruppi = [];
      for (let i = 0; i < persone.length; i += 100) gruppi.push(persone.slice(i, i + 100));
      const [letture, parametri] = await Promise.all([
        Promise.all(gruppi.map((gruppo) => supabase.from("employees")
          .select("id,user_id,costo_orario,gross_salary,inps_rate,monthly_hours,profilo_costo,role_type,qualifica,area")
          .eq("company_id", companyId!).eq("is_active", true).in("id", gruppo))),
        leggiParametriCosto(companyId!),
      ]);
      const tariffe = new Map<string, number | null>();
      for (const { data, error } of letture) {
        if (error) throw error;
        for (const persona of data ?? []) tariffe.set(persona.id, reviewHourlyCost(persona, parametri).amount);
      }
      return tariffe;
    },
  });
  return { ...query, allowed };
}

/** Le squadre usano gli ID dei profili HR; costi e assegnazioni individuali usano gli ID dipendente. */
export function useDipendentiDeiProfili(ids: readonly string[]) {
  const { effectiveCompany } = useAuth();
  const { canViewEmployees, canViewCosts } = usePermissions();
  const azienda = effectiveCompany?.id;
  const profili = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ["assignment-crew-employee-ids", azienda, profili],
    enabled: !!azienda && !!canViewEmployees && !!canViewCosts && profili.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const lotti = [];
      for (let i = 0; i < profili.length; i += 100) lotti.push(profili.slice(i, i + 100));
      const letture = await Promise.all(lotti.map((id) => supabase.from("hr_profili").select("id,employee_id").eq("company_id", azienda!).in("id", id)));
      const mappa = new Map<string, string>();
      for (const { data, error } of letture) {
        if (error) throw error;
        for (const p of data ?? []) if (p.employee_id) mappa.set(p.id, p.employee_id);
      }
      return mappa;
    },
  });
}
