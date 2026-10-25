import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import {
  saveLocalFvConfiguration,
  type AtomicRpc,
  type FvConfigurationPayload,
} from "./configurazioneAtomica";
export function useConfigurazioneAtomica() {
  const companyId = useEffectiveCompanyId(),
    cache = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (payload: FvConfigurationPayload) => {
      if (!companyId || payload.p_company_id !== companyId)
        throw new Error("L’azienda attiva è cambiata.");
      return saveLocalFvConfiguration(
        ((name, args) =>
          supabase.rpc(name as never, args as never)) as AtomicRpc,
        payload,
        import.meta.env.VITE_SUPABASE_URL,
      );
    },
    onSuccess: async (_result, payload) => {
      await cache.invalidateQueries({
        queryKey: ["fv"],
        predicate: (query) =>
          query.queryKey.includes(payload.p_project_id) &&
          query.queryKey.includes(companyId),
      });
    },
  });
}
