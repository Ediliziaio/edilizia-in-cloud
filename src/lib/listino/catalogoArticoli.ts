import { supabase } from "@/integrations/supabase/client";
import type { ArticleTemplateData } from "@/components/orders/ArticleCombobox";

/** Il catalogo articoli attivo dell'azienda (stessa chiave di cache del menu, `["article-templates", companyId]`). */
export async function caricaArticoliCatalogo(companyId: string): Promise<ArticleTemplateData[]> {
  const { data, error } = await supabase
    .from("article_templates")
    .select("id, name, sku, category, unit_price, standard_cost, unit_of_measure, vat_rate, supplier_id, description, immagine_url, pdf_scheda_url")
    .eq("company_id", companyId)
    .eq("attivo", true)
    .order("name");
  if (error) throw error;
  return data as ArticleTemplateData[];
}
