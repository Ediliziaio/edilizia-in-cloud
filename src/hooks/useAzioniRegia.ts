/**
 * Le tre azioni dirette della regia operativa (/azienda), per chi può
 * modificare le commesse:
 * - «Segna finita»: porta la commessa nella fase che chiude il lavoro, con la
 *   stessa RPC dell'elenco commesse (storico, eventi, avvisi compresi);
 * - «Sposta la fine lavori» di una commessa in ritardo;
 * - «Sposta l'arrivo» di un ordine fornitore in ritardo.
 * La ricezione della merce no: carica il magazzino e crea il costo, e resta
 * nella scheda dell'ordine fornitore.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";

// la RLS non dà errore quando non lascia scrivere: restituisce zero righe
function almenoUna(data: unknown[] | null, cosa: string) {
  if (!data || data.length === 0) throw new Error(`Non hai il permesso di modificare ${cosa}.`);
}

export function useAzioniRegia() {
  const queryClient = useQueryClient();
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const dopo = (messaggio: string) => {
    queryClient.invalidateQueries({ queryKey: ["regia-operativa"] });
    queryClient.invalidateQueries({ queryKey: ["cruscotto"] });
    // le stesse chiavi dell'elenco commesse (refreshOrderScope) e degli ordini
    // fornitore: altrimenti elenco e calendario mostravano la data vecchia
    for (const key of ["orders", "orders-global-stats", "orders-pipeline", "orders-monthly-sales-chart"])
      void queryClient.invalidateQueries({ queryKey: [key] });
    for (const queryKey of [queryKeys.calendarOrders.all, queryKeys.dashboard.all, queryKeys.cruscotto.all, queryKeys.purchaseOrders.all])
      void queryClient.invalidateQueries({ queryKey });
    toast.success(messaggio);
  };
  const errore = (e: unknown) => toast.error(e instanceof Error ? e.message : "Modifica non riuscita");

  const segnaFinita = useMutation({
    mutationFn: async ({ orderId, statusId }: { orderId: string; statusId: string }) => {
      const { error } = await supabase.rpc("change_order_status", {
        p_order_id: orderId, p_new_status_id: statusId, p_changed_by: user?.id || "",
      });
      if (error) throw error;
    },
    onSuccess: () => dopo("Commessa segnata come finita"),
    onError: errore,
  });

  const spostaFineLavori = useMutation({
    mutationFn: async ({ orderId, giorno }: { orderId: string; giorno: string }) => {
      const { data, error } = await supabase.from("orders").update({ work_end_date: giorno })
        .eq("id", orderId).eq("company_id", companyId!).select("id");
      if (error) throw error;
      almenoUna(data, "questa commessa");
    },
    onSuccess: () => dopo("Fine lavori spostata"),
    onError: errore,
  });

  const spostaArrivo = useMutation({
    mutationFn: async ({ odaId, giorno }: { odaId: string; giorno: string }) => {
      const { data, error } = await supabase.from("purchase_orders").update({ expected_delivery_date: giorno })
        .eq("id", odaId).eq("company_id", companyId!).select("id");
      if (error) throw error;
      almenoUna(data, "questo ordine fornitore");
    },
    onSuccess: () => dopo("Data di arrivo spostata"),
    onError: errore,
  });

  return { segnaFinita, spostaFineLavori, spostaArrivo };
}
