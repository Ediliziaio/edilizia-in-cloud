/**
 * La finestra dell'articolo di magazzino aperta da un elenco che ha solo l'id (26/11/2026):
 * Valore → Dettaglio per articolo e Movimenti. Legge l'articolo, il fornitore e il magazzino, poi
 * mostra la stessa finestra delle Giacenze (numeri, anagrafica, impegni, lotti, movimenti).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { StockItem } from "@/types/warehouse";
import { StockMovementHistoryDialog } from "./StockMovementHistoryDialog";

export function ArticoloMagazzinoDialog({ stockItemId, onClose }: { stockItemId: string | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["wh", "articolo-dettaglio", stockItemId],
    enabled: !!stockItemId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouse_stock").select("*").eq("id", stockItemId!).maybeSingle();
      if (error) throw error;
      const item = data as unknown as StockItem | null;
      if (!item) return null;
      const [fornitore, magazzino] = await Promise.all([
        item.supplier_id ? supabase.from("suppliers").select("name").eq("id", item.supplier_id).maybeSingle() : Promise.resolve({ data: null }),
        item.warehouse_id ? supabase.from("warehouses").select("name").eq("id", item.warehouse_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      return {
        item,
        supplierName: (fornitore.data as { name?: string } | null)?.name ?? undefined,
        warehouseName: (magazzino.data as { name?: string } | null)?.name ?? undefined,
      };
    },
  });
  return (
    <StockMovementHistoryDialog
      open={!!stockItemId && !!q.data?.item}
      onOpenChange={(aperta) => { if (!aperta) onClose(); }}
      item={q.data?.item ?? null}
      supplierName={q.data?.supplierName}
      warehouseName={q.data?.warehouseName}
    />
  );
}
