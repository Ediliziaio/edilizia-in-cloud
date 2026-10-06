import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { MovimentoMagazzino, RigaAcquisto } from "@/lib/orders/economiaFasi";

/**
 * Costi sostenuti per le righe della commessa (06/10/2026): le righe degli
 * ordini d'acquisto già emessi e i movimenti di magazzino, per il costo
 * consuntivo delle fasi (economiaFasi). Gli stessi stati e la stessa regola di
 * v_ordine_marginalita. Si leggono solo con il permesso sui costi.
 */
const STATI_EMESSI = ["inviato", "confermato", "parziale", "ricevuto"];

// purchase_order_items e il filtro sulla tabella collegata non sono nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useCostiMaterialiFasi(orderId: string | null | undefined, abilitato: boolean) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: ["costi-materiali-fasi", companyId, orderId],
    enabled: abilitato && !!orderId && !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<{ acquisti: RigaAcquisto[]; movimenti: MovimentoMagazzino[] }> => {
      const [acquisti, movimenti] = await Promise.all([
        db
          .from("purchase_order_items")
          .select("order_item_id, line_total, purchase_orders!inner(status, order_id)")
          // l'azienda oltre alla commessa: chi lavora su più aziende le vede tutte
          .eq("company_id", companyId)
          .eq("purchase_orders.order_id", orderId)
          .in("purchase_orders.status", STATI_EMESSI)
          .not("order_item_id", "is", null),
        db
          .from("warehouse_movements")
          .select("order_item_id, movement_type, quantity, unit_cost")
          .eq("order_id", orderId)
          .in("movement_type", ["carico", "scarico"])
          .not("order_item_id", "is", null),
      ]);
      if (acquisti.error) throw acquisti.error;
      if (movimenti.error) throw movimenti.error;
      return {
        acquisti: ((acquisti.data ?? []) as Array<{ order_item_id: string | null; line_total: number | null }>).map((r) => ({
          order_item_id: r.order_item_id,
          line_total: r.line_total != null ? Number(r.line_total) : 0,
        })),
        movimenti: ((movimenti.data ?? []) as MovimentoMagazzino[]).map((m) => ({
          order_item_id: m.order_item_id,
          movement_type: m.movement_type,
          quantity: Number(m.quantity) || 0,
          unit_cost: m.unit_cost != null ? Number(m.unit_cost) : null,
        })),
      };
    },
  });
}
