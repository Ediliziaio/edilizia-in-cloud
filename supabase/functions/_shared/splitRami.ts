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

/**
 * Come sceglie il nodo: "casuale" tira a sorte con le percentuali (il
 * comportamento di sempre, giusto per un test A/B), "equilibrato" dà il contatto
 * a chi è più indietro rispetto alla sua quota di oggi.
 *
 * Perché serve: a BeMade il 16/09 lo split 60/40 tra Antonella e Venusia ha
 * dato 18 e 17, e Venusia riceveva in più tutto il Restauro, che non passa dallo
 * split. Fine giornata: Venusia 29, Antonella 15. Una moneta sui piccoli numeri
 * sbanda, e non sa niente dei lead arrivati da un altro flusso.
 */
export function modalitaSplit(cfg: Record<string, unknown>): "casuale" | "equilibrato" {
  return cfg.modalita === "equilibrato" ? "equilibrato" : "casuale";
}

/**
 * Il ramo più indietro rispetto alla sua quota. `conteggi[i]` è quanto ha già
 * ricevuto oggi il ramo i; con questo contatto il totale sale di uno, e la quota
 * del ramo diventa percentuale × totale. Vince lo scarto più grande; a parità il
 * primo ramo. Un ramo allo 0% non riceve mai.
 */
export function ramoEquilibrato(percentuali: number[], conteggi: number[]): string {
  const totale = conteggi.reduce((s, c) => s + (Number(c) || 0), 0) + 1;
  let migliore = -1;
  let scartoMigliore = -Infinity;
  for (let i = 0; i < percentuali.length; i++) {
    if (!(percentuali[i] > 0)) continue;
    const scarto = (percentuali[i] / 100) * totale - (Number(conteggi[i]) || 0);
    if (scarto > scartoMigliore + 1e-9) {
      scartoMigliore = scarto;
      migliore = i;
    }
  }
  return letteraRamo(migliore < 0 ? 0 : migliore);
}

/**
 * La mezzanotte di oggi in Italia, come istante. "Oggi" per chi lavora i lead è
 * il giorno italiano: a mezzanotte UTC a Roma sono già l'una o le due.
 */
export function inizioGiornoRoma(adesso: Date): Date {
  const giorno = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(adesso);
  const mezzanotteUtc = Date.parse(`${giorno}T00:00:00Z`);
  const oreAvanti = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome", hour: "2-digit", hourCycle: "h23",
  }).format(new Date(mezzanotteUtc)));
  return new Date(mezzanotteUtc - oreAvanti * 3_600_000);
}
