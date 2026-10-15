import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { parseEconomicsReport } from "@/lib/companyEconomicsSchema";
import type { EconomicsReport } from "@/lib/companyEconomics";
export function useCompanyEconomics() {
  const { user, role } = useAuth();
  return useQuery({
    queryKey: ["admin-company-economics", user?.id, role],
    enabled: Boolean(user?.id) && role === "super_admin",
    queryFn: async (): Promise<EconomicsReport> => {
      const { data, error } = await supabase.rpc(
        "admin_company_economics" as never,
      );
      if (error) throw error;
      return parseEconomicsReport(data);
    },
    staleTime: 300_000,
    retry: false,
  });
}
