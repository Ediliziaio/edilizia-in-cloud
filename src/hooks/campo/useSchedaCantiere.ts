import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCommessaCampoSync } from "@/hooks/useCommessaCampoSync";
import { supabase } from "@/integrations/supabase/client";
import type { SchedaCantiere, SezioneSchedaCantiere } from "@/lib/campo/schedaCantiere";

export function useCantieriTecnici(abilitato = true) {
  const { effectiveCompany, profile, user } = useAuth();
  const companyId = effectiveCompany?.id ?? profile?.company_id;
  return useQuery({
    queryKey: ["campo-cantieri-tecnici", companyId, user?.id],
    enabled: abilitato && !!companyId && !!user?.id,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc("campo_cantieri_tecnici", { p_azienda: companyId! }).abortSignal(signal);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSchedaCantiere(orderId: string | undefined, sezione: SezioneSchedaCantiere) {
  const { effectiveCompany, profile, user } = useAuth();
  const companyId = effectiveCompany?.id ?? profile?.company_id;
  const qc = useQueryClient();
  const ambito = ["campo-scheda-cantiere", orderId, companyId, user?.id];
  const query = useQuery({
    queryKey: [...ambito, sezione],
    enabled: !!orderId && !!companyId && !!user?.id,
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: false,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc("campo_scheda_cantiere", {
        p_azienda: companyId!, p_ordine: orderId!, p_sezione: sezione,
      }).abortSignal(signal);
      if (error) throw error;
      return data;
    },
  });
  const altraSezione = sezione === "piano" ? "documenti" : "piano";
  const scheda = query.isError ? undefined
    : query.data ?? qc.getQueryData<SchedaCantiere>([...ambito, altraSezione]);
  useCommessaCampoSync(orderId, companyId, !!query.data && !query.isError);
  return { query, cantiere: scheda?.cantiere, permessi: scheda?.permessi, companyId, userId: user?.id };
}
