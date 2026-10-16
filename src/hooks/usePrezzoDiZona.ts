/**
 * usePrezzoDiZona — trova, per le voci di un computo, il prezzo corrispondente
 * nel prezzario della regione dell'azienda.
 *
 * Come si cerca, in ordine di affidabilità:
 *  1. per CODICE, quando la voce discende da una voce di listino adottata dal
 *    prezzario (`rst_listino_voci.codice`): è la stessa voce, corrispondenza
 *    certa;
 *  2. per DESCRIZIONE, con la ricerca full-text italiana già usata dal picker:
 *    corrispondenza probabile, e come tale viene etichettata.
 *
 * Quello che NON fa: indovinare la regione. Se l'azienda non ha una regione, o
 * se per quella regione non c'è un prezzario pubblicato, non si confronta e lo
 * si dice — un confronto col prezzario di un'altra regione sarebbe peggio di
 * nessun confronto.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { regioneAzienda } from "@/lib/geo/provinceRegioni";
import { attendiRicerca, cercaConfronti } from "@/lib/prezzario/ricercaConfronti";
import {
  confrontaVoce,
  riepilogaConfronti,
  type ConfrontoVoce,
  type RiepilogoConfronto,
  type VoceComputoDaConfrontare,
} from "@/lib/prezzario/confronto";

// Le tabelle `prezzario_*` non sono nei tipi generati (stesso motivo e stesso
// pattern di src/lib/prezzario/queries.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = () => supabase as any;

export interface EsitoPrezzoDiZona {
  /** Confronto per ogni voce, nella stessa forma per tutte. */
  confronti: ConfrontoVoce[];
  riepilogo: RiepilogoConfronto | null;
  /** Regione su cui si sta confrontando, per dirlo a schermo. */
  regione: string | null;
  /** Etichetta della fonte, es. "Lombardia 2024". */
  fonteLabel: string | null;
  isLoading: boolean;
  /**
   * Perché il confronto non è disponibile. `null` quando invece lo è.
   */
  indisponibile: "regione-mancante" | "prezzario-mancante" | "errore-ricerca" | null;
}

/** Ultimo prezzario pubblicato per una regione. */
function useFonteRegionale(regione: string | null | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: ["prezzario", "fonte-regione", userId, regione ?? "nessuna"],
    enabled: !!userId && !!regione,
    retry: false,
    staleTime: 24 * 60 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const { data, error } = await sb()
        .from("prezzario_fonte")
        .select("id, regione, anno, nome")
        .eq("stato", "pubblicato")
        .ilike("regione", regione!)
        .order("anno", { ascending: false })
        .limit(1)
        .maybeSingle().abortSignal(signal);
      if (error) throw new Error(error.message);
      return (data ?? null) as { id: string; regione: string; anno: number; nome: string } | null;
    },
  });
}

export function usePrezzoDiZona(voci: VoceComputoDaConfrontare[]): EsitoPrezzoDiZona {
  const { effectiveCompany, user } = useAuth();
  // `companies.region` non è modificabile da nessuna schermata dell'app: per
  // quasi tutte le aziende è vuoto e resterebbe vuoto. La provincia della sede
  // invece si compila, e per il prezzario è sufficiente.
  const regione = regioneAzienda(
    effectiveCompany as {
      region?: string | null;
      operational_province?: string | null;
      legal_province?: string | null;
    } | null,
  );
  const { data: fonte, isLoading: fonteLoading, isError: fonteError } = useFonteRegionale(regione, user?.id);

  // Chiave stabile: i codici e le descrizioni delle voci. Cambiando una
  // quantità non si rifà la ricerca, che dipende solo da cosa si cerca.
  const chiave = JSON.stringify(voci.map(v => [v.id, v.codicePrezzario, v.descrizione, v.unita_misura]));
  const scope = JSON.stringify([user?.id, effectiveCompany?.id]);

  const { data: corrispondenze, isLoading: matchLoading, isError: matchError } = useQuery({
    queryKey: ["prezzo-di-zona", scope, fonte?.id ?? "nessuna", chiave],
    enabled: !!user?.id && !!fonte?.id && voci.length > 0,
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: async ({ signal }) => {
      await attendiRicerca(signal);
      return cercaConfronti(sb(), scope, fonte!.id, voci, signal);
    },
  });

  const confronti = voci.map((v) => {
    const m = corrispondenze?.get(v.id);
    return confrontaVoce(v, m?.rif ?? null, m?.confidenza ?? null);
  });

  const indisponibile = !regione
    ? ("regione-mancante" as const)
    : fonteError || matchError ? ("errore-ricerca" as const)
    : !fonteLoading && !fonte
      ? ("prezzario-mancante" as const)
      : null;

  return {
    confronti,
    riepilogo: indisponibile ? null : riepilogaConfronti(voci, confronti),
    regione,
    fonteLabel: fonte ? `${fonte.regione} ${fonte.anno}` : null,
    isLoading: fonteLoading || matchLoading,
    indisponibile,
  };
}
