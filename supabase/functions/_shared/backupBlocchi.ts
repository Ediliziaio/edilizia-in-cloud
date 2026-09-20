// Le regole del backup a blocchi (20/09/2026), senza chiamate: si provano da sole.
//
// Perché esiste. Il backup settimanale chiedeva al database il dump intero di
// ogni azienda in una sola istruzione (admin_esporta_azienda), e PostgREST
// ferma un'istruzione a 8 secondi. Finché le aziende erano piccole bastava;
// il 20/09 le quattro più grandi — BeMade, Il Bagno Group, Best Infissi e la
// Demo — sono andate tutte in «statement timeout», e due erano senza copia già
// dalla domenica prima. Nessuno l'ha visto: il cron non legge la risposta.
//
// Il backup a blocchi esisteva già per l'area super admin (19/09). Qui le due
// decisioni che servono per usarlo con tutte: chi va a blocchi, e quanto è
// grande un blocco.

/** Oltre queste righe il dump unico non si tenta nemmeno: si va a blocchi. */
export const SOGLIA_RIGHE_A_BLOCCHI = 25_000;

/** Un'azienda con tante righe va a blocchi; le altre provano prima il dump unico. */
export function vaABlocchi(righeTotali: number | null | undefined): boolean {
  return Number(righeTotali ?? 0) > SOGLIA_RIGHE_A_BLOCCHI;
}

// Un blocco è un file, e passa tutto intero dalla memoria della funzione
// (256 MB). Il peso di una riga cambia di mille volte da una tabella all'altra:
// 5.000 note sono 2 MB, 5.000 email con il corpo HTML sono 137 MB. Quindi si
// parte bassi e ci si regola sul peso del blocco appena letto.
export const BLOCCO_INIZIALE = 500;
export const BLOCCO_MINIMO = 50;
export const BLOCCO_MASSIMO = 5000;
/** Sotto questo peso (caratteri) il prossimo blocco raddoppia. */
export const BLOCCO_LEGGERO = 4_000_000;
/** Sopra questo peso il prossimo blocco si dimezza. */
export const BLOCCO_PESANTE = 20_000_000;

const entro = (n: number) => Math.max(BLOCCO_MINIMO, Math.min(BLOCCO_MASSIMO, Math.round(n)));

/** Quante righe chiedere al prossimo blocco, visto quanto pesava l'ultimo. */
export function prossimoLimite(limite: number, caratteriUltimoBlocco: number): number {
  if (caratteriUltimoBlocco > BLOCCO_PESANTE) return entro(limite / 2);
  if (caratteriUltimoBlocco < BLOCCO_LEGGERO) return entro(limite * 2);
  return entro(limite);
}

/**
 * Un blocco non è passato (troppo lento, troppo grande): si riprova dallo
 * stesso punto con un quarto delle righe. `null` = era già al minimo, la
 * tabella si dichiara fallita e si va avanti con le altre.
 */
export function limiteDopoErrore(limite: number): number | null {
  if (limite <= BLOCCO_MINIMO) return null;
  return entro(limite / 4);
}
