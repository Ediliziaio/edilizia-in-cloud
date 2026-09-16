/**
 * Motivi di perdita per azienda: i sette standard (uguali per tutti) più
 * quelli che l'azienda aggiunge dal dialog di perdita o da
 * Impostazioni → Motivi di perdita, dove si rinominano e si tolgono.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import {
  MOTIVI_PERDITA_DEFAULT,
  nomeMotivoValido,
  unisciMotivi,
  type MotivoPerdita,
} from "@/lib/opportunita/motiviPerdita";

export { MOTIVI_PERDITA_DEFAULT, type MotivoPerdita };

export function useLossReasons() {
  const companyId = useEffectiveCompanyId();

  const query = useQuery({
    queryKey: ["loss-reasons", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<MotivoPerdita[]> => {
      const { data, error } = await supabase
        .from("opportunity_loss_reasons")
        .select("id, label, position")
        .eq("company_id", companyId!)
        .order("position");
      if (error) return MOTIVI_PERDITA_DEFAULT;
      // Il value dei motivi aziendali è l'etichetta stessa: i report
      // raggruppano per testo.
      return unisciMotivi(data ?? []);
    },
  });

  return { motivi: query.data ?? MOTIVI_PERDITA_DEFAULT, isLoading: query.isLoading };
}

/** Quante opportunità (non eliminate) portano ciascun motivo. */
export function useLossReasonUsage() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["loss-reasons-usage", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.rpc("motivi_perdita_utilizzo" as never);
      if (error) throw error;
      const righe = (data ?? []) as unknown as { motivo: string; opportunita: number }[];
      return Object.fromEntries(righe.map((r) => [r.motivo, r.opportunita]));
    },
  });
}

function useInvalidaMotivi() {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["loss-reasons", companyId] });
    queryClient.invalidateQueries({ queryKey: ["loss-reasons-usage", companyId] });
  };
}

export function useAddLossReason() {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();
  const invalida = useInvalidaMotivi();

  return useMutation({
    mutationFn: async (label: string) => {
      if (!companyId) throw new Error("Contesto azienda mancante");
      const attuali =
        queryClient.getQueryData<MotivoPerdita[]>(["loss-reasons", companyId]) ?? MOTIVI_PERDITA_DEFAULT;
      const pulita = nomeMotivoValido(label, attuali);
      const { data: esistenti } = await supabase
        .from("opportunity_loss_reasons")
        .select("position")
        .eq("company_id", companyId)
        .order("position", { ascending: false })
        .limit(1);
      const posizione = ((esistenti?.[0]?.position as number | undefined) ?? 0) + 1;
      const { error } = await supabase
        .from("opportunity_loss_reasons")
        .insert({ company_id: companyId, label: pulita, position: posizione });
      if (error) {
        if (error.code === "23505") throw new Error(`Esiste già il motivo «${pulita}»`);
        throw error;
      }
      return pulita;
    },
    onSuccess: invalida,
  });
}

export function useRenameLossReason() {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();
  const invalida = useInvalidaMotivi();

  return useMutation({
    mutationFn: async ({ id, label }: { id: string; label: string }) => {
      const attuali =
        queryClient.getQueryData<MotivoPerdita[]>(["loss-reasons", companyId]) ?? MOTIVI_PERDITA_DEFAULT;
      const pulita = nomeMotivoValido(label, attuali, id);
      // La RPC porta il nuovo nome anche sulle opportunità già perse.
      const { data, error } = await supabase.rpc("rinomina_motivo_perdita" as never, {
        p_id: id,
        p_label: pulita,
      } as never);
      if (error) throw error;
      return { label: pulita, opportunita: (data as unknown as number) ?? 0 };
    },
    onSuccess: invalida,
  });
}

export function useDeleteLossReason() {
  const invalida = useInvalidaMotivi();
  return useMutation({
    mutationFn: async (id: string) => {
      // Le opportunità già perse tengono il testo: i report non perdono storia.
      const { error } = await supabase.from("opportunity_loss_reasons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalida,
  });
}
