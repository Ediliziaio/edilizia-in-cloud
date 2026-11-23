import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { VoceAnalisi } from "@/lib/preventivi/analisiCosti";
import { riferimentiStoriciSchema } from "@/lib/preventivi/stimaCostiStorici";

export function letturaRiferimentiCosti(companyId: string, voce: VoceAnalisi, preventivoId?: string) {
  const codice = voce.codice?.trim() || null;
  const descrizione = voce.descrizione.trim();
  return queryOptions({
    queryKey: ["preventivo-riferimenti-storici", companyId, preventivoId, codice, voce.tariffaId, descrizione],
    enabled: Boolean(companyId && voce.descrizione.trim()),
    staleTime: 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc("preventivo_riferimenti_storici", {
        p_azienda: companyId, p_codice: codice, p_descrizione: descrizione,
        p_tariffa: voce.tariffaId || null, p_preventivo: preventivoId || null,
      }).abortSignal(signal);
      if (error) throw error;
      return riferimentiStoriciSchema.parse(data);
    },
  });
}

export function useRiferimentiCostiPreventivo(companyId: string, voce: VoceAnalisi, preventivoId?: string) {
  return useQuery(letturaRiferimentiCosti(companyId, voce, preventivoId));
}
