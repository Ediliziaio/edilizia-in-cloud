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
  const eligible = senders.filter((s) => remainingToday(s, today) > 0);
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
