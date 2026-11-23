import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";

/**
 * Pagare una fattura ricevuta che non è ancora contabilizzata (23/11/2026).
 *
 * Il pannello dei pagamenti (dovuto, pagato, residuo, movimenti di banca,
 * «Registra pagamento») lavora sul COSTO della fattura. Le fatture non ancora
 * contabilizzate non ce l'hanno, e finora mostravano un'altra cosa: il vecchio
 * «Segna pagata», senza residuo né banca. Da una fattura all'altra lo stesso
 * riepilogo cambiava faccia.
 *
 * Una fattura che si paga è un costo: qui la si contabilizza (la stessa RPC del
 * pulsante «Contabilizza», che non crea mai un costo doppio) e si restituisce
 * l'id del costo, su cui il chiamante apre il pannello.
 */
export function useContabilizzaPerPagare() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fatturaId: string): Promise<string> => {
      const { data, error } = await (supabase as any).rpc("contabilizza_fattura_ricevuta", { p_fattura_id: fatturaId });
      if (error) throw error;
      const costo = (data as { company_cost_id?: string | null } | null)?.company_cost_id;
      if (!costo) throw new Error("La fattura non ha prodotto un costo: aprila e contabilizzala a mano.");
      return costo;
    },
    onSuccess: (_costo, _fattura) => {
      refreshFinancialQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ["fattura-ricevuta-riepilogo"] });
      queryClient.invalidateQueries({ queryKey: ["fatture-ricevute"] });
    },
    onError: (e: Error) => toast.error("Non riesco a preparare il pagamento", { description: e.message }),
  });
}
