import { isSottoScorta, type StockItem } from "@/types/warehouse";
import type { WarehouseInventoryMetricKey } from "@/components/warehouse/WarehouseInventoryStats";
import type { InArrivoArticolo } from "@/hooks/useMagazzinoRiepilogo";

export type InventoryFilter = "all" | WarehouseInventoryMetricKey;
export const INVENTORY_FILTER_LABELS: Record<InventoryFilter, string> = {
  all: "Tutti gli articoli", inventory_value: "Articoli con giacenza", stock_items: "Articoli a stock",
  low_stock: "Sotto scorta", incoming_7d: "Articoli in arrivo", missing_cost: "Giacenze senza costo",
};

/** Gli stessi criteri delle KPI; il perimetro del magazzino arriva dalla query. */
export function filtraInventario(items: StockItem[], filter: InventoryFilter, incoming?: Map<string, InArrivoArticolo>) {
  return items.filter((item) => {
    switch (filter) {
      case "stock_items":
      case "inventory_value": return Number(item.quantity) > 0;
      case "low_stock": return isSottoScorta(item);
      case "missing_cost": return Number(item.quantity) > 0 && Number(item.unit_cost ?? 0) === 0;
      case "incoming_7d": return Number(incoming?.get(item.id)?.quantita ?? 0) > 0;
      default: return true;
    }
  });
}
