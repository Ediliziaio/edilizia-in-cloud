/**
 * Le rotte dei preventivatori col guscio comune (barra delle fasi, anteprima a
 * destra e piede fissi). Per restare fermi da computer serve che la pagina abbia
 * l'altezza bloccata (`CompanyLayout`): con l'altezza libera scorre il documento
 * intero. L'elenco cresce man mano che un modulo adotta `components/preventivatore`
 * e un test controlla che coincida con i wizard che lo usano davvero.
 */
export const MODULI_COL_GUSCIO = [
  "serramenti", "termoidraulico", "bagni", "tetti", "climatizzazione", "elettrico", "pavimenti", "piscine", "ristrutturazione",
] as const;

const RICHIAMO = new RegExp(`^/azienda/(${MODULI_COL_GUSCIO.join("|")})/(nuovo|[^/]+/modifica)/?$`);

export const rottaDelGuscio = (percorso: string): boolean => RICHIAMO.test(percorso);
