/**
 * useClientiSimili — cerca in anagrafica un cliente che sembri già essere
 * quello che si sta inserendo, prima di salvarlo.
 *
 * La ricerca è mirata (P.IVA, codice fiscale, telefono) e non carica tutta
 * l'anagrafica: l'azienda con diecimila clienti non deve pagare per questo
 * controllo. Il telefono si cerca con un pattern che ignora spazi e
 * punteggiatura, perché in anagrafica è scritto in dieci modi diversi e non
 * esiste una colonna normalizzata su cui indicizzare.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  normalizzaFiscale,
  patternTelefonoIlike,
  trovaSomiglianze,
  type ClienteEsistente,
  type Somiglianza,
} from "@/lib/clienti/duplicati";

interface Params {
  companyId: string | null | undefined;
  vatNumber?: string | null;
  fiscalCode?: string | null;
  phone?: string | null;
  /** id da escludere (utile quando si modifica un cliente esistente). */
  escludiId?: string | null;
}

const CAMPI = "id, first_name, last_name, business_name, email, phone, fiscal_code, vat_number";

export function useClientiSimili({ companyId, vatNumber, fiscalCode, phone, escludiId }: Params) {
  const vat = normalizzaFiscale(vatNumber);
  const cf = normalizzaFiscale(fiscalCode);
  const patternTel = patternTelefonoIlike(phone);

  // Nessun dato identificativo digitato → nessuna domanda al server.
  const abilitata = !!companyId && (vat.length >= 8 || cf.length >= 8 || patternTel !== "");

  const query = useQuery<Somiglianza[]>({
    queryKey: ["clienti-simili", companyId, vat, cf, patternTel, escludiId ?? null],
    enabled: abilitata,
    staleTime: 30_000,
    queryFn: async () => {
      const condizioni: string[] = [];
      // `eq` sui campi fiscali: sono già normalizzati in scrittura da
      // customerDataSanitizer, quindi il confronto esatto regge. Il controllo
      // fine (spazi, prefisso IT sul dato vecchio) lo rifà trovaSomiglianze.
      if (vat.length >= 8) condizioni.push(`vat_number.ilike.%${vat}%`);
      if (cf.length >= 8) condizioni.push(`fiscal_code.ilike.%${cf}%`);
      if (patternTel) condizioni.push(`phone.ilike.${patternTel}`);
      if (condizioni.length === 0) return [];

      const { data, error } = await supabase
        .from("profiles")
        .select(CAMPI)
        .eq("company_id", companyId!)
        .or(condizioni.join(","))
        .limit(20);
      if (error) throw error;

      const candidati = ((data ?? []) as unknown as ClienteEsistente[])
        .filter((c) => c.id !== escludiId);
      // Il server ha ristretto il campo; qui si decide davvero, con le stesse
      // regole di normalizzazione usate nei test.
      return trovaSomiglianze(candidati, { vatNumber, fiscalCode, phone });
    },
  });

  return {
    simili: query.data ?? [],
    isLoading: query.isFetching,
    // Un errore qui non deve impedire di creare un cliente: è un avviso, non un
    // controllo di validità. Lo si espone perché il chiamante possa dirlo.
    error: query.error,
  };
}
