/**
 * Quanto si somigliano due nomi di lavoro, e chi ha fatto più spesso un lavoro simile
 * (31/10/2026 per le ditte di Dimora; in shared/ dall'1/11/2026, fase 4 di Silvio).
 *
 * Dimora affida sempre lo stesso tipo di lavoro alla stessa ditta: le commesse passate dicono
 * chi fa cosa («IMPIANTO IDRAULICO» = «Impianto idraulico», «CARTONGESSI» = «Cartongesso»).
 * Lo stesso vale per gli operai, per i mezzi usati in una fase e per il fornitore di una voce.
 *
 * Senza dipendenze, compatibile con Deno.
 */
const PAROLE_VUOTE = new Set([
  "di", "e", "ed", "in", "a", "da", "del", "della", "dello", "dei", "delle", "degli", "la", "il", "lo", "le", "gli", "i",
  "per", "con", "su", "opera", "opere", "lavori", "lavoro", "impianto", "impianti", "varie", "vari",
]);

/** Le parole che contano nel nome di una fase, senza accenti, plurali e articoli. */
export function paroleFase(nome: string): string[] {
  const parole = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((p) => p.length >= 2 && !PAROLE_VUOTE.has(p))
    // «demolizioni» e «demolizione», «cartongessi» e «cartongesso»: stessa radice.
    .map((p) => (p.length > 4 ? p.replace(/[aeiou]+$/, "") : p))
    .filter((p) => p.length >= 2);
  return [...new Set(parole)];
}

/** Quanto si somigliano due nomi di fase: 0 niente, 1 uguali. */
export function somiglianzaFasi(a: string, b: string): number {
  const x = paroleFase(a);
  const y = new Set(paroleFase(b));
  if (!x.length || !y.size) return 0;
  const comuni = x.filter((p) => y.has(p)).length;
  return comuni / new Set([...x, ...y]).size;
}

export interface FaseStorica {
  /** Nome della fase in un'altra commessa. */
  fase: string;
  external_team_id: string;
}

export interface DittaProposta {
  external_team_id: string;
  /** Quante fasi simili, nelle altre commesse, ha fatto questa ditta. */
  volte: number;
  /** La fase più simile, per dire perché. */
  come: string;
}

/**
 * La ditta da proporre per una fase: quella che nelle altre commesse ha fatto
 * più fasi con un nome simile (almeno metà delle parole in comune). Nessuna = null.
 */
export function dittaProposta(nomeFase: string, storico: FaseStorica[]): DittaProposta | null {
  const [migliore] = piuSimili(nomeFase, storico.map((s) => ({ id: s.external_team_id, nome: s.fase })));
  return migliore ? { external_team_id: migliore.id, volte: migliore.volte, come: migliore.come } : null;
}


export interface PiuSimile {
  /** Id di chi l'ha fatto (ditta, dipendente, mezzo, fornitore). */
  id: string;
  /** Quante volte, nelle altre commesse, un lavoro simile. */
  volte: number;
  /** Il nome più simile, per dire perché. */
  come: string;
  /** La somiglianza migliore, 0–1. */
  somiglianza: number;
}

/**
 * Chi ha fatto più lavori con un nome simile (almeno metà delle parole in comune), dal più
 * simile; a parità di somiglianza chi l'ha fatto più volte. `esclusi` non entrano.
 */
export function piuSimili(nome: string, storico: ReadonlyArray<{ id: string; nome: string }>, esclusi: ReadonlySet<string> = new Set()): PiuSimile[] {
  const perId = new Map<string, { punti: number; volte: number; migliore: number; come: string }>();
  for (const s of storico) {
    if (esclusi.has(s.id)) continue;
    const sim = somiglianzaFasi(nome, s.nome);
    if (sim < 0.5) continue;
    const d = perId.get(s.id) ?? { punti: 0, volte: 0, migliore: 0, come: s.nome };
    d.punti += sim;
    d.volte += 1;
    if (sim > d.migliore) Object.assign(d, { migliore: sim, come: s.nome });
    perId.set(s.id, d);
  }
  return [...perId.entries()]
    .sort((a, b) => b[1].migliore - a[1].migliore || b[1].punti - a[1].punti)
    .map(([id, d]) => ({ id, volte: d.volte, come: d.come, somiglianza: d.migliore }));
}
