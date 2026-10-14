import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { giornoLocale, type RapportinoFasi } from "@/lib/orders/cronoprogramma";

/**
 * Dati del cronoprogramma che le fasi non hanno (06/10/2026): i rapportini
 * inviati o approvati con le fasi lavorate (le date reali) e la firma del
 * preventivo da cui nasce la commessa (la data del contratto).
 */
export function useCronoprogramma(orderId: string | null | undefined, quoteId: string | null | undefined) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const rapportini = useQuery({
    queryKey: ["cronoprogramma-rapportini", orderId, companyId],
    enabled: !!orderId && !!companyId,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async ({ signal }): Promise<RapportinoFasi[]> => {
      // No global polling/count: one request for a normal job, further pages only
      // when necessary. Stable ordering prevents silently dropping a long history.
      const pageSize = 500;
      const rapportini: RapportinoFasi[] = [];
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from("campo_rapportini")
          .select("id, data_lavoro, stato, fasi_lavorate")
          .eq("order_id", orderId!)
          .eq("company_id", companyId!)
          .in("stato", ["inviato", "approvato"])
          .order("data_lavoro").order("id")
          .range(offset, offset + pageSize - 1)
          .abortSignal(signal);
        if (error) throw error;
        rapportini.push(...(data ?? []) as RapportinoFasi[]);
        if ((data?.length ?? 0) < pageSize) return rapportini;
      }
    },
  });

  const firma = useQuery({
    queryKey: ["cronoprogramma-firma-preventivo", quoteId, companyId],
    enabled: !!quoteId && !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.from("quotes").select("signed_at").eq("id", quoteId!).eq("company_id", companyId!).maybeSingle();
      // Senza accesso ai preventivi la firma non si legge: vale l'apertura della commessa.
      if (error || !data?.signed_at) return null;
      return giornoLocale(data.signed_at);
    },
  });

  return {
    rapportini: rapportini.data ?? [],
    firmaPreventivo: firma.data ?? null,
    isLoading: rapportini.isLoading,
    isError: rapportini.isError,
    refetch: rapportini.refetch,
  };
}
