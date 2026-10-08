// src/hooks/usePianoPagamenti.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";

// sal_records.installment_id è nei tipi generati, ma la lettura qui è minima e non ne ha bisogno.
export const chiaveSalLegami = (orderId: string | undefined) => ["sal-legami", orderId] as const;

/** Le rate della commessa a cui è legato un verbale SAL (SAL = rata): non si possono rifare da un modello senza perdere il legame. */
export function useSalLegatiARate(orderId: string | undefined) {
  const query = useQuery({
    queryKey: chiaveSalLegami(orderId),
    enabled: !!orderId,
    staleTime: 30_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("sal_records")
        .select("installment_id")
        .eq("order_id", orderId!)
        .not("installment_id", "is", null);
      if (error) throw error;
      return (data ?? []).map((r) => (r as { installment_id: string }).installment_id);
    },
  });
  return { rateConSal: new Set(query.data ?? []), isLoading: query.isLoading, isError: query.isError };
}

/**
 * Sostituisce le rate di una commessa (order_rate_sostituisci: lo stesso punto da cui passa il salvataggio
 * della commessa). Con l'id le rate esistenti si aggiornano al loro posto e tengono fattura e SAL; senza id
 * il piano si riscrive da capo.
 */
export function useSostituisciRate(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rate: ReadonlyArray<Record<string, unknown>>): Promise<number> => {
      const { data, error } = await supabase.rpc("order_rate_sostituisci" as never, { p_order_id: orderId, p_rate: rate } as never);
      if (error) throw error;
      return Number(data) || 0;
    },
    onSuccess: () => {
      toast.success("Piano dei pagamenti aggiornato");
      void qc.invalidateQueries({ queryKey: queryKeys.orders.installments(orderId) });
      void qc.invalidateQueries({ queryKey: queryKeys.orders.detail(orderId) });
      void qc.invalidateQueries({ queryKey: ["order-installments", orderId] });
      void qc.invalidateQueries({ queryKey: chiaveSalLegami(orderId) });
      void qc.invalidateQueries({ queryKey: ["orders"] });
      void qc.invalidateQueries({ queryKey: ["cashflow"] });
      void qc.invalidateQueries({ queryKey: ["forecast-installments"] });
    },
    onError: (e) => {
      const motivo = (e as { message?: string } | null)?.message;
      toast.error("Piano non aggiornato", { description: motivo || "Riprova tra qualche secondo." });
    },
  });
}
