import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

export function useTettiModelSupport() {
  const companyId = useEffectiveCompanyId();
  const query = useQuery({
    queryKey: ["tet-model-snapshot-support", companyId], enabled: !!companyId,
    staleTime: 60_000, retry: false,
    queryFn: async () => {
      // The table is not yet included in generated types. Probe without reading records.
      const { error } = await supabase.from("tet_progetti" as never)
        .select("modello_snapshot", { head: true }).eq("company_id", companyId!).limit(0);
      if (!error) return true;
      if (["42703", "PGRST204", "PGRST205", "42P01"].includes(error.code)) return false;
      throw error;
    },
  });
  return { supported: query.data === true, isLoading: !!companyId && query.isLoading, isError: query.isError };
}
