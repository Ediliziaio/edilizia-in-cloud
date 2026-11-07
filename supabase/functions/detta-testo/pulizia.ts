/**
 * «Detta e ripulisci» — la parte che non parla con nessuno: il prompt e il
 * controllo di quello che il modello restituisce.
 *
 * Regola del titolare (07/11/2026): l'AI fa poco. Mette la punteggiatura,
 * scrive bene i termini di cantiere, toglie «ehm/allora/cioè» e le ripetizioni.
 * Non aggiunge fatti, numeri, nomi o lavorazioni e non riassume. Il controllo
 * qui sotto è la rete: se il testo pulito porta un numero che nella
 * trascrizione non c'è, o è molto più lungo o molto più corto, si scarta e la
 * persona riceve la trascrizione grezza. Meglio un testo sporco che un fatto
 * inventato in un rapportino.
 *
 * Niente import: lo provano i test di vitest così com'è.
 */

export const CONTESTI_DETTA = ["rapportino", "giornale"] as const;
export type ContestoDetta = (typeof CONTESTI_DETTA)[number];

/** I campi che si possono dettare, con quello che il modello deve sapere del campo. */
const CAMPI: Record<ContestoDetta, Record<string, string>> = {
  rapportino: {
    descrizione: "la descrizione dei lavori svolti nella giornata, scritta da chi era in cantiere",
    note: "le note del rapportino di cantiere",
  },
  giornale: {
    lavorazioni: "le lavorazioni eseguite oggi, nel giornale dei lavori",
    materiali: "i materiali utilizzati, nel giornale dei lavori",
    note: "le note aggiuntive del giornale dei lavori (problemi, osservazioni, comunicazioni)",
  },
};

export function campoValido(contesto: ContestoDetta, campo: unknown): string | null {
  return typeof campo === "string" && Object.prototype.hasOwnProperty.call(CAMPI[contesto], campo) ? campo : null;
}

export function promptPulizia(contesto: ContestoDetta, campo: string | null): string {
  const dove = (campo && CAMPI[contesto][campo]) || "un campo di testo di un gestionale per l'edilizia";
  return `Ricevi la trascrizione automatica di una persona che ha dettato dal telefono ${dove}.
Restituisci lo STESSO contenuto scritto in italiano corretto e leggibile.

Puoi fare SOLO questo:
- mettere punteggiatura, maiuscole e a capo dove servono;
- scrivere bene i termini di cantiere storpiati dalla trascrizione (es. «carton gesso» → «cartongesso», «massetto», «guaina», «ponteggio»);
- togliere intercalari ed esitazioni (ehm, allora, cioè, praticamente, tipo, diciamo, niente, ok) e le parole ripetute o le false partenze;
- scrivere i numeri detti a parole in cifre (es. «venti sacchi» → «20 sacchi»), solo se il numero è stato detto.

NON devi MAI:
- aggiungere fatti, numeri, quantità, misure, nomi, date, orari, materiali o lavorazioni che non sono stati detti;
- riassumere, accorciare o togliere informazioni: ogni cosa detta deve restare;
- interpretare, completare frasi lasciate a metà o dare consigli;
- tradurre il senso: se la persona parla male, sistema la forma, non il contenuto.

Se una parola non si capisce, lasciala com'è.
Rispondi SOLO con il testo pulito: niente titoli, niente virgolette, niente elenchi che la persona non ha detto, niente commenti.`;
}

/** Numeri scritti in cifre, normalizzati («1.500» e «1500» sono lo stesso numero). */
function numeriIn(testo: string): Set<string> {
  const trovati = testo.match(/\d+(?:[.,]\d+)*/g) ?? [];
  return new Set(trovati.map((n) => n.replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")));
}

// Numeri detti a parole: se nella trascrizione ci sono, il modello può averli
// messi in cifre (lo chiede il prompt) e il controllo non deve scartarlo.
const NUMERI_A_PAROLE =
  /\b(zero|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|undici|dodici|tredici|quattordici|quindici|sedici|diciassette|diciotto|diciannove|venti\w*|trent\w*|quarant\w*|cinquant\w*|sessant\w*|settant\w*|ottant\w*|novant\w*|cento\w*|mille\w*|mila|duemila\w*|mezz[oa]|metà)\b/i;

export type EsitoPulizia = { testo: string; scartato: false } | { testo: null; scartato: true; motivo: string };

/**
 * Il testo del modello, ripulito dagli involucri (virgolette, ```), oppure
 * `scartato` col motivo: in quel caso chi chiama restituisce la trascrizione.
 */
export function controllaTestoPulito(grezzoModello: unknown, trascrizione: string): EsitoPulizia {
  if (typeof grezzoModello !== "string") return { testo: null, scartato: true, motivo: "risposta_vuota" };
  let t = grezzoModello.trim()
    .replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/, "")
    .replace(/^(testo pulito|ecco il testo[^:]*)\s*:\s*/i, "")
    .trim();
  if (/^[«"“].*[»"”]$/s.test(t)) t = t.slice(1, -1).trim();
  if (!t) return { testo: null, scartato: true, motivo: "risposta_vuota" };

  const base = trascrizione.trim();
  // Togliere intercalari accorcia, riassumere accorcia molto: sotto il 40% è un riassunto.
  if (base.length >= 40 && t.length < base.length * 0.4) return { testo: null, scartato: true, motivo: "troppo_corto" };
  // La punteggiatura allunga di poco: il doppio vuol dire che ha aggiunto.
  if (t.length > base.length * 1.6 + 40) return { testo: null, scartato: true, motivo: "troppo_lungo" };

  const prima = numeriIn(base);
  const nuovi = [...numeriIn(t)].filter((n) => !prima.has(n));
  if (nuovi.length && !NUMERI_A_PAROLE.test(base)) return { testo: null, scartato: true, motivo: "numeri_aggiunti" };
  return { testo: t, scartato: false };
}
