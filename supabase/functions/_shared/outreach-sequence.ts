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
/**
 * Se la data cade di sabato o domenica (fuso dato) la sposta al lunedi' alla
 * stessa ora: un follow-up "dopo 3 giorni" che scade nel weekend non deve
 * accumularsi e partire a raffica alle 8 di lunedi' insieme a tutti gli altri.
 */
export function spostaFuoriWeekend(d: Date, timeZone = "Europe/Rome"): Date {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(d);
  const salto = wd === "Sat" ? 2 : wd === "Sun" ? 1 : 0;
  return salto ? new Date(d.getTime() + salto * 86_400_000) : d;
}

/**
 * Ritardo tra due step di una sequenza LINEARE, da contare dall'invio reale
 * del precedente. I delay_days/delay_hours degli step lineari sono CUMULATIVI
 * dall'iscrizione — così li mostra e li salva l'editor («giorno 0, 3, 7…») e
 * così sono scritti i modelli — quindi il passo successivo parte dopo la
 * DIFFERENZA, non dopo il totale. Sommando il totale, una cadenza 0-3-7-12
 * diventava 0-3-10-22. Mai negativo.
 */
export function ritardoDalPrecedente(
  prev: Pick<SeqStep, "delay_days" | "delay_hours"> | null | undefined,
  next: Pick<SeqStep, "delay_days" | "delay_hours">,
): { giorni: number; ore: number } {
  const ore = (s: Pick<SeqStep, "delay_days" | "delay_hours"> | null | undefined) =>
    Math.max(0, Math.trunc(s?.delay_days ?? 0)) * 24 + Math.max(0, Math.trunc(s?.delay_hours ?? 0));
  const diff = Math.max(0, ore(next) - ore(prev));
  return { giorni: Math.floor(diff / 24), ore: diff % 24 };
}

export function computeStepSchedule(base: Date, delayDays?: number | null, delayHours?: number | null): Date {
  const d = Math.max(0, Math.trunc(delayDays ?? 0));
  const h = Math.max(0, Math.trunc(delayHours ?? 0));
  return new Date(base.getTime() + d * 86_400_000 + h * 3_600_000);
}

/**
 * Applica un jitter "umano" a una data, per spalmare gli invii nella finestra.
 * `rand` in [0,1) (di norma Math.random()).
 *
 * Default (3 argomenti) — INVARIATO: `applyJitter(date, 90, rand)` =
 * `date + floor(rand*90) min`, offset 0..maxMinutes al MINUTO tondo (legacy).
 *
 * Opzioni (opt-in, non cambiano il default):
 *  - `minMinutes` (default 0): offset minimo, così i passi non partono tutti
 *    esattamente al minuto del tick (niente accavallamento sul boundary).
 *  - `stepSeconds` (default 60): granularità in secondi. Passando 1 si ottiene una
 *    distribuzione al SECONDO (più naturale: gli invii non cadono tutti sul minuto).
 *
 * L'offset è sempre dentro [minMinutes, maxMinutes]; la finestra business (giorni/
 * orari) resta applicata a valle dal dispatcher — questo NON la scavalca.
 */
export function applyJitter(
  date: Date,
  maxMinutes: number,
  rand: number,
  opts: { minMinutes?: number; stepSeconds?: number } = {},
): Date {
  const maxM = Math.max(0, maxMinutes);
  const minM = Math.max(0, Math.min(opts.minMinutes ?? 0, maxM));
  const step = Math.max(1, Math.trunc(opts.stepSeconds ?? 60));
  const r = Math.max(0, Math.min(1, rand));
  const minSec = minM * 60;
  const maxSec = maxM * 60;
  // numero di "scalini" interi di ampiezza `step` nell'intervallo [minSec, maxSec).
  // L'offset è semi-aperto come il legacy: rand∈[0,1) ⇒ scalino∈[0, span-1] ⇒ il
  // massimo non viene mai raggiunto. Default step=60 ⇒ floor(rand*maxMinutes) minuti
  // ⇒ IDENTICO al comportamento storico (offset 0..maxMinutes-1 al minuto).
  const span = Math.max(0, Math.floor((maxSec - minSec) / step));
  const offsetSec = minSec + (span > 0 ? Math.min(span - 1, Math.floor(r * span)) * step : 0);
  return new Date(date.getTime() + offsetSec * 1000);
}
