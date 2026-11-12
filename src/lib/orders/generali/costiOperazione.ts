import { supabase } from "@/integrations/supabase/client";
import { allPaymentRows } from "@/hooks/useSupplierPayments";
import { quoteDelCosto } from "@/lib/fatturazione/ripartizioneFattura";
export interface CostoOperazione {
  id: string;
  order_id: string | null;
  allocations: unknown;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
export async function leggiCostiOperazione(companyId: string, ids: string[]): Promise<CostoOperazione[]> {
  const rows: CostoOperazione[] = [];
  for (let i = 0; i < ids.length; i += 40)
    rows.push(
      ...(await allPaymentRows<CostoOperazione>((a, b) =>
        db
          .from("company_costs")
          .select("id,order_id,allocations")
          .eq("company_id", companyId)
          .in("order_id", ids.slice(i, i + 40))
          .order("id")
          .range(a, b),
      )),
    );
  for (const id of ids)
    rows.push(
      ...(await allPaymentRows<CostoOperazione>((a, b) =>
        db
          .from("company_costs")
          .select("id,order_id,allocations")
          .eq("company_id", companyId)
          .contains("allocations", JSON.stringify([{ order_id: id }]))
          .order("id")
          .range(a, b),
      )),
    );
  return [...new Map(rows.map((r) => [r.id, r])).values()];
}
export function quotaCostoOperazione(costo: CostoOperazione, ids: string[]): number {
  const quote = quoteDelCosto(costo);
  if (quote.some((q) => q.pct < 0 || q.pct > 100) || quote.reduce((s, q) => s + q.pct, 0) > 100.001)
    throw new Error("Ripartizione del costo non valida: verifica le percentuali prima di leggere la cassa.");
  return quote.filter((q) => ids.includes(q.order_id)).reduce((s, q) => s + q.pct, 0) / 100;
}
