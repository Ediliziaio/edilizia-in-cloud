import type { StockItem } from "@/types/warehouse";
import type { BatchScanEntry } from "@/components/warehouse/BatchBarcodeScanner";

export function rigaMovimentoIniziale(item: StockItem, withPrice: boolean): BatchScanEntry {
  return { clientUuid: crypto.randomUUID(), scannedAt: Date.now(), stockItemId: item.id,
    itemName: item.name, quantity: 1, trackingMode: item.tracking_mode ?? "fungible",
    serialNumbers: [], rawCode: item.barcode ?? item.internal_code ?? "", unitOfMeasure: item.unita_misura,
    ...(withPrice && !item.prezzo_da_definire ? { purchasePrice: Number(item.unit_cost) } : {}) };
}
interface PreparedMaterial {
  stock_item_id: string; name: string; reserved_for_order: number; physical: number; free: number; total_reserved: number;
  product_code: string; tracking_mode: "fungible" | "serialized"; unit?: string | null;
}
/** Propone solo gli impegni ancora aperti, aggregando le righe dello stesso articolo. */
export function materialiPrenotatiDaPrelevare(rows: PreparedMaterial[]): BatchScanEntry[] {
  const groups = new Map<string, { row: PreparedMaterial; reserved: number }>();
  for (const row of rows) {
    if (!Number.isFinite(row.reserved_for_order) || row.reserved_for_order <= 0) continue;
    const group = groups.get(row.stock_item_id);
    groups.set(row.stock_item_id, { row, reserved: (group?.reserved ?? 0) + row.reserved_for_order });
  }
  return [...groups.values()].flatMap(({ row, reserved }): BatchScanEntry[] => {
    const quantity = Math.max(0, Math.min(reserved, row.physical, row.free + Math.min(row.total_reserved, reserved)));
    if (!Number.isFinite(quantity) || quantity <= 0) return [];
    return [{ clientUuid: crypto.randomUUID(), scannedAt: Date.now(), stockItemId: row.stock_item_id,
      itemName: row.name, quantity, serialNumbers: [], rawCode: row.product_code,
      trackingMode: row.tracking_mode, unitOfMeasure: row.unit }];
  });
}
