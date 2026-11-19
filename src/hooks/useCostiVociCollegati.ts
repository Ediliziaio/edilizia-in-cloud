import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { costiVociCollegati } from "@/lib/marginalita/costiVociCollegati";
import type { RigaAcquisto, MovimentoMagazzino } from "@/lib/orders/economiaFasi";

async function pagine<T>(fetch: (from: number, to: number) => PromiseLike<{data: T[] | null; error: unknown}>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await fetch(from, from + 499);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}

export function useCostiVociCollegati(orderId: string | undefined, open: boolean) {
  return useQuery({
    queryKey: ["costi-voci-collegati", orderId],
    enabled: !!orderId && open,
    staleTime: 120_000,
    queryFn: async () => {
      const [acquisti, movimenti] = await Promise.all([
        pagine<RigaAcquisto>((from, to) => supabase.from("purchase_order_items")
          .select("order_item_id,quantity,line_total,purchase_orders!inner(status,order_id)")
          .eq("purchase_orders.order_id", orderId!).in("purchase_orders.status", ["inviato", "confermato", "parziale", "ricevuto"])
          .not("order_item_id", "is", null).order("id").range(from, to)),
        pagine<MovimentoMagazzino>((from, to) => supabase.from("warehouse_movements")
          .select("order_item_id,movement_type,quantity,unit_cost,rientro_commessa,notes")
          .eq("order_id", orderId!).in("movement_type", ["carico", "scarico"])
          .order("id").range(from, to)),
      ]);
      return costiVociCollegati(acquisti, movimenti);
    },
  });
}
