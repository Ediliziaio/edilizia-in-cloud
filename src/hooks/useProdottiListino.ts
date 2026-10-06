/**
 * useProdottiListino — i prodotti del listino prodotti (`article_families`) per il
 * selettore voci dei preventivatori edili.
 *
 * Si propone ciò che l'azienda ha acceso nel preventivo (`mostra_preventivo`), a pezzo
 * o al metro quadro. Prima i prodotti dell'area del preventivatore (i sanitari nel
 * preventivo del bagno); chi scrive un nome trova anche quelli delle altre aree
 * (un radiatore nel preventivo del bagno), meno serramenti e fotovoltaico, che hanno
 * i loro preventivatori. Cerca per nome e per codice.
 *
 * Le regole su prezzo, foto e descrizione stanno in `lib/moduli/prodottiListino`.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { termineDiRicerca } from "@/lib/ricercaPostgrest";
import {
  COLONNE_FAMIGLIA_PICKER,
  VERTICALI_ESCLUSI,
  eProdottoPrezzabile,
  famigliaInProdotto,
  type ProdottoListino,
  type RigaFamigliaPicker,
  type VerticaleModulo,
} from "@/lib/moduli/prodottiListino";

// `article_families` ha colonne che i tipi generati non conoscono tutte: stesso pattern degli altri hook del listino.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = () => supabase as any;

/** `attivo` falso (selettore chiuso, o un'altra sorgente di ricerca): niente richieste. */
export function useProdottiListino(term: string, verticale: VerticaleModulo, attivo = true) {
  const companyId = useEffectiveCompanyId();
  return useQuery<ProdottoListino[]>({
    queryKey: ["prodotti-listino-computo", companyId, verticale, term],
    enabled: !!companyId && attivo,
    staleTime: 60_000,
    queryFn: async () => {
      const t = termineDiRicerca(term);
      const base = () => {
        let q = sb()
          .from("article_families")
          .select(COLONNE_FAMIGLIA_PICKER)
          .eq("company_id", companyId!)
          .eq("attivo", true)
          .eq("mostra_preventivo", true)
          .is("deleted_at", null)
          .in("modalita_prezzo_base", ["pz", "mq"]);
        // Virgole e parentesi nel testo spezzavano il .or(): il termine passa da termineDiRicerca.
        if (t) q = q.or(`nome.ilike.%${t}%,codice.ilike.%${t}%`);
        return q;
      };
      const [propri, altri] = await Promise.all([
        base().eq("vertical", verticale).order("nome").limit(40),
        // Le altre aree solo se si sta cercando qualcosa: senza testo l'elenco sarebbe tutto il listino.
        t.length >= 2
          ? base().neq("vertical", verticale).not("vertical", "in", `(${VERTICALI_ESCLUSI.join(",")})`).order("nome").limit(15)
          : Promise.resolve({ data: [] as unknown[], error: null as { message: string } | null }),
      ]);
      if (propri.error) throw new Error(propri.error.message);
      if (altri.error) throw new Error(altri.error.message);
      const righe = [...((propri.data ?? []) as RigaFamigliaPicker[]), ...((altri.data ?? []) as RigaFamigliaPicker[])];
      return righe.filter(eProdottoPrezzabile).map(famigliaInProdotto);
    },
  });
}
