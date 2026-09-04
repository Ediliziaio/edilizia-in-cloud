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
import {
  confrontaVoce,
  termineRicerca,
  riepilogaConfronti,
  type ConfrontoVoce,
  type RiepilogoConfronto,
  type VoceComputoDaConfrontare,
  type VocePrezzario,
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
  indisponibile: "regione-mancante" | "prezzario-mancante" | null;
}

/** Ultimo prezzario pubblicato per una regione. */
function useFonteRegionale(regione: string | null | undefined) {
  return useQuery({
    queryKey: ["prezzario", "fonte-regione", regione ?? "nessuna"],
    enabled: !!regione,
    staleTime: 24 * 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await sb()
        .from("prezzario_fonte")
        .select("id, regione, anno, nome")
        .eq("stato", "pubblicato")
        .ilike("regione", regione!)
        .order("anno", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as { id: string; regione: string; anno: number; nome: string } | null;
    },
  });
}

export function usePrezzoDiZona(voci: VoceComputoDaConfrontare[]): EsitoPrezzoDiZona {
  const { effectiveCompany } = useAuth();
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
  const { data: fonte, isLoading: fonteLoading } = useFonteRegionale(regione);

  // Chiave stabile: i codici e le descrizioni delle voci. Cambiando una
  // quantità non si rifà la ricerca, che dipende solo da cosa si cerca.
  const chiave = voci.map((v) => `${v.codicePrezzario ?? ""}|${v.descrizione}|${v.unita_misura ?? ""}`).join("§");

  const { data: corrispondenze, isLoading: matchLoading } = useQuery({
    queryKey: ["prezzo-di-zona", fonte?.id ?? "nessuna", chiave],
    enabled: !!fonte?.id && voci.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Map<string, { rif: VocePrezzario; confidenza: "certa" | "probabile" }>> => {
      const esito = new Map<string, { rif: VocePrezzario; confidenza: "certa" | "probabile" }>();

      // ── 1. Per codice: una sola query per tutte le voci che ne hanno uno.
      const codici = [...new Set(voci.map((v) => v.codicePrezzario).filter((c): c is string => !!c))];
      if (codici.length > 0) {
        const { data } = await sb()
          .from("prezzario_voce")
          .select("id, codice, descrizione, unita_misura, prezzo")
          .eq("fonte_id", fonte!.id)
          .in("codice", codici);
        const perCodice = new Map<string, VocePrezzario>();
        for (const r of (data ?? []) as VocePrezzario[]) {
          if (r.codice) perCodice.set(r.codice, r);
        }
        for (const v of voci) {
          const trovata = v.codicePrezzario ? perCodice.get(v.codicePrezzario) : undefined;
          if (trovata) esito.set(v.id, { rif: trovata, confidenza: "certa" });
        }
      }

      // ── 2. Per descrizione, solo per le voci rimaste senza corrispondenza.
      // Una query per voce: sono poche righe per computo, e una ricerca
      // full-text per riga è più precisa di una query sola con molti OR.
      const rimaste = voci.filter((v) => !esito.has(v.id) && v.descrizione.trim().length >= 3);
      for (const v of rimaste) {
        // Le prime parole piene, non la descrizione intera: in `websearch`
        // TUTTI i termini devono comparire, e una descrizione di prezzario è
        // lunga trenta parole con dentro le clausole di capitolato — cercandola
        // per intero non si trova mai niente.
        const termine = termineRicerca(v.descrizione);
        if (!termine) continue;
        let candidate: VocePrezzario[] = [];
        const { data, error: ftsErr } = await sb()
          .from("prezzario_voce")
          .select("id, codice, descrizione, unita_misura, prezzo")
          .eq("fonte_id", fonte!.id)
          .textSearch("search", termine, { type: "websearch", config: "italian" })
          .limit(5);
        if (!ftsErr) candidate = (data ?? []) as VocePrezzario[];
        // La ricerca full-text può non trovare nulla anche quando la voce c'è
        // (sinonimi, plurali): si riprova sulla parola più lunga, che è quella
        // che identifica di più la lavorazione.
        if (candidate.length === 0) {
          const parolaChiave = termine.split(" ").sort((a, b) => b.length - a.length)[0];
          if (parolaChiave && parolaChiave.length >= 5) {
            const { data: data2 } = await sb()
              .from("prezzario_voce")
              .select("id, codice, descrizione, unita_misura, prezzo")
              .eq("fonte_id", fonte!.id)
              .ilike("descrizione", `%${parolaChiave}%`)
              .limit(5);
            candidate = (data2 ?? []) as VocePrezzario[];
          }
        }
        // Fra i candidati si preferisce quello con la STESSA unità di misura:
        // è quello che poi si potrà davvero confrontare.
        const conStessaUnita = candidate.find(
          (c) => (c.unita_misura ?? "").toLowerCase().replace(/\s/g, "")
            === (v.unita_misura ?? "").toLowerCase().replace(/\s/g, ""),
        );
        const scelta = conStessaUnita ?? candidate[0];
        if (scelta) esito.set(v.id, { rif: scelta, confidenza: "probabile" });
      }

      return esito;
    },
  });

  const confronti = voci.map((v) => {
    const m = corrispondenze?.get(v.id);
    return confrontaVoce(v, m?.rif ?? null, m?.confidenza ?? null);
  });

  const indisponibile = !regione
    ? ("regione-mancante" as const)
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
