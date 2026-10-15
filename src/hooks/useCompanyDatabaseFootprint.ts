import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { parseDatabaseFootprint } from "@/lib/companyConsumption";
export function useCompanyDatabaseFootprint(requested = false) {
  const { user, role } = useAuth();
  return useQuery({
    queryKey: ["admin-company-database-footprint", user?.id, role],
    enabled: requested && Boolean(user?.id) && role === "super_admin",
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "admin_company_database_footprint" as never,
      );
      if (error) throw error;
      return parseDatabaseFootprint(data);
    },
    staleTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
