/**
 * openwaPickNumber — logica PURA di rotazione + ANTI-BAN dei numeri WhatsApp
 * Locale (OpenWA). Niente Deno/Supabase: testabile in vitest.
 *
 * Anti-ban:
 *  - WARM-UP: cap del giorno = min(daily_cap, warmup_base + giorni*warmup_step).
 *    Un numero appena collegato invia pochissimo e cresce nel tempo.
 *  - THROTTLE: un numero che ha inviato da meno di min_gap_seconds è escluso
 *    (niente raffiche back-to-back).
 *
 * Rotazione:
 *  - un numero invia solo se `connected`, non throttlato e con capacità residua;
 *  - numero senza tag = jolly; con tag serve solo chi condivide un tag;
 *  - si sceglie il MENO carico (max residuo), tie-break per id.
 */

export interface OpenWaNumberState {
  id: string;
  stato: string;
  tags: string[];
  daily_cap: number;
  daily_sent: number;
  daily_sent_date: string | null;   // 'YYYY-MM-DD'
  // Anti-ban (opzionali: assenti → nessun warm-up/throttle, retro-compatibile).
  connected_since?: string | null;  // 'YYYY-MM-DD'
  warmup_base?: number | null;
  warmup_step?: number | null;
  min_gap_seconds?: number | null;
  last_message_at?: string | null;  // ISO timestamp
  // Tetto settimanale (opzionale).
  weekly_cap?: number | null;
  weekly_sent?: number | null;
  weekly_sent_week?: string | null;
}

/** Chiave settimana per il reset del tetto settimanale (blocchi di 7 giorni). */
export function weekKeyOf(dateStr: string): string {
  const ms = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(ms)) return "";
  return `W${Math.floor(ms / (7 * 86_400_000))}`;
}

/** Residuo settimanale del numero (mai negativo). Senza weekly_cap = infinito. */
export function weeklyRemainingOpenWa(n: OpenWaNumberState, weekKey: string): number {
  if (n.weekly_cap == null) return Number.POSITIVE_INFINITY;
  const sent = n.weekly_sent_week === weekKey ? Math.max(0, n.weekly_sent ?? 0) : 0;
  return Math.max(0, n.weekly_cap - sent);
}

/** Giorni interi tra due date YYYY-MM-DD (>= 0). */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

/**
 * Cap effettivo di oggi con warm-up. Se i parametri di warm-up non ci sono,
 * ritorna il daily_cap pieno (comportamento legacy).
 */
export function effectiveCapOpenWa(n: OpenWaNumberState, today: string): number {
  const cap = Math.max(0, n.daily_cap);
  if (n.warmup_base == null || n.warmup_step == null) return cap;
  if (!n.connected_since) return Math.min(cap, Math.max(0, n.warmup_base)); // giorno 0 conservativo
  const days = daysBetween(n.connected_since, today);
  const warm = n.warmup_base + days * n.warmup_step;
  return Math.max(0, Math.min(cap, warm));
}

/** Inviati oggi: 0 se il contatore è di un altro giorno (reset implicito). */
export function sentTodayOpenWa(n: OpenWaNumberState, today: string): number {
  return n.daily_sent_date === today ? Math.max(0, n.daily_sent) : 0;
}

/** Capacità residua oggi (con warm-up). Solo numeri `connected` contribuiscono. */
export function remainingTodayOpenWa(n: OpenWaNumberState, today: string): number {
  if (n.stato !== "connected") return 0;
  return Math.max(0, effectiveCapOpenWa(n, today) - sentTodayOpenWa(n, today));
}

/** True se il numero ha inviato da meno di min_gap_seconds (throttle anti-raffica). */
export function isThrottledOpenWa(n: OpenWaNumberState, nowMs: number): boolean {
  if (!n.last_message_at || !n.min_gap_seconds) return false;
  const last = Date.parse(n.last_message_at);
  if (Number.isNaN(last)) return false;
  return nowMs - last < n.min_gap_seconds * 1000;
}

/** Il numero è idoneo a servire il contatto in base ai tag? */
export function numberServesContact(numberTags: string[], contactTags: string[]): boolean {
  if (!numberTags || numberTags.length === 0) return true;
  if (!contactTags || contactTags.length === 0) return false;
  return numberTags.some((t) => contactTags.includes(t));
}

/** Capacità totale residua del pool (per UI / diagnostica). */
export function totalRemainingOpenWa(numbers: OpenWaNumberState[], today: string): number {
  return numbers.reduce((sum, n) => sum + remainingTodayOpenWa(n, today), 0);
}

/**
 * Sceglie il numero mittente per un contatto. `nowMs` (opzionale) attiva il
 * throttle: se passato, i numeri che hanno inviato troppo di recente sono esclusi.
 * Ritorna null se nessun numero è idoneo/ha capacità.
 */
export function pickOpenWaNumber(
  numbers: OpenWaNumberState[],
  contactTags: string[],
  today: string,
  nowMs?: number,
  weekKey?: string,
): OpenWaNumberState | null {
  // Residuo effettivo = min(residuo giornaliero, residuo settimanale se attivo).
  const effRemaining = (n: OpenWaNumberState): number => {
    const daily = remainingTodayOpenWa(n, today);
    if (weekKey == null) return daily;
    return Math.min(daily, weeklyRemainingOpenWa(n, weekKey));
  };

  const eligible = numbers
    .filter((n) => effRemaining(n) > 0)
    .filter((n) => (nowMs == null ? true : !isThrottledOpenWa(n, nowMs)))
    .filter((n) => numberServesContact(n.tags ?? [], contactTags ?? []));
  if (eligible.length === 0) return null;

  eligible.sort((a, b) => {
    const ra = effRemaining(a);
    const rb = effRemaining(b);
    if (rb !== ra) return rb - ra;
    return a.id.localeCompare(b.id);
  });
  return eligible[0];
}
