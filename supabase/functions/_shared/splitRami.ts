/**
 * Split delle automazioni: quale ramo prende un contatto.
 *
 * Il nodo "Split A/B" divide i contatti tra più rami secondo percentuali
 * scritte dall'utente, per esempio "60,40" o "40,30,30". Serve a distribuire i
 * lead tra più call center o più venditori: oggi due persone, domani tre.
 *
 * Prima il motore leggeva solo il primo numero e sceglieva tra "a" e "b": con
 * tre rami il terzo non riceveva mai nessuno. Qui la regola vale da 2 a 5 rami,
 * ed è una sola: la usa process-automation e la verificano i test.
 */

/** Oltre questo numero di rami l'editor non disegna maniglie. */
export const MAX_RAMI = 5;

const LETTERE = "abcdefghij";

/** Lettera del ramo in posizione `indice`: 0 → "a", 1 → "b", … */
export function letteraRamo(indice: number): string {
  return LETTERE.charAt(indice);
}

/**
 * Le percentuali del nodo, pronte da usare.
 *
 * - `split_a` (schema vecchio, un solo numero) vale ancora: diventa [a, 100 − a].
 * - `percentuali` è la stringa dell'editor ("60,40"): si accettano anche ; e |.
 * - Una percentuale a 0 è lecita: quel ramo resta nel flusso ma non riceve
 *   nessuno, ed è il modo di mettere in pausa una persona senza ridisegnare.
 * - Se la somma non fa 100 si ripartisce in proporzione ("2,1" = 66,7 / 33,3):
 *   meglio rispettare l'intenzione che buttare via la configurazione.
 * - Senza almeno due rami validi si torna a 50/50, come prima.
 */
export function leggiPercentuali(cfg: Record<string, unknown>): number[] {
  const splitA = Number.parseInt(String(cfg.split_a ?? ""), 10);
  if (Number.isFinite(splitA) && splitA > 0 && splitA < 100) return [splitA, 100 - splitA];

  const grezze = Array.isArray(cfg.percentuali)
    ? cfg.percentuali
    : typeof cfg.percentuali === "string"
      ? cfg.percentuali.split(/[,;|]/)
      : [];

  const valori = grezze
    .map((v) => Number(String(v).trim().replace("%", "").replace(",", ".")))
    .slice(0, MAX_RAMI);

  const validi = valori.length >= 2 && valori.every((v) => Number.isFinite(v) && v >= 0);
  const somma = validi ? valori.reduce((s, v) => s + v, 0) : 0;
  if (!validi || somma <= 0) return [50, 50];

  return valori.map((v) => (v / somma) * 100);
}

/**
 * Il ramo per un numero tra 0 e 100 (escluso). Il motore passa un numero
 * casuale; i test passano numeri fissi per verificare i confini.
 */
export function ramoPerNumero(percentuali: number[], numero: number): string {
  let cumulata = 0;
  for (let i = 0; i < percentuali.length; i++) {
    cumulata += percentuali[i];
    if (numero < cumulata && percentuali[i] > 0) return letteraRamo(i);
  }
  // Arrotondamenti: un numero a ridosso di 100 va all'ultimo ramo che riceve.
  for (let i = percentuali.length - 1; i >= 0; i--) {
    if (percentuali[i] > 0) return letteraRamo(i);
  }
  return letteraRamo(0);
}

/**
 * Un arco in uscita dallo split porta al ramo `ramo`? L'editor etichetta gli
 * archi "A", "B", "C"… oppure "A: 60%": conta la prima lettera.
 */
export function arcoDelRamo(etichetta: string | null | undefined, ramo: string): boolean {
  return String(etichetta ?? "").trim().toLowerCase().charAt(0) === ramo.toLowerCase();
}
