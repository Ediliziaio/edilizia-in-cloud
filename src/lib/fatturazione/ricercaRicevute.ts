const normalizza = (testo: string) => testo.normalize("NFKD").toLowerCase()
  .replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** «ab 12» → «ab12»: un codice come «FPR 152» si trova anche scritto «FPR152». */
const senzaSpazioPrimaDelNumero = (testo: string) => testo.replace(/(\p{L}) (?=\d)/gu, "$1");

export function terminiRicercaRicevute(ricerca: string): string[] {
  const gruppi = ricerca.match(/[\p{L}\p{N}\p{M}]+(?:[-./_]+[\p{L}\p{N}\p{M}]+)*/gu) ?? [];
  return gruppi.flatMap(gruppo => {
    const termine = normalizza(gruppo.replace(/(\p{L})[-./_]+(?=\d)/gu, "$1"));
    // Un numero fattura come 70/2026 deve comparire per intero nello stesso campo.
    return /\d[-./_]+\d/.test(gruppo) ? [termine] : termine.split(" ").filter(Boolean);
  });
}

/**
 * Il testo di una riga, già pronto per la ricerca (23/11/2026).
 *
 * Normalizzare costa: Unicode NFKD e due espressioni regolari per ogni campo.
 * L'elenco delle fatture ricevute lo faceva a OGNI lettera digitata, su tutte le
 * righe e su tutti i campi — 1.294 fatture × una quindicina di campi per
 * Impresa Vulcano. Da quando le fatture sono contabilizzate ogni riga ha in più
 * la commessa (codice, descrizione, indirizzo), e il campo di ricerca ha
 * cominciato a restare indietro di due o tre lettere.
 *
 * Il testo si prepara UNA volta, quando cambiano i dati; a ogni lettera resta
 * solo un `includes` su stringhe pronte. La regola di confronto è la stessa:
 * `corrispondeRicercaRicevute` passa di qui.
 */
export interface TestoRicerca {
  readonly testi: readonly string[];
  /** Gli stessi testi con le lettere attaccate ai numeri, per i codici. */
  readonly compatti: readonly string[];
}

export function testoRicercaRicevute(campi: readonly (string | null | undefined)[]): TestoRicerca {
  const testi = campi.filter((t): t is string => !!t).map(normalizza);
  return { testi, compatti: testi.map(senzaSpazioPrimaDelNumero) };
}

export function corrispondeTestoPronto(termini: readonly string[], pronto: TestoRicerca | undefined): boolean {
  if (!termini.length) return true;
  if (!pronto) return false;
  const { testi, compatti } = pronto;
  return termini.every(termine => {
    const codice = /\d/.test(termine) && /\p{L}/u.test(termine);
    const composto = termine.includes(" ");
    const cerca = (testo: string) => composto ? ` ${testo} `.includes(` ${termine} `) : testo.includes(termine);
    for (let i = 0; i < testi.length; i++) {
      if (cerca(testi[i]) || (codice && cerca(compatti[i]))) return true;
    }
    return false;
  });
}

export function corrispondeRicercaRicevute(termini: readonly string[], campi: readonly (string | null | undefined)[]): boolean {
  if (!termini.length) return true;
  return corrispondeTestoPronto(termini, testoRicercaRicevute(campi));
}
