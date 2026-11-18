import { costoConsuntivoRighe, type RigaAcquisto, type MovimentoMagazzino } from "@/lib/orders/economiaFasi";

/** Un costo collegato è parziale: non equivale al costo finale della voce. */
export function costiVociCollegati(acquisti: readonly RigaAcquisto[], movimenti: readonly MovimentoMagazzino[]) {
  const coperti = new Set(acquisti.flatMap(r => r.order_item_id ? [r.order_item_id] : []));
  // Solo consumi e veri resi: un carico iniziale non è un costo negativo.
  const pertinenti = movimenti.filter(r => r.movement_type === "scarico" || (r.movement_type === "carico" && r.rientro_commessa));
  const costi = costoConsuntivoRighe(acquisti, pertinenti);
  const incompleti = new Set<string>();
  for (const r of acquisti) if (r.order_item_id && (r.line_total === null || !Number.isFinite(Number(r.line_total)))) incompleti.add(r.order_item_id);
  for (const r of pertinenti) if (r.order_item_id && !coperti.has(r.order_item_id) && (r.unit_cost === null || Number(r.unit_cost) <= 0)) incompleti.add(r.order_item_id);
  return new Map([...costi].map(([id, importo]) => [id, {
    importo: incompleti.has(id) ? null : Math.round(importo * 100) / 100,
    fonte: coperti.has(id) ? "OdA emessi · impegno" : "Magazzino · consumo netto",
  }]));
}
