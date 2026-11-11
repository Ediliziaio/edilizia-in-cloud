import { supabase } from "@/integrations/supabase/client";
import { readAllPages } from "@/lib/personale/readAllPages";

/** Il limite REST non è un limite ai costi dell'azienda: legge tutte le pagine
 * prima di esporre i dati ai riepiloghi, senza restituire risultati parziali. */
export function leggiCostiAzienda(companyId: string, dateFrom?: string, dateTo?: string) {
  return readAllPages(async (from, to) => {
    let query = supabase.from("company_costs")
      .select("*, order:orders(id, order_code), supplier:suppliers(id, name, product_category, vat_rate)")
      .eq("company_id", companyId)
      .order("due_date", { ascending: true })
      .order("id", { ascending: true });
    if (dateFrom) query = query.gte("due_date", dateFrom);
    if (dateTo) query = query.lte("due_date", dateTo);
    return await query.range(from, to);
  });
}
