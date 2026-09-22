/**
 * La finestra oraria di un flusso di automazione, giorno per giorno
 * (22/09/2026). Logica pura, provata in src/test/logic/finestraFlusso.test.ts.
 *
 * Prima era una sola fascia, uguale per tutti i giorni della settimana. Il
 * «Flusso Appuntamenti» vuole i messaggi 2, 3 e 4 dal lunedì al venerdì fra
 * le 8:30 e le 19:30, il sabato fra le 9 e le 13, mai la domenica. Sabato e
 * domenica ora hanno una regola propria:
 *   null o ""       come gli altri giorni (il comportamento di prima);
 *   "chiuso"        nessun invio quel giorno;
 *   "09:00-13:00"   una fascia propria.
 */

export interface FinestraFlusso {
  /** Apertura e chiusura dei giorni feriali, in minuti dalla mezzanotte. */
  apre: number;
  chiude: number;
  sabato?: string | null;
  domenica?: string | null;
}

export type RegolaGiorno =
  | { tipo: "uguale" }
  | { tipo: "chiuso" }
  | { tipo: "fascia"; da: number; a: number };

function minuti(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const ore = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (ore > 24 || min > 59) return null;
  return ore * 60 + min;
}

/** Legge la regola di un giorno. Un valore illeggibile vale «come gli altri giorni». */
export function regolaGiorno(valore: string | null | undefined): RegolaGiorno {
  const v = String(valore ?? "").trim().toLowerCase();
  if (!v) return { tipo: "uguale" };
  if (v === "chiuso") return { tipo: "chiuso" };
  const [da, a] = v.split("-").map((x) => minuti(x));
  if (da == null || a == null || a <= da) return { tipo: "uguale" };
  return { tipo: "fascia", da, a };
}

/** Scrive una regola come la salva il database. */
export function scriviRegolaGiorno(r: RegolaGiorno): string | null {
  if (r.tipo === "uguale") return null;
  if (r.tipo === "chiuso") return "chiuso";
  const hhmm = (x: number) => `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
  return `${hhmm(r.da)}-${hhmm(r.a)}`;
}

/** La fascia aperta di un giorno (1 = lunedì … 7 = domenica); null = chiuso. */
function fasciaDelGiorno(isodow: number, f: FinestraFlusso): { da: number; a: number } | null {
  const regola = isodow === 6 ? regolaGiorno(f.sabato) : isodow === 7 ? regolaGiorno(f.domenica) : { tipo: "uguale" as const };
  if (regola.tipo === "chiuso") return null;
  if (regola.tipo === "fascia") return { da: regola.da, a: regola.a };
  return { da: f.apre, a: f.chiude };
}

/**
 * Fra quanti minuti si può inviare: 0 se la finestra è aperta adesso,
 * altrimenti fino alla prossima apertura. Mai un invio anticipato, al massimo
 * ritardato. Una finestra incoerente non blocca: meglio un invio fuori orario
 * che una sequenza ferma per sempre.
 */
export function minutiAllApertura(minutiOra: number, isodow: number, f: FinestraFlusso): number {
  // Finestra incoerente (chiusura <= apertura): si ignora, come prima.
  if (f.chiude <= f.apre) return 0;
  for (let giorni = 0; giorni < 8; giorni++) {
    const giorno = ((isodow - 1 + giorni) % 7) + 1;
    const fascia = fasciaDelGiorno(giorno, f);
    if (!fascia) continue;
    if (giorni === 0) {
      if (minutiOra < fascia.da) return fascia.da - minutiOra;
      if (minutiOra < fascia.a) return 0;
      continue;
    }
    return (1440 - minutiOra) + (giorni - 1) * 1440 + fascia.da;
  }
  return 0;
}
