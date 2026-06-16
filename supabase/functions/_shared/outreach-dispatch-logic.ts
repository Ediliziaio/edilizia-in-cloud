/**
 * outreach-dispatch-logic — logica PURA del dispatcher cold (niente Deno/Supabase).
 * Isolata per essere testabile in vitest (come _shared/sequenze-logic.ts).
 * Gestisce: cap effettivo con warm-up, capacità residua giornaliera per casella,
 * assegnazione round-robin dei messaggi alle caselle rispettando i cap.
 */

export interface SenderState {
  id: string;
  status: string; // 'warming' | 'active' | 'paused' | 'disabled'
  daily_cap_target: number;
  warmup_base: number;
  warmup_step: number;
  warmup_day: number;
  daily_sent: number;
  daily_sent_date: string | null; // 'YYYY-MM-DD'
}

/** Cap del giorno con ramp di warm-up: min(target, base + giorno*step). Mai negativo. */
export function effectiveDailyCap(s: SenderState): number {
  const ramped = s.warmup_base + s.warmup_day * s.warmup_step;
  return Math.max(0, Math.min(s.daily_cap_target, ramped));
}

/** Inviati oggi: se il contatore è di un altro giorno vale 0 (reset implicito). */
export function sentToday(s: SenderState, today: string): number {
  return s.daily_sent_date === today ? Math.max(0, s.daily_sent) : 0;
}

/** Solo caselle attive/in warm-up contribuiscono; altrimenti 0. */
export function remainingToday(s: SenderState, today: string): number {
  if (s.status !== "active" && s.status !== "warming") return 0;
  return Math.max(0, effectiveDailyCap(s) - sentToday(s, today));
}

/** Capacità totale del pool nel giorno. */
export function totalCapacity(senders: SenderState[], today: string): number {
  return senders.reduce((sum, s) => sum + remainingToday(s, today), 0);
}

/** Cap a REGIME di una casella (warm-up completato): il target. Solo se eleggibile. */
export function steadyCap(s: SenderState): number {
  if (s.status !== "active" && s.status !== "warming") return 0;
  return Math.max(0, s.daily_cap_target);
}

export interface PoolCapacityStats {
  /** Caselle che contano (active/warming). */
  eligible: number;
  /** Capacità EFFETTIVA oggi (somma residui = ciò che il dispatcher può spedire ora). */
  effectiveToday: number;
  /** Capacità a regime (somma dei target, a warm-up finito). */
  steady: number;
  /** Caselle ancora in riscaldamento (cap effettivo < target). */
  warming: number;
  /**
   * Quante caselle servono per coprire `target` invii/giorno a regime, stimate
   * sul cap medio per casella del pool (target medio delle caselle eleggibili).
   * 0 se non c'è alcuna casella; -1 se la capacità a regime già copre il target.
   */
  mailboxesNeededForTarget: number;
  /** Caselle ancora da aggiungere per il target (max(0, needed − eligible)). */
  mailboxesToAdd: number;
}

/**
 * Riepilogo capacità del pool per la UI "a scala" (es. ~1000/giorno). Calcolo
 * ONESTO: la stima del numero di caselle usa il cap-target MEDIO per casella del
 * pool reale; senza caselle ricade su un default ragionevole (`fallbackCap`).
 * Pura, niente Deno/Supabase, così la stessa matematica del dispatcher alimenta la UI.
 */
export function poolCapacityStats(
  senders: SenderState[], today: string, target: number, fallbackCap = 40,
): PoolCapacityStats {
  const eligibleSenders = senders.filter((s) => s.status === "active" || s.status === "warming");
  const eligible = eligibleSenders.length;
  const effectiveToday = eligibleSenders.reduce((sum, s) => sum + remainingToday(s, today), 0);
  const steady = eligibleSenders.reduce((sum, s) => sum + steadyCap(s), 0);
  const warming = eligibleSenders.filter((s) => effectiveDailyCap(s) < s.daily_cap_target).length;

  const tgt = Math.max(0, target);
  const avgCap = eligible > 0
    ? eligibleSenders.reduce((sum, s) => sum + Math.max(1, s.daily_cap_target), 0) / eligible
    : Math.max(1, fallbackCap);
  let mailboxesNeededForTarget: number;
  if (tgt === 0) mailboxesNeededForTarget = 0;
  else if (steady >= tgt && eligible > 0) mailboxesNeededForTarget = -1; // già coperto a regime
  else mailboxesNeededForTarget = Math.ceil(tgt / avgCap);
  const mailboxesToAdd = mailboxesNeededForTarget < 0 ? 0 : Math.max(0, mailboxesNeededForTarget - eligible);

  return { eligible, effectiveToday, steady, warming, mailboxesNeededForTarget, mailboxesToAdd };
}

/** Auto-pausa se bounce/lamentele superano le soglie assolute. */
export function shouldAutoPause(
  bounceCount: number, complaintCount: number,
  maxBounces = 10, maxComplaints = 2,
): boolean {
  return bounceCount >= maxBounces || complaintCount >= maxComplaints;
}

export interface Assignment { queueId: string; senderId: string; }

/**
 * Assegna i messaggi in coda alle caselle in ROUND-ROBIN, consumando i cap.
 * Distribuisce il volume per proteggere la reputazione invece di saturare
 * una casella sola. I messaggi oltre la capacità totale restano `unassigned`
 * (verranno ripresi al tick successivo).
 */
export function assignSenders(
  queueIds: string[], senders: SenderState[], today: string,
): { assignments: Assignment[]; unassigned: string[] } {
  // Ordine ROTAZIONE deterministico (per id): a scala (100 caselle) il round-robin
  // resta stabile e prevedibile tra i tick a prescindere dall'ordine di riga del DB,
  // così il volume si spalma in modo equo e ripetibile sul pool.
  const eligible = senders
    .filter((s) => remainingToday(s, today) > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
  const remaining = new Map<string, number>();
  for (const s of eligible) remaining.set(s.id, remainingToday(s, today));

  const assignments: Assignment[] = [];
  const unassigned: string[] = [];
  let cursor = 0;

  for (const queueId of queueIds) {
    let placed = false;
    for (let tries = 0; tries < eligible.length; tries++) {
      const s = eligible[(cursor + tries) % eligible.length];
      const cap = remaining.get(s.id) ?? 0;
      if (cap > 0) {
        assignments.push({ queueId, senderId: s.id });
        remaining.set(s.id, cap - 1);
        cursor = (cursor + tries + 1) % eligible.length;
        placed = true;
        break;
      }
    }
    if (!placed) unassigned.push(queueId);
  }
  return { assignments, unassigned };
}
