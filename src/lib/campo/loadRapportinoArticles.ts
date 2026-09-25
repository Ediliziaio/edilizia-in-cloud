import { supabase } from "@/integrations/supabase/client";
import type { RapportinoArticle } from "./rapportinoMaterials";

/** Minimal field data only, no prices. A hidden catalog row leaves the unit unknown. */
export async function loadRapportinoArticles(orderId: string, companyId: string): Promise<RapportinoArticle[]> {
  const rows: RapportinoArticle[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from("order_items")
      .select("id, name, categoria, stock_item_id, template:article_templates!order_items_article_template_id_fkey(unit_of_measure, category), order:orders!inner(company_id)")
      .eq("order_id", orderId).eq("order.company_id", companyId)
      .order("position", { ascending: true }).order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}
