/**
 * Le schede di «Manodopera e servizi».
 *
 * Una sola fila: la manodopera e, accanto, le tre parti di Manutenzione (tipi di impianto, tipi di intervento, prezzi).
 * Prima erano due file una dentro l'altra («Manodopera e Servizi | Manutenzione», poi «Tipi Impianto | Tipi Intervento |
 * Tariffe»). La pagina e l'indirizzo sono gli stessi di sempre: `…/tariffe`, con `?tab=` per la scheda.
 */

export type SchedaListino = "manodopera" | "impianti" | "interventi" | "prezzi";
export type SchedaManutenzione = Exclude<SchedaListino, "manodopera">;

export const SCHEDE_MANUTENZIONE: readonly SchedaManutenzione[] = ["impianti", "interventi", "prezzi"];

/**
 * `?tab=` → scheda aperta.
 * - niente, o `manodopera`: la manodopera;
 * - `impianti`, `interventi`, `prezzi`: la parte di Manutenzione col suo nome;
 * - `manutenzione`: l'indirizzo di prima (voce «Listino Manutenzione» della ricerca, vecchia pagina `listino-manutenzione`).
 *   Apre i tipi di impianto, che erano la prima scheda di Manutenzione.
 * Un valore che non conosciamo apre la manodopera, come prima.
 */
export function schedaDaParametro(tab: string | null | undefined): SchedaListino {
  switch (tab) {
    case "impianti":
    case "interventi":
    case "prezzi":
      return tab;
    case "manutenzione":
      return "impianti";
    default:
      return "manodopera";
  }
}

/** Il valore di `?tab=` per una scheda: nessuno per la manodopera, che è la pagina di partenza. */
export function parametroDaScheda(scheda: SchedaListino): string | null {
  return scheda === "manodopera" ? null : scheda;
}
