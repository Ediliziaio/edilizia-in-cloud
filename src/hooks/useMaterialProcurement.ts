import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { ProcurementItem, ProcurementCoverage } from "@/lib/orders/materialProcurement";

/** Explicit company scope, bounded IN clauses and pagination. Errors are not
 * an empty coverage: that would enable duplicate purchases. */
export async function loadMaterialCoverage(companyId: string, itemIds: string[]): Promise<ProcurementCoverage[]> {
  if (!companyId) throw new Error("Azienda non disponibile");
  const ids = [...new Set(itemIds)].sort();
  const result: ProcurementCoverage[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    for (let page = 0; ; page++) {
      const { data, error } = await supabase.from("purchase_order_items")
        .select("id, order_item_id, quantity, quantity_received, unit_of_measure, purchase_orders!inner(id, oda_number, status)")
        .eq("company_id", companyId).eq("purchase_orders.company_id", companyId)
        .in("order_item_id", ids.slice(offset, offset + 100))
        .neq("purchase_orders.status", "annullato")
        .order("id").range(page * 500, page * 500 + 499);
      if (error) throw error;
      const rows = (data ?? []) as unknown as ProcurementCoverage[];
      if (rows.some(r => !r.purchase_orders || !Number.isFinite(Number(r.quantity)) || Number(r.quantity) < 0 || !Number.isFinite(Number(r.quantity_received)) || Number(r.quantity_received) < 0)) {
        throw new Error("Quantità degli ordini non verificabili");
      }
      result.push(...rows);
      if (rows.length < 500) break;
    }
  }
  return result;
}

export function useMaterialProcurement(items: ProcurementItem[], enabled = true, fallbackCompanyId?: string) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? fallbackCompanyId;
  const ids = [...new Set(items.flatMap(i => i.id ? [i.id] : []))].sort();
  return useQuery({
    queryKey: ["material-procurement", companyId, ids],
    queryFn: () => loadMaterialCoverage(companyId!, ids),
    enabled: enabled && !!companyId,
    staleTime: 0,
  });
}

export interface UnmappedPurchaseOrder { id: string; oda_number: string; supplier_id: string }

/** Legacy/manual OdAs can have only a header link to the job. Never infer item
 * identity from a description or assume their quantities are uncovered. */
export async function loadUnmappedPurchaseOrders(companyId: string, orderId: string): Promise<UnmappedPurchaseOrder[]> {
  if (!companyId || !orderId) throw new Error("Azienda o commessa mancante");
  const orders: UnmappedPurchaseOrder[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase.from("purchase_orders")
      .select("id, oda_number, supplier_id").eq("company_id", companyId).eq("order_id", orderId)
      .neq("status", "annullato").order("id").range(page * 500, page * 500 + 499);
    if (error) throw error;
    orders.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  const mapped = new Set<string>();
  const unmapped = new Set<string>();
  for (let start = 0; start < orders.length; start += 100) {
    for (let page = 0; ; page++) {
      const { data, error } = await supabase.from("purchase_order_items").select("id, purchase_order_id, order_item_id")
        .eq("company_id", companyId).in("purchase_order_id", orders.slice(start, start + 100).map(o => o.id))
        .order("id").range(page * 500, page * 500 + 499);
      if (error) throw error;
      for (const row of data ?? []) {
        mapped.add(row.purchase_order_id);
        if (!row.order_item_id) unmapped.add(row.purchase_order_id);
      }
      if (!data || data.length < 500) break;
    }
  }
  return orders.filter(o => !mapped.has(o.id) || unmapped.has(o.id));
}

export function useUnmappedPurchaseOrders(orderId: string) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: ["material-procurement-unmapped", companyId, orderId],
    queryFn: () => loadUnmappedPurchaseOrders(companyId!, orderId),
    enabled: !!companyId && !!orderId,
    staleTime: 0,
  });
}
