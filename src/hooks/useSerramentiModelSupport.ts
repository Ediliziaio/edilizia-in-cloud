import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

/** Read-only capability probe: no schema changes and no quote created as a test. */
export function useSerramentiModelSupport() {
  const companyId = useEffectiveCompanyId();
  const query = useQuery({
    queryKey: ["sr-model-snapshot-support", companyId], enabled: !!companyId,
    staleTime: 60_000, retry: false,
    queryFn: async () => {
      const { error } = await supabase.from("sr_progetti")
        .select("modello_snapshot", { head: true }).eq("company_id", companyId!).limit(0);
      if (!error) return true;
      if (error.code === "42703" || error.code === "PGRST204") return false;
      throw error;
    },
  });
  return { supported: query.data === true, isLoading: !!companyId && query.isLoading, isError: query.isError };
}
