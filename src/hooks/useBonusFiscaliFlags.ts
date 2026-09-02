import { useAuth } from "@/contexts/AuthContext";

/**
 * Le due funzioni fiscali, con default OPPOSTI:
 *  • bonusMultipli → una commessa ripartita su più bonus edilizi (pratiche
 *    distinte, quindi bonifici parlanti distinti). Default OFF: è una richiesta
 *    specifica, le altre aziende vedono il solo Sì/No di sempre.
 *  • bloccaPrezzo → versamenti che bloccano il listino e vanno restituiti prima
 *    dei bonifici parlanti. Default ON per tutti (serve a chiunque incassi somme
 *    da ridare indietro), quindi si legge `!== false`: un record letto senza
 *    quella colonna non deve spegnere la funzione.
 *
 * Flag su `companies`, letti da `effectiveCompany` (AuthContext fa select *).
 */
export function useBonusFiscaliFlags(): { bonusMultipli: boolean; bloccaPrezzo: boolean } {
  const { effectiveCompany } = useAuth();
  const c = effectiveCompany as
    | { bonus_multipli_enabled?: boolean; blocca_prezzo_enabled?: boolean }
    | null;
  return {
    bonusMultipli: c?.bonus_multipli_enabled === true,
    bloccaPrezzo: c?.blocca_prezzo_enabled !== false,
  };
}
