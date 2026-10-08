import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SilvioPageContext } from "./useSilvioPageContext";

/** Display-only lookup: do not change or enrich the context sent to the model. */
export function useSilvioContextLabel(context: SilvioPageContext | null, companyId?: string, userId?: string, open = false) {
  const id = context?.entity_id;
  const query = useQuery({
    queryKey: ["silvio_context_label", companyId, userId, context?.entity_type, id],
    enabled: open && !!companyId && !!userId && context?.entity_type === "order" && !!id,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from("orders")
        .select("id, company_id, order_code, description, client_name")
        .eq("id", id!).eq("company_id", companyId!).abortSignal(signal).maybeSingle();
      if (error) throw error;
      if (!data || data.id !== id || data.company_id !== companyId) return null;
      const parts = [data.order_code, data.client_name, data.description]
        .filter((part): part is string => typeof part === "string" && !!part.trim()).map(part => part.trim());
      return [...new Set(parts)].join(" · ") || null;
    },
    staleTime: 30_000,
    retry: false,
  });
  // A disabled query can retain cached data; never show it outside the eligible scope.
  return open && companyId && userId && context?.entity_type === "order" && id && !query.isError ? query.data ?? null : null;
}
