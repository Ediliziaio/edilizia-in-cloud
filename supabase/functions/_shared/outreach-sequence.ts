/**
 * outreach-sequence — logica pura della cadenza di una sequenza cold.
 *
 * La cadenza viene percorsa SOLO sugli step email: l'invio SMS/WhatsApp non è
 * ancora cablato nel dispatcher, quindi gli step non-email vengono saltati nel
 * calcolo della cadenza (e contati a parte per trasparenza nella UI). Le date di
 * schedulazione sono "grezze": la finestra di invio (Lun-Ven, orari) la applica
 * il dispatcher, unica fonte di verità per gli orari.
 */

export interface SeqStep {
  step_order: number;
  channel: string;
  delay_days?: number | null;
  delay_hours?: number | null;
  subject?: string | null;
  body?: string | null;
}

/** Step email ordinati per step_order crescente. */
export function emailSteps(steps: SeqStep[]): SeqStep[] {
  return steps
    .filter((s) => s.channel === "email")
    .sort((a, b) => a.step_order - b.step_order);
}

/** Primo step email della sequenza, o null se non ce ne sono. */
export function firstEmailStep(steps: SeqStep[]): SeqStep | null {
  return emailSteps(steps)[0] ?? null;
}

/**
 * Prossimo step email con step_order > afterOrder.
 * Se afterOrder è null ritorna il primo. Null = cadenza terminata.
 */
export function nextEmailStep(steps: SeqStep[], afterOrder: number | null): SeqStep | null {
  const es = emailSteps(steps);
  if (afterOrder == null) return es[0] ?? null;
  return es.find((s) => s.step_order > afterOrder) ?? null;
}

/** Numero di step non-email (saltati dalla cadenza, mostrati nella UI). */
export function nonEmailStepCount(steps: SeqStep[]): number {
  return steps.filter((s) => s.channel !== "email").length;
}

/**
 * Quando spedire uno step: base + delay (giorni + ore), mai nel passato.
 * La finestra di invio è applicata a valle dal dispatcher.
 */
export function computeStepSchedule(base: Date, delayDays?: number | null, delayHours?: number | null): Date {
  const d = Math.max(0, Math.trunc(delayDays ?? 0));
  const h = Math.max(0, Math.trunc(delayHours ?? 0));
  return new Date(base.getTime() + d * 86_400_000 + h * 3_600_000);
}

/** Applica un jitter casuale (0..maxMinutes) a una data, per spalmare gli invii. rand in [0,1). */
export function applyJitter(date: Date, maxMinutes: number, rand: number): Date {
  const m = Math.max(0, maxMinutes);
  const offset = Math.floor(Math.max(0, Math.min(1, rand)) * m) * 60_000;
  return new Date(date.getTime() + offset);
}
