import { warehouseCapabilities } from "@/lib/magazzino/protocolloMovimenti";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BatchScanEntry } from "@/components/warehouse/BatchBarcodeScanner";

export interface MovementAvailability { name: string; available: number; unit: string | null }

export function movementAvailabilityError(entries: BatchScanEntry[], stock: Map<string, MovementAvailability> | undefined): string | null {
  if (!stock) return "Disponibilità da verificare.";
  const requested = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.stockItemId) return "Associa tutti gli articoli prima di continuare.";
    requested.set(entry.stockItemId, (requested.get(entry.stockItemId) ?? 0) + entry.quantity);
  }
  for (const [id, quantity] of requested) {
    const item = stock.get(id);
    if (!item) return "Un articolo non è più presente nel magazzino scelto. Modifica le righe.";
    if (quantity - item.available > Number.EPSILON * Math.max(1, Math.abs(quantity), Math.abs(item.available)) * 4) return `${item.name}: richiesti ${quantity.toLocaleString("it-IT")}, utilizzabili ${item.available.toLocaleString("it-IT")}. Modifica le quantità; le altre righe sono conservate.`;
  }
  return null;
}

/** Controllo fresco prima dell'uscita. Include gli impegni della sola commessa scelta. */
export function useMovementAvailability(companyId: string | undefined, warehouseId: string | undefined, entries: BatchScanEntry[], orderId: string | undefined, enabled: boolean) {
  const ids = [...new Set(entries.flatMap((entry) => entry.stockItemId ? [entry.stockItemId] : []))].sort();
  return useQuery({
    queryKey: ["warehouse", "movement-availability", companyId, warehouseId, orderId, ids],
    enabled: enabled && !!companyId && !!warehouseId && ids.length > 0,
    staleTime: 0,
    retry: false,
    queryFn: async () => {
      const ownReserved = new Map<string, number>();
      if (orderId) {
        // Gli impegni della propria commessa possono essere prelevati; quelli altrui no.
        const protocol = await warehouseCapabilities(companyId!);
        // La colonna dei residui prenotati esiste solo nel servizio aggiornato.
        const { data, error } = await (supabase.from("order_items").select(
          protocol.version >= 2 ? "id,stock_item_id,quantity,warehouse_reserved_quantity,order:orders!inner(company_id)" : "id,stock_item_id,quantity,order:orders!inner(company_id)"))
          .eq("order_id", orderId).eq("order.company_id", companyId!).eq("fulfillment_status", "received");
        if (error) throw error;
        for (const row of (data ?? []) as unknown as { stock_item_id: string | null; quantity: number; warehouse_reserved_quantity?: number | null }[]) if (row.stock_item_id) ownReserved.set(row.stock_item_id, (ownReserved.get(row.stock_item_id) ?? 0) + Number(row.warehouse_reserved_quantity ?? row.quantity ?? 0));
      }
      const result = new Map<string, MovementAvailability>();
      for (let index = 0; index < ids.length; index += 50) {
        const { data, error } = await supabase.from("warehouse_stock")
          .select("id,name,quantity,quantity_available,quantity_reserved,unita_misura")
          .eq("company_id", companyId!).eq("warehouse_id", warehouseId!).in("id", ids.slice(index, index + 50));
        if (error) throw error;
        for (const row of data ?? []) result.set(row.id, {
          name: row.name,
          available: Math.min(Number(row.quantity), Number(row.quantity_available ?? 0) + Math.min(Number(row.quantity_reserved ?? 0), ownReserved.get(row.id) ?? 0)),
          unit: row.unita_misura,
        });
      }
      return result;
    },
  });
}
