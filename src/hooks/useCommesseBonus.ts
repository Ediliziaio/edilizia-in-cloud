// ============================================================================
// useCommesseBonus — le commesse con detrazione edilizia (bonifico parlante)
// ============================================================================
// Il flag lo mette l'azienda alla creazione della commessa (has_building_bonus:
// ecobonus, bonus casa, sismabonus…). Su quelle commesse il cliente paga con
// bonifico parlante e la banca trattiene l'11% prima dell'accredito (art. 25
// D.L. 78/2010, 11% dal 1° marzo 2024). La base è il lordo scorporato al 22%
// convenzionale, non l'IVA della fattura: l'incasso vero è il netto, e il
// piano di cassa deve saperlo.
// Ritorna la mappa orderId → aliquota IVA della commessa (resta utile altrove).
// ============================================================================
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export { RITENUTA_BONIFICO_PARLANTE, IVA_SCORPORO_BANCA } from "@/lib/orders/bonusFiscali";
import { RITENUTA_BONIFICO_PARLANTE, IVA_SCORPORO_BANCA } from "@/lib/orders/bonusFiscali";

/**
 * Quota che arriva davvero in banca su un incasso lordo di una commessa bonus.
 *
 * Lo scorporo è al 22% SEMPRE: la banca non conosce l'aliquota della fattura e
 * per prassi usa la più alta (circolare AdE 40/E/2010). Prima qui si divideva
 * per l'IVA vera della commessa, e su un lavoro al 10% il piano di cassa
 * prevedeva un incasso più basso del reale di circa l'1% del lordo.
 *
 * Non dipende più dall'aliquota; il parametro resta per non toccare i
 * chiamanti, ma è ignorato.
 */
export function fattoreNettoRitenuta(_vatRate?: number | null): number {
  return 1 - RITENUTA_BONIFICO_PARLANTE / (1 + IVA_SCORPORO_BANCA);
}

export function useCommesseBonus(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["commesse-bonus", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Map<string, number | null>> => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, vat_rate")
        .eq("company_id", companyId!)
        .eq("has_building_bonus", true)
        .limit(2000);
      if (error) throw error;
      return new Map((data ?? []).map((o) => [o.id as string, o.vat_rate as number | null]));
    },
  });
}
