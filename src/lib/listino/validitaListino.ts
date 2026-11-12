/**
 * Quali listini di un fornitore valgono oggi.
 *
 * Un fornitore ha piu' listini: il listino generale, il contratto per un
 * cantiere, l'offerta dell'anno scorso. Il suggerimento prezzo sugli ordini
 * d'acquisto deve pescare SOLO da quelli in vigore, altrimenti il giorno dopo
 * la scadenza continua a proporre i prezzi vecchi come se fossero pattuiti e
 * nessuno lo dice. Scoperto il 12/11/2026 su un contratto di fornitura di
 * calcestruzzo con scadenza a fine novembre: il programma guardava solo il
 * flag `attivo`.
 *
 * Come per il contratto d'appalto, la regola sta in UN posto solo: la scheda
 * fornitore e il suggerimento prezzo devono rispondere allo stesso modo.
 */

import { oggiISO } from "@/lib/appalto/contratti";

export interface ListinoValidita {
  /** Null = vale da sempre: un listino senza data di inizio e' gia' in vigore. */
  valido_dal: string | null;
  /** Null = senza scadenza. */
  valido_al: string | null;
  attivo: boolean;
}

export type StatoListino = "in_vigore" | "scaduto" | "non_ancora" | "spento";

/** Lo stato di un listino alla data data (per i test) o a oggi. */
export function statoListino(l: ListinoValidita, oggi: string = oggiISO()): StatoListino {
  if (!l.attivo) return "spento";
  if (l.valido_al && l.valido_al < oggi) return "scaduto";
  if (l.valido_dal && l.valido_dal > oggi) return "non_ancora";
  return "in_vigore";
}

/** Vero solo per i listini da cui si puo' suggerire un prezzo. */
export function listinoInVigore(l: ListinoValidita, oggi: string = oggiISO()): boolean {
  return statoListino(l, oggi) === "in_vigore";
}

/** Quello che si scrive accanto al nome del listino. Null quando e' tutto in ordine. */
export function etichettaValidita(l: ListinoValidita, oggi: string = oggiISO()): string | null {
  switch (statoListino(l, oggi)) {
    case "scaduto":
      return `scaduto il ${giornoItaliano(l.valido_al)}`;
    case "non_ancora":
      return `in vigore dal ${giornoItaliano(l.valido_dal)}`;
    case "spento":
      return "disattivato";
    default:
      return null;
  }
}

/**
 * Vero quando il listino e' in vigore ma scade entro i giorni indicati: serve
 * per avvisare prima, non il giorno dopo.
 */
export function listinoInScadenza(l: ListinoValidita, giorni = 30, oggi: string = oggiISO()): boolean {
  if (!l.valido_al || statoListino(l, oggi) !== "in_vigore") return false;
  const limite = new Date(`${oggi}T00:00:00`);
  limite.setDate(limite.getDate() + giorni);
  return l.valido_al <= limite.toLocaleDateString("en-CA");
}

/**
 * Il listino da aprire per primo sulla scheda fornitore: fra quelli in vigore
 * il piu' recente (l'elenco arriva ordinato per `valido_dal` decrescente),
 * altrimenti il primo attivo, altrimenti il primo che c'e'. Meglio mostrare un
 * listino scaduto, visibile e correggibile, che una scheda vuota.
 */
export function listinoDiOggi<T extends ListinoValidita & { id: string }>(
  lista: readonly T[],
  oggi: string = oggiISO(),
): T | null {
  return lista.find((l) => listinoInVigore(l, oggi)) ?? lista.find((l) => l.attivo) ?? lista[0] ?? null;
}

/** "2026-11-30" → "30/11/2026", senza passare da Date (niente scivoloni di fuso). */
export function giornoItaliano(iso: string | null): string {
  if (!iso) return "";
  const [a, m, g] = iso.slice(0, 10).split("-");
  return g && m && a ? `${g}/${m}/${a}` : iso;
}
