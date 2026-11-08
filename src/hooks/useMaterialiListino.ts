import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";
import type { Json } from "@/integrations/supabase/types";

export interface MaterialeListino {
  id: string; company_id: string; name: string; sku: string | null;
  category: string | null; supplier_id: string | null; standard_cost: number | null;
  prezzo_acquisto_netto: number | null; prezzo_vendita: number | null;
  unit_of_measure: string | null; vat_rate: number | null; attivo: boolean | null;
  note_interne: string | null; custom_field_values: Json;
  suppliers: { name: string } | null;
}

export function useMaterialiListino(abilitato = true) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["materiali-listino", companyId], enabled: !!companyId && abilitato, staleTime: 60_000,
    queryFn: ({ signal }) => loadCatalogPages<MaterialeListino>((from, to) => (
      supabase.from("article_templates")
        .select("id, company_id, name, sku, category, supplier_id, standard_cost, prezzo_acquisto_netto, prezzo_vendita, unit_of_measure, vat_rate, attivo, note_interne, custom_field_values, suppliers(name)")
        .eq("company_id", companyId!).is("family_id", null)
        .order("name").order("id").range(from, to).abortSignal(signal) as unknown as
        PromiseLike<{ data: MaterialeListino[] | null; error: { message: string } | null }>)),
  });
}
