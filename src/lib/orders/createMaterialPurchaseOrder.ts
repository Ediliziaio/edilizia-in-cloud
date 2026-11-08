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

/**
 * Quanto ordinare adesso di un articolo: tutto il residuo (`item.quantity`, già
 * ridotto da pendingMaterials) o una parte. Mai di più, mai zero; un articolo
 * con la distinta delle posizioni si ordina intero, perché le righe d'ordine
 * sono le sue posizioni.
 */
export function quantitaDaOrdinare(item: ProcurementItem, scelta: number | undefined): ProcurementItem {
  if (scelta == null || item.posizioni?.length) return item;
  const residuo = Number(item.quantity);
  if (!Number.isFinite(scelta) || scelta <= 0) throw new Error(`«${item.name}»: la quantità da ordinare deve essere maggiore di zero.`);
  if (scelta > residuo + 1e-9) throw new Error(`«${item.name}»: se ne possono ordinare al massimo ${residuo.toLocaleString("it-IT", { maximumFractionDigits: 4 })}, cioè quanti ne mancano.`);
  return { ...item, quantity: Math.round(scelta * 10000) / 10000 };
}

/** Preflight condiviso dai due ingressi; testata e righe si salvano nella stessa transazione server. */
export async function createMaterialPurchaseOrder(input: {
  companyId: string; orderId: string; orderCode?: string | null;
  supplierId: string; userId?: string; items: ProcurementItem[];
  /** Ordine parziale: quanto ordinare adesso per articolo (mai oltre il residuo). Senza, tutto il residuo. */
  quantita?: Record<string, number>;
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
        .select("id, name, quantity, purchase_price, vat_rate, supplier_id, stock_item_id, status, posizioni, unita_misura, orders!inner(company_id)")
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
    const daOrdinare = candidates.map((i) => quantitaDaOrdinare(i, input.quantita?.[i.id!]));
    const lines = procurementLines(daOrdinare);
    const { data, error } = await supabase.rpc("crea_oda_materiali_atomica" as never, {
      p_company_id: companyId, p_order_id: orderId, p_supplier_id: supplierId, p_righe: lines,
    } as never);
    if (error) {
      if (error.code === "PGRST202") throw new Error("Il salvataggio atomico degli ordini non è ancora attivo sul server. Nessuna bozza parziale è stata creata.");
      throw new Error(`Creazione non confermata: verifica gli ordini prima di riprovare. ${error.message}`);
    }
    const result = data as unknown as { poId?: unknown } | null;
    if (!result || typeof result.poId !== "string" || !result.poId) {
      throw new Error("Creazione non confermata: verifica gli ordini prima di riprovare");
    }
    const po = { id: result.poId };
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
    return { poId: po.id, n: daOrdinare.length };
  } finally {
    inFlight.delete(key);
  }
}
