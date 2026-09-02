/**
 * outreach-spread — logica PURA di cadenza "umana".
 *
 * Prima l'arruolamento metteva lo stesso scheduled_for a tutti i contatti e il
 * dispatcher li sparava uno dietro l'altro nello stesso tick: con 3 caselle a
 * cap 10 partivano 30 email in pochi secondi dallo stesso IP. Qui il primo
 * contatto viene sparpagliato nel tempo in base alla capacita' del pool, e tra
 * un invio e l'altro il dispatcher fa una pausa variabile.
 */

export interface SpreadOptions {
  start: Date;
  count: number;
  /** Capacita' giornaliera del pool (somma dei cap effettivi delle caselle). */
  capPerDay: number;
  /** Minuti utili di invio al giorno (finestra Lun-Ven 8-19 ≈ 660). */
  windowMinutes?: number;
  /** Intervallo minimo tra due primi contatti, in secondi. */
  minGapSeconds?: number;
  rnd?: () => number;
}

/** Orari del primo contatto per `count` destinatari, distanziati e con jitter. */
export function spreadFirstTouch(o: SpreadOptions): Date[] {
  const rnd = o.rnd ?? Math.random;
  const window = Math.max(60, o.windowMinutes ?? 660) * 60;
  const gapBase = Math.max(o.minGapSeconds ?? 90, window / Math.max(1, o.capPerDay));
  const out: Date[] = [];
  let t = o.start.getTime();
  for (let i = 0; i < Math.max(0, o.count); i++) {
    out.push(new Date(t));
    // fattore 0.6 … 1.4: mai due intervalli uguali
    const fattore = 0.6 + 0.8 * clamp01(rnd());
    t += gapBase * fattore * 1000;
  }
  return out;
}

/** Pausa tra due invii consecutivi nello stesso tick (millisecondi). */
export function pauseBetweenSendsMs(rnd: () => number = Math.random, minMs = 8_000, maxMs = 25_000): number {
  const lo = Math.max(0, Math.min(minMs, maxMs));
  const hi = Math.max(minMs, maxMs);
  return Math.round(lo + (hi - lo) * clamp01(rnd()));
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0.5;
  return Math.min(1, Math.max(0, x));
}
