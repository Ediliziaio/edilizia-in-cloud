/**
 * Dai nomi detti a voce («c'erano Davide e Matteo») alle persone della squadra di oggi (24/11/2026).
 * L'AI non inventa nessuno: si segna solo chi è già nell'elenco del rapportino, e solo se il nome è chiaro.
 * Un nome di battesimo che hanno in due («Marco») non segna nessuno: lo sceglie il capo.
 */
export interface PersonaSquadra { key: string; nome: string }

const pulito = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

export function presenzeDaVoce(detti: string[], persone: PersonaSquadra[]): string[] {
  const trovate = new Set<string>();
  const parole = persone.map(p => ({ key: p.key, tutto: pulito(p.nome), pezzi: pulito(p.nome).split(" ").filter(x => x.length > 1) }));
  for (const detto of detti) {
    const d = pulito(detto);
    if (d.length < 2) continue;
    // 1) nome e cognome interi
    const intero = parole.filter(p => p.tutto === d || p.tutto.includes(d) && d.includes(" "));
    if (intero.length === 1) { trovate.add(intero[0].key); continue; }
    // 2) una sola parola (nome o cognome) che corrisponde a una persona sola
    const pezziDetti = d.split(" ").filter(x => x.length > 1);
    const candidati = parole.filter(p => pezziDetti.some(x => p.pezzi.includes(x)));
    if (candidati.length === 1) trovate.add(candidati[0].key);
  }
  return [...trovate];
}

/** Chi parla dice di esserci stato («eravamo io, Davide e Matteo», «anche io», «con me»). */
export function chiParlaCera(detti: string[], trascrizione = ""): boolean {
  const tutto = pulito([...detti, trascrizione].join(" , "));
  return detti.some(d => ["io", "me", "anche io", "io stesso"].includes(pulito(d)))
    || /\b(eravamo io|io e |io , |anche io|con me|io ho lavorato|ho lavorato io)\b/.test(` ${tutto} `);
}
