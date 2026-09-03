// ============================================================================
// useBloccaPrezzoAperti — i blocca prezzo ancora da restituire, per la cassa
// ============================================================================
// Servono al previsionale: ogni riga ancora "incassato" è un'uscita che deve
// succedere, e va vista nel piano prima che arrivi. Le righe restituite o
// trattenute non muovono più nulla in avanti e non vengono nemmeno lette.
// ============================================================================
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { type BloccaPrezzo, parseBloccaPrezzo } from "@/lib/orders/bloccaPrezzo";

const VUOTO: BloccaPrezzo[] = [];

export function useBloccaPrezzoAperti(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["blocca-prezzo-aperti", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    initialData: VUOTO,
    queryFn: async (): Promise<BloccaPrezzo[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("blocca_prezzo")
        .select("*")
        .eq("company_id", companyId!)
        .eq("stato", "incassato")
        .limit(2000);
      if (error) throw error;
      return parseBloccaPrezzo(data);
    },
  });
}
