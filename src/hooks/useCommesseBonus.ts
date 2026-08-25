// ============================================================================
// useCommesseBonus — le commesse con detrazione edilizia (bonifico parlante)
// ============================================================================
// Il flag lo mette l'azienda alla creazione della commessa (has_building_bonus:
// ecobonus, bonus casa, sismabonus…). Su quelle commesse il cliente paga con
// bonifico parlante e la banca trattiene l'11% sull'IMPONIBILE prima
// dell'accredito (art. 25 D.L. 78/2010, dal 2024 all'11%): l'incasso vero è
// il netto, e il piano di cassa deve saperlo.
// Ritorna la mappa orderId → aliquota IVA della commessa (serve per scorporare
// l'imponibile dalle rate, che viaggiano lorde).
// ============================================================================
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const RITENUTA_BONIFICO_PARLANTE = 0.11;

/** Quota che arriva davvero in banca su un incasso lordo IVA di una commessa bonus. */
export function fattoreNettoRitenuta(vatRate: number | null | undefined): number {
  const iva = Number(vatRate);
  const divisore = 1 + (Number.isFinite(iva) && iva > 0 ? iva / 100 : 0);
  return 1 - RITENUTA_BONIFICO_PARLANTE / divisore;
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
