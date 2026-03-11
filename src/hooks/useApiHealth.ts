import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";

export type ApiServices = {
  whatsapp: boolean;
  googlemaps: boolean;
  meta: boolean;
  email: boolean;
  email_marketing: boolean;
  email_transactional: boolean;
  elevenlabs: boolean;
};

const defaultServices: ApiServices = {
  whatsapp: true,
  googlemaps: true,
  meta: true,
  email: true,
  email_marketing: true,
  email_transactional: true,
  elevenlabs: true,
};

export function useApiHealth() {
  const { data: services = defaultServices, isLoading } = useQuery({
    queryKey: queryKeys.apiHealth.all,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("check-api-health");
      if (error) {
        logger.warn("Failed to check API health:", error);
        return defaultServices;
      }
      return data as ApiServices;
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: 1,
  });

  return { services, isLoading };
}
