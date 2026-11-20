const normalizza = (testo: string) => testo.normalize("NFKD").toLowerCase()
  .replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function terminiRicercaRicevute(ricerca: string): string[] {
  const gruppi = ricerca.match(/[\p{L}\p{N}\p{M}]+(?:[-./_]+[\p{L}\p{N}\p{M}]+)*/gu) ?? [];
  return gruppi.flatMap(gruppo => {
    const termine = normalizza(gruppo.replace(/(\p{L})[-./_]+(?=\d)/gu, "$1"));
    // Un numero fattura come 70/2026 deve comparire per intero nello stesso campo.
    return /\d[-./_]+\d/.test(gruppo) ? [termine] : termine.split(" ").filter(Boolean);
  });
}

export function corrispondeRicercaRicevute(termini: readonly string[], campi: readonly (string | null | undefined)[]): boolean {
  if (!termini.length) return true;
  const testi = campi.filter((t): t is string => !!t).map(normalizza);
  return termini.every(termine => {
    const codice = /\d/.test(termine) && /\p{L}/u.test(termine);
    const composto = termine.includes(" ");
    const cerca = (testo: string) => composto ? ` ${testo} `.includes(` ${termine} `) : testo.includes(termine);
    return testi.some(testo => cerca(testo) || (codice && cerca(testo.replace(/(\p{L}) (?=\d)/gu, "$1"))));
  });
}
