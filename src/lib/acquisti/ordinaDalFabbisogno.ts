/**
 * Ordinare dalla pagina del fabbisogno, su più commesse insieme.
 *
 * Fino al 07/11/2026 dal fabbisogno si poteva solo aprire una commessa alla
 * volta. Chi compra seleziona i materiali (anche di commesse diverse) e crea le
 * bozze: un ODA ha una sola commessa, quindi nasce una bozza per ogni coppia
 * commessa + fornitore. Ogni bozza passa dallo stesso percorso della scheda
 * commessa (createMaterialPurchaseOrder): righe e coperture si rileggono dal
 * database un attimo prima, si ordina solo il residuo vero, e una bozza che non
 * si può creare non ferma le altre: si dice quale e perché.
 */
import { supabase } from "@/integrations/supabase/client";
import { loadMaterialCoverage } from "@/hooks/useMaterialProcurement";
import { createMaterialPurchaseOrder } from "@/lib/orders/createMaterialPurchaseOrder";
import { pendingMaterials, type ProcurementItem } from "@/lib/orders/materialProcurement";
import type { RigaFabbisogno } from "./fabbisogno";

export interface GruppoOrdine {
  orderId: string;
  commessa: string | null;
  supplierId: string;
  fornitore: string | null;
  ids: string[];
}

/** Si può ordinare da qui: manca qualcosa e il fornitore c'è. */
export function ordinabile(r: RigaFabbisogno): boolean {
  return r.residuo > 0 && !!r.supplier_id && ["da_ordinare", "in_offerta"].includes(r.stato);
}

/** Le bozze da creare: una per commessa e fornitore, in ordine di commessa. */
export function gruppiDaOrdinare(righe: RigaFabbisogno[]): GruppoOrdine[] {
  const gruppi = new Map<string, GruppoOrdine>();
  for (const r of righe) {
    if (!ordinabile(r)) continue;
    const k = `${r.order_id}:${r.supplier_id}`;
    const g = gruppi.get(k) ?? { orderId: r.order_id, commessa: r.commessa, supplierId: r.supplier_id!, fornitore: r.fornitore, ids: [] };
    if (!g.ids.includes(r.order_item_id)) g.ids.push(r.order_item_id);
    gruppi.set(k, g);
  }
  return [...gruppi.values()].sort((a, b) =>
    (a.commessa ?? "").localeCompare(b.commessa ?? "") || (a.fornitore ?? "").localeCompare(b.fornitore ?? ""));
}

export type EsitoGruppo = GruppoOrdine & ({ ok: true; poId: string; n: number } | { ok: false; errore: string });

/** Le righe della commessa come le vuole createMaterialPurchaseOrder, col residuo vero di adesso. */
async function righeAttuali(companyId: string, g: GruppoOrdine): Promise<ProcurementItem[]> {
  const righe: ProcurementItem[] = [];
  // A blocchi di 100, come createMaterialPurchaseOrder: l'URL di PostgREST ha un limite.
  for (let da = 0; da < g.ids.length; da += 100) {
    const { data, error } = await supabase.from("order_items")
      .select("id, name, quantity, purchase_price, vat_rate, supplier_id, stock_item_id, status, posizioni, unita_misura, orders!inner(company_id)")
      .eq("order_id", g.orderId).eq("orders.company_id", companyId).in("id", g.ids.slice(da, da + 100));
    if (error) throw error;
    righe.push(...((data ?? []) as unknown as ProcurementItem[]));
  }
  const coverage = await loadMaterialCoverage(companyId, g.ids);
  return pendingMaterials(righe, coverage).filter((i) => i.supplier_id === g.supplierId);
}

export async function ordinaDalFabbisogno(input: {
  companyId: string;
  userId?: string;
  righe: RigaFabbisogno[];
}): Promise<EsitoGruppo[]> {
  const esiti: EsitoGruppo[] = [];
  // Una alla volta: createMaterialPurchaseOrder rifiuta due creazioni parallele sulla stessa commessa.
  for (const g of gruppiDaOrdinare(input.righe)) {
    try {
      const items = await righeAttuali(input.companyId, g);
      if (items.length === 0) {
        esiti.push({ ...g, ok: false, errore: "Già coperti da un altro ordine: niente da ordinare." });
        continue;
      }
      const r = await createMaterialPurchaseOrder({
        companyId: input.companyId, orderId: g.orderId, orderCode: g.commessa,
        supplierId: g.supplierId, userId: input.userId, items,
      });
      esiti.push({ ...g, ok: true, poId: r.poId, n: r.n });
    } catch (e) {
      esiti.push({ ...g, ok: false, errore: e instanceof Error ? e.message : String(e) });
    }
  }
  return esiti;
}
