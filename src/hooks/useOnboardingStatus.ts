/**
 * useOnboardingStatus — controlla quanto setup ha completato l'azienda.
 *
 * Usato dalla OnboardingCard nel SerramentiIndex per mostrare progress
 * (es. 2/4 step completati) e indicare cosa manca per essere operativi.
 *
 * Step checked:
 *  1. Almeno 1 macrocategoria PRINCIPALE configurata (es. Infissi)
 *  2. Almeno 1 macrocategoria ACCESSORIO configurata (es. Tapparelle)
 *  3. Almeno 1 tariffa aziendale (servizi: trasporto/ENEA/...)
 *  4. Almeno 1 articolo nel listino prodotti (article_families)
 *
 * Single query batched: 4 count queries parallele via Promise.all per
 * minimizzare round-trip. Cache 5 min per non re-fetchare ad ogni view.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

export interface OnboardingStatus {
  hasMacroPrincipale: boolean;
  hasMacroAccessorio: boolean;
  hasTariffa: boolean;
  hasArticolo: boolean;
  completedCount: number;
  totalCount: number;
  isComplete: boolean;
}

export function useOnboardingStatus() {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: ["serramenti-onboarding-status", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<OnboardingStatus> => {
      // 4 count queries parallele. count="exact" è preciso ma sotto i 1k
      // record è veloce; usiamo head=true per evitare di trasferire data.
      const [macroP, macroA, tariffa, articolo] = await Promise.all([
        supabase
          .from("listino_macrocategorie")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId!)
          .eq("attivo", true)
          .eq("categoria_tipo", "principale")
          .limit(1),
        supabase
          .from("listino_macrocategorie")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId!)
          .eq("attivo", true)
          .eq("categoria_tipo", "accessorio")
          .limit(1),
        supabase
          .from("tariffe_aziendali")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId!)
          .eq("attiva", true)
          .limit(1),
        supabase
          .from("article_families")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId!)
          .eq("attivo", true)
          .is("deleted_at", null)
          .limit(1),
      ]);

      const hasMacroPrincipale = (macroP.count ?? 0) > 0;
      const hasMacroAccessorio = (macroA.count ?? 0) > 0;
      const hasTariffa = (tariffa.count ?? 0) > 0;
      const hasArticolo = (articolo.count ?? 0) > 0;
      const flags = [hasMacroPrincipale, hasMacroAccessorio, hasTariffa, hasArticolo];
      const completedCount = flags.filter(Boolean).length;

      return {
        hasMacroPrincipale,
        hasMacroAccessorio,
        hasTariffa,
        hasArticolo,
        completedCount,
        totalCount: flags.length,
        isComplete: completedCount === flags.length,
      };
    },
  });
}
