import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizzaQuadro } from "@/lib/orders/quadroPagamenti";
import { registeredPayables } from "@/lib/orders/summaryIndicators";

/** Stessa fonte della scheda Incassi e pagamenti; quattro letture contemporanee al massimo. */
export function useOrdersPayables(companyId: string | undefined, orderIds: readonly string[], enabled: boolean) {
  return useQuery({
    queryKey: ["orders-registered-payables", companyId, orderIds],
    enabled: !!companyId && enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async ({ signal }) => {
      let next = 0;
      let total = 0;
      await Promise.all(Array.from({ length: Math.min(4, orderIds.length) }, async () => {
        while (next < orderIds.length) {
          signal.throwIfAborted();
          const id = orderIds[next++];
          const { data, error } = await supabase.rpc("commessa_quadro_pagamenti", { p_order_id: id }).abortSignal(signal);
          if (error) throw error;
          const quadro = normalizzaQuadro(data);
          if (!quadro) throw new Error("Costi da pagare non disponibili");
          total += registeredPayables(quadro.uscite);
        }
      }));
      return Math.round(total * 100) / 100;
    },
  });
}
