/**
 * «Cassa libera» della commessa: quanto dei soldi che hai in mano è davvero tuo.
 *
 * Il margine è un'opinione finché il cantiere non è finito; la cassa è un fatto.
 * Un acconto incassato sembra utile e non lo è: su un serramento da 10.000 €
 * incassi 5.000 di acconto e hai ancora 7.000 di merce e posa da pagare. Se con
 * quei 5.000 copri i costi di un altro cantiere, hai preso in prestito dal
 * cliente — e te ne accorgi quando arriva la fattura del fornitore.
 *
 * Qui i fatti restano separati dalla stima, apposta:
 * - `libera` usa solo fatti: incassato − pagato − costi registrati non pagati;
 * - `daSostenere` è una stima dal preventivo e dall'avanzamento, e NON viene
 *   sottratta. Sommarla a un numero di cassa vorrebbe dire mischiare importi
 *   lordi (gli incassi) con importi senza IVA (il preventivo).
 *
 * Modulo puro: niente React, niente Supabase.
 */

export interface CassaLiberaCommessa {
  /** Incassato − pagato: i soldi della commessa che hai adesso. */
  inMano: number;
  /** Costi della commessa registrati e non ancora pagati (lordi). */
  daPagare: number;
  /** inMano − daPagare: quello che resta dopo le fatture già arrivate. */
  libera: number;
  /** Costi previsti non ancora sostenuti (senza IVA); null senza preventivo o senza avanzamento. */
  daSostenere: number | null;
  /** true quando la cassa libera copre anche i costi ancora da sostenere; null se non calcolabile. */
  copre: boolean | null;
}

const n = (v: number | null | undefined) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const c = (v: number) => Math.round(v * 100) / 100;

export function cassaLiberaCommessa(input: {
  /** Cumulato incassato − pagato a oggi (lordo), da `useEsposizioneCommessa`. */
  saldoOggi: number;
  /** Costi registrati e non pagati (lordo). */
  daPagare: number;
  /** Costo previsto totale della commessa, senza IVA; null se non c'è un preventivo. */
  costoPrevisto?: number | null;
  /** Avanzamento delle lavorazioni in percentuale; null se la commessa non ha fasi. */
  avanzamentoPct?: number | null;
}): CassaLiberaCommessa {
  const inMano = c(n(input.saldoOggi));
  const daPagare = c(Math.max(0, n(input.daPagare)));
  const libera = c(inMano - daPagare);

  const previsto = n(input.costoPrevisto);
  const avanzamento = input.avanzamentoPct;
  const stimabile = previsto > 0 && avanzamento != null && Number.isFinite(Number(avanzamento));
  const daSostenere = stimabile
    ? c(previsto * Math.max(0, Math.min(100, 100 - Number(avanzamento))) / 100)
    : null;

  return {
    inMano,
    daPagare,
    libera,
    daSostenere,
    copre: daSostenere == null ? null : libera >= daSostenere,
  };
}
