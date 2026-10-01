import { supabase } from "@/integrations/supabase/client";

/** Read existing registries, with tenant scope and pagination. No derived writes. */
export async function loadIssuedCommitments(companyId: string, orderId: string) {
  if (!companyId || !orderId) throw new Error("Azienda o commessa mancante");
  const result: { subtotal: number | null }[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase.from("purchase_orders").select("id, subtotal")
      .eq("company_id", companyId).eq("order_id", orderId)
      .in("status", ["inviato", "confermato", "parziale", "ricevuto"])
      .order("id").range(page * 500, page * 500 + 499);
    if (error) throw error;
    result.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  return result;
}

export async function loadApprovedRevenueVariations(companyId: string, orderId: string) {
  if (!companyId || !orderId) throw new Error("Azienda o commessa mancante");
  const result: { impatto_economico: number | null }[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase.from("ordini_variazione").select("id, impatto_economico")
      .eq("company_id", companyId).eq("order_id", orderId).eq("status", "approvato")
      .order("id").range(page * 500, page * 500 + 499);
    if (error) throw error;
    result.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  if (result.some(r => r.impatto_economico == null || !Number.isFinite(Number(r.impatto_economico)))) throw new Error("Variazione approvata senza importo verificabile");
  return result;
}
