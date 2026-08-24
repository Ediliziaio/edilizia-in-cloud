// ============================================================================
// useGiornoStipendi — il giorno di paga VERO dell'azienda
// ============================================================================
// Non tutte le aziende pagano gli stipendi lo stesso giorno (c'è chi paga il
// 27, chi il 10 del mese dopo, chi a fine mese): il giorno si impara dai
// pagamenti reali registrati in Prima Nota con categoria "stipendi" — mediana
// del giorno del mese sugli ultimi 12 mesi, minimo 2 campioni.
// Finché non c'è storia sufficiente: null → la proiezione resta a fine mese e
// la UI dice come insegnarglielo. L'ancora temporale viaggia nella queryFn
// (il react-compiler vieta le date nel render).
// ============================================================================
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { giornoStipendiDaDate } from "@/lib/finanza/trediciSettimane";

export interface GiornoStipendi {
  /** Giorno del mese (1–31) imparato dai pagamenti reali; null se storia insufficiente. */
  giorno: number | null;
  /** Quanti pagamenti stipendi reali sono stati trovati negli ultimi 12 mesi. */
  campioni: number;
  /** Ancora "oggi" (data locale) calcolata fuori dal render. */
  oggi: Date;
}

export function useGiornoStipendi(companyId: string | undefined) {
  return useQuery({
    queryKey: ["giorno-stipendi", companyId],
    enabled: !!companyId,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<GiornoStipendi> => {
      const unAnnoFa = new Date();
      unAnnoFa.setFullYear(unAnnoFa.getFullYear() - 1);
      const { data, error } = await supabase
        .from("prima_nota_entries")
        .select("entry_date")
        .eq("company_id", companyId!)
        .eq("direction", "uscita")
        .eq("category", "stipendi")
        .gte("entry_date", unAnnoFa.toLocaleDateString("en-CA"))
        .limit(200);
      if (error) throw error;
      const date = (data || []).map((r) => r.entry_date as string).filter(Boolean);
      return {
        giorno: giornoStipendiDaDate(date),
        campioni: date.length,
        oggi: new Date(),
      };
    },
  });
}
