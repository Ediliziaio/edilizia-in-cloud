import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { allPaymentRows } from "./useSupplierPayments";
import { useEffectiveCompanyId } from "./useEffectiveCompanyId";
import { useForecastLedger } from "./useForecastLedger";
import type { PagamentoEffettivo } from "@/lib/orders/generali/cassaOperazione";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { leggiCostiOperazione, quotaCostoOperazione } from "@/lib/orders/generali/costiOperazione";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
export function useCassaOperazione(r: RiepilogoGenerale) {
  const companyId = useEffectiveCompanyId();
  const ids = [r.generale.id, ...r.figlie.map((f) => f.id)];
  const previsionale = useForecastLedger();
  const registrati = useQuery({
    queryKey: ["generale-cassa-effettiva", companyId, ids.join(",")],
    enabled: !!companyId && r.permessi.costi && r.permessi.importi,
    queryFn: async () => {
      const costi = await leggiCostiOperazione(companyId!, ids);
      const quote = new Map(costi.map((c) => [c.id, quotaCostoOperazione(c, ids)]));
      const rows: (PagamentoEffettivo & { cost_id: string | null })[] = [];
      const campi = "id,entry_date,amount,direction,reversal_of,category,notes,cost_id";
      const leggi = async (colonna: string, valori: string[]) => {
        for (let i = 0; i < valori.length; i += 40)
          rows.push(
            ...(await allPaymentRows<PagamentoEffettivo & { cost_id: string | null }>((a, b) =>
              db
                .from("prima_nota_entries")
                .select(campi)
                .eq("company_id", companyId)
                .in(colonna, valori.slice(i, i + 40))
                .order("id")
                .range(a, b),
            )),
          );
      };
      await leggi("order_id", ids);
      await leggi(
        "cost_id",
        costi.map((c) => c.id),
      );
      await leggi("reversal_of", [...new Set(rows.map((r) => r.id))]);
      const uniche = [...new Map(rows.map((r) => [r.id, r])).values()];
      return {
        quote,
        righe: uniche.map((r) => ({
          ...r,
          amount:
            r.cost_id && quote.has(r.cost_id)
              ? Math.round(Number(r.amount) * quote.get(r.cost_id)! * 100) / 100
              : r.amount,
        })),
      };
    },
  });
  const quote = registrati.data?.quote;
  const previsti = (previsionale.data?.movements ?? []).flatMap((m) => {
    if (m.costId && quote?.has(m.costId)) {
      const quota = quote.get(m.costId)!;
      return quota > 0 ? [{ ...m, cents: Math.round(m.cents * quota) }] : [];
    }
    return m.orderId && ids.includes(m.orderId) ? [m] : [];
  });
  return {
    registrati: registrati.data?.righe ?? [],
    previsti,
    isLoading: registrati.isLoading || previsionale.isLoading,
    isError: registrati.isError || previsionale.isError,
    avvisi: previsionale.data?.issues ?? [],
    refetch: () => {
      void registrati.refetch();
      void previsionale.refetch();
    },
  };
}
