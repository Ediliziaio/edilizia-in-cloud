import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Il diritto segue il piano, anche quando cambia il prezzo del listino. */
export function useIncludedWhitelabel(planId: string | null | undefined) {
  const query = useQuery({
    queryKey: ["wl-plan-included", planId],
    enabled: !!planId,
    queryFn: async () => {
      const { data, error } = await supabase.from("subscription_plans")
        .select("slug, name").eq("id", planId!).maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
  return {
    isIncluded: query.data?.slug === "pro" || query.data?.slug === "enterprise",
    planName: query.data?.name ?? null,
    isLoading: query.isLoading,
  };
}
