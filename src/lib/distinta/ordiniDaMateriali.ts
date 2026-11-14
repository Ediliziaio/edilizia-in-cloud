/**
 * Dai materiali salvati agli ordini (14/11/2026): i materiali ancora da ordinare
 * per fornitore, col totale. Regole pure: le usa DopoIlSalvataggio.
 */
import type { ProcurementItem } from "@/lib/orders/materialProcurement";

export interface GruppoFornitore { supplierId: string; nome: string; righe: ProcurementItem[]; totale: number; senzaPrezzo: number }

/** I materiali da ordinare per fornitore, dal totale più alto; quelli senza fornitore a parte. */
export function raggruppaPerFornitore(materiali: ProcurementItem[], fornitori: Map<string, string>): { gruppi: GruppoFornitore[]; senzaFornitore: ProcurementItem[] } {
  const perFornitore = new Map<string, ProcurementItem[]>();
  const senzaFornitore: ProcurementItem[] = [];
  for (const m of materiali) {
    if (!m.supplier_id) { senzaFornitore.push(m); continue; }
    perFornitore.set(m.supplier_id, [...(perFornitore.get(m.supplier_id) ?? []), m]);
  }
  const gruppi = [...perFornitore].map(([supplierId, righe]) => ({
    supplierId,
    nome: fornitori.get(supplierId) ?? "Fornitore",
    righe,
    totale: Math.round(righe.reduce((t, r) => t + Number(r.quantity) * Number(r.purchase_price ?? 0), 0) * 100) / 100,
    senzaPrezzo: righe.filter((r) => !(Number(r.purchase_price) > 0)).length,
  })).sort((a, b) => b.totale - a.totale);
  return { gruppi, senzaFornitore };
}
