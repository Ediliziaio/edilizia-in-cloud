import { supabase } from "@/integrations/supabase/client";
import { loadMaterialCoverage, loadUnmappedPurchaseOrders } from "@/hooks/useMaterialProcurement";
import { pendingMaterials, procurementLines, type ProcurementItem } from "./materialProcurement";
import { logger } from "@/utils/logger";

export class IncompletePurchaseOrderError extends Error {
  constructor(public poId: string) {
    super("Bozza creata, ma il salvataggio delle righe non è confermato. Apri e verifica questa bozza prima di riprovare.");
  }
}
const inFlight = new Set<string>();

/** Shared by both commessa entry points. This is a preflight, NOT a database
 * transaction: simultaneous purchases on different devices still need an RPC. */
export async function createMaterialPurchaseOrder(input: {
  companyId: string; orderId: string; orderCode?: string | null;
  supplierId: string; userId?: string; items: ProcurementItem[];
}) {
  const { companyId, orderId, supplierId } = input;
  if (!companyId || !supplierId || !orderId) throw new Error("Azienda, commessa o fornitore mancanti");
  const key = `${companyId}:${orderId}`;
  if (inFlight.has(key)) throw new Error("Creazione già in corso per questa commessa");
  inFlight.add(key);
  try {
    const ids = [...new Set(input.items.flatMap(i => i.id && i.supplier_id === supplierId ? [i.id] : []))];
    if (!ids.length) throw new Error("Nessun articolo da ordinare per questo fornitore");
    const unmapped = await loadUnmappedPurchaseOrders(companyId, orderId);
    const existing = unmapped.filter(o => o.supplier_id === supplierId);
    if (existing.length) throw new Error(`Verifica prima ${existing.map(o => o.oda_number).join(", ")}: contiene righe non collegate agli articoli o è una bozza senza righe.`);
    const current: ProcurementItem[] = [];
    for (let start = 0; start < ids.length; start += 100) {
      const { data, error } = await supabase.from("order_items")
        .select("id, name, quantity, purchase_price, vat_rate, supplier_id, stock_item_id, status, posizioni, orders!inner(company_id)")
        .eq("order_id", orderId).eq("orders.company_id", companyId).in("id", ids.slice(start, start + 100));
      if (error) throw error;
      current.push(...(data ?? []) as unknown as ProcurementItem[]);
    }
    const coverage = await loadMaterialCoverage(companyId, ids);
    const candidates = pendingMaterials(current, coverage).filter(i => i.supplier_id === supplierId);
    const snapshot = (i: ProcurementItem) => JSON.stringify([i.name, Number(i.quantity), Number(i.purchase_price ?? 0), Number(i.vat_rate ?? 22), i.posizioni ?? []]);
    if (candidates.length !== ids.length || candidates.some(i => snapshot(i) !== snapshot(input.items.find(p => p.id === i.id)!))) {
      throw new Error("Articoli o quantità già coperte sono cambiati. Aggiorna e verifica la selezione prima di creare l’OdA.");
    }
    const lines = procurementLines(candidates);
    const { data: po, error } = await supabase.from("purchase_orders").insert({
      company_id: companyId, supplier_id: supplierId, order_id: orderId,
      created_by: input.userId, status: "bozza",
      // The existing BEFORE INSERT trigger generates a company-safe number.
      oda_number: "",
      notes: `Generato da commessa ${input.orderCode || orderId}`,
    }).select("id").single();
    if (error) throw error;
    if (!po?.id) throw new Error("Creazione della bozza non confermata: verifica gli OdA prima di riprovare");
    try {
      const { error: linesError } = await supabase.from("purchase_order_items").insert(lines.map((line, index) => ({
        ...line, company_id: companyId, purchase_order_id: po.id, sort_order: index,
      })));
      if (linesError) throw linesError;
    } catch {
      // Never delete a possibly saved order after an ambiguous network error.
      throw new IncompletePurchaseOrderError(po.id);
    }
    // A draft reserves quantity in our planner but is not an order sent to the
    // supplier. In particular, do NOT set order_items.status = 'ordinato'.
    // Audit failure must not pretend the successful purchase creation failed.
    try {
      const { error: diaryError } = await supabase.from("order_events" as never).insert({
        company_id: companyId, order_id: orderId, event_type: "ordine_fornitore_creato",
        payload: { po_id: po.id, supplier_id: supplierId, order_code: input.orderCode, status: "bozza" },
      } as never);
      if (diaryError) logger.error("[createMaterialPurchaseOrder] Evento diario non salvato", diaryError);
    } catch (error) { logger.error("[createMaterialPurchaseOrder] Diario non disponibile", error); }
    return { poId: po.id, n: candidates.length };
  } finally {
    inFlight.delete(key);
  }
}
