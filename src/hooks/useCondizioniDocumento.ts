/**
 * Le condizioni che l'azienda ha deciso per un tipo di documento (07/11/2026).
 *
 * Un lettore solo, per chi un documento lo sta creando: fatture, ordini ai fornitori, lavori extra.
 * Dice il modello predefinito di quell'ambito e le sue clausole, pronte da mettere sul documento.
 *
 * Due regole che valgono sempre:
 *  - se l'archivio non c'è ancora, o l'azienda non ha scritto niente, non succede nulla e il
 *    documento esce come prima: `disponibile` resta false e le clausole sono zero;
 *  - quello che si copia sul documento è una COPIA. Cambiare il modello domani non tocca il
 *    documento di oggi: è lo stesso patto dell'archivio.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  clausoleDelModello, testoDelModello, type AmbitoCondizioni, type Clausola, type ModelloCondizioni,
} from "@/lib/condizioni/archivio";

// I tipi generati non conoscono ancora le tabelle dell'archivio.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface CondizioniDelDocumento {
  /** C'è un modello predefinito, con del testo dentro. */
  disponibile: boolean;
  modello: ModelloCondizioni | null;
  clausole: Clausola[];
  /** Il testo intero, come esce sul documento. */
  testo: string;
  caricamento: boolean;
}

export function useCondizioniDocumento(ambito: AmbitoCondizioni): CondizioniDelDocumento {
  // L'azienda effettiva: la stessa che vede l'archivio nelle impostazioni.
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const { data, isLoading } = useQuery({
    queryKey: ["condizioni-documento", companyId, ambito],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ModelloCondizioni | null> => {
      const { data, error } = await db
        .from("condizioni_modelli")
        .select("id,nome,ambito,predefinito,attivo,versione,clausole")
        .eq("company_id", companyId)
        .eq("ambito", ambito)
        .eq("predefinito", true)
        .eq("attivo", true)
        .maybeSingle();
      // Tabelle non ancora create, o permesso che non c'è: il documento esce come prima.
      if (error) return null;
      return (data as ModelloCondizioni | null) ?? null;
    },
  });

  const modello = data ?? null;
  const clausole = clausoleDelModello(modello);
  const testo = testoDelModello(modello);
  return { disponibile: !!modello && testo.trim().length > 0, modello, clausole, testo, caricamento: isLoading };
}
