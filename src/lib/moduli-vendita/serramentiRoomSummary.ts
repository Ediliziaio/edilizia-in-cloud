import type { SrSerramentoRow } from "@/types/serramenti";

/** Group only explicit room labels. Never infer openings or merge product quantities. */
export function serramentiRoomSummary(rows: readonly SrSerramentoRow[]) {
  const rooms = new Map<string, { name: string; products: { label: string; quantity: number }[] }>();
  for (const row of rows) {
    const name = row.ambiente?.trim() || "Ambiente da indicare";
    const room = rooms.get(name) ?? { name, products: [] };
    const product = row.tipologia_label?.trim() || row.tipologia || "Prodotto da specificare";
    const dimensions = row.larghezza_mm != null && row.altezza_mm != null
      ? ` · ${row.larghezza_mm} × ${row.altezza_mm} mm` : "";
    room.products.push({ label: `${product}${dimensions}`, quantity: row.quantita });
    rooms.set(name, room);
  }
  return [...rooms.values()];
}
