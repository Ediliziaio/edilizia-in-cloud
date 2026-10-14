import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Compatibilità esplicita: non presume che il database remoto abbia già ricevuto la nuova migrazione. */
export function useRapportinoProtocollo(companyId: string | null, userId?: string) {
  return useQuery({
    queryKey: ["campo-rapportino-protocollo", companyId, userId],
    enabled: !!companyId && !!userId,
    staleTime: 15 * 60_000,
    retry: 1,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("campo_rapportini_protocollo");
      if (error?.code === "PGRST202" || error?.code === "42883") return 1;
      if (error) throw error;
      if (data !== 2) return 1;
      return 2;
    },
  });
}
