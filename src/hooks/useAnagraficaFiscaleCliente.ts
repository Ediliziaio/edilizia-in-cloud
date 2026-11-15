/**
 * L'anagrafica fiscale collegata a un cliente (anagrafiche_native.cliente_id).
 *
 * Una sola lettura per tutta la scheda cliente (15/11/2026): la testata, la sezione
 * «Anagrafica» e «Dati per la fattura» mostrano lo stesso tipo (Privato, Azienda,
 * Pubblica Amministrazione, Estero) e gli stessi codici. Prima la testata leggeva
 * profiles.is_business («Azienda» anche per un Comune) e il codice fiscale del
 * profilo era vuoto mentre quello fiscale c'era.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const COLONNE_ANAGRAFICA_FISCALE_CLIENTE =
  "id, tipo_cliente, ragione_sociale, nome, cognome, partita_iva, codice_fiscale, codice_sdi, pec, email, email_fatture, telefono, referente_amministrativo, indirizzo_via, indirizzo_cap, indirizzo_comune, indirizzo_provincia, indirizzo_nazione, codice_ipa, split_payment";

export interface AnagraficaFiscaleCliente {
  id: string;
  tipo_cliente: string | null;
  ragione_sociale: string | null;
  nome: string | null;
  cognome: string | null;
  partita_iva: string | null;
  codice_fiscale: string | null;
  codice_sdi: string | null;
  pec: string | null;
  email: string | null;
  email_fatture: string | null;
  telefono: string | null;
  referente_amministrativo: string | null;
  indirizzo_via: string | null;
  indirizzo_cap: string | null;
  indirizzo_comune: string | null;
  indirizzo_provincia: string | null;
  indirizzo_nazione: string | null;
  codice_ipa: string | null;
  split_payment: boolean | null;
}

export const chiaveAnagraficaFiscaleCliente = (clienteId?: string | null) => ["anagrafica-cliente", clienteId] as const;

export function useAnagraficaFiscaleCliente(clienteId?: string | null) {
  return useQuery({
    queryKey: chiaveAnagraficaFiscaleCliente(clienteId),
    enabled: !!clienteId,
    queryFn: async (): Promise<AnagraficaFiscaleCliente | null> => {
      const { data, error } = await supabase
        .from("anagrafiche_native")
        .select(COLONNE_ANAGRAFICA_FISCALE_CLIENTE)
        .eq("cliente_id", clienteId!)
        .order("attivo", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as AnagraficaFiscaleCliente | null;
    },
  });
}
