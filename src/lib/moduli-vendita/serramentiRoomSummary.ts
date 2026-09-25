import type { SrSerramentoRow } from "@/types/serramenti";

/** Group only explicit room labels. Never infer openings or merge product quantities. */
export function serramentiRoomSummary(rows: readonly SrSerramentoRow[]) {
  const rooms = new Map<string, { name: string; products: { label: string; quantity: number }[] }>();
  for (const row of rows) {
    const name = row.ambiente?.trim() || "Ambiente da indicare";
    const room = rooms.get(name) ?? { name, products: [] };
    room.products.push({ label: row.tipologia_label?.trim() || row.tipologia || "Prodotto da specificare", quantity: row.quantita });
    rooms.set(name, room);
  }
  return [...rooms.values()];
}
