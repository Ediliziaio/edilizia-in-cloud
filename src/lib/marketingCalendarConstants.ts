export const CALENDAR_COLORS = [
  "bg-blue-500/20 border-blue-500 text-blue-900 dark:text-blue-200",
  "bg-green-500/20 border-green-500 text-green-900 dark:text-green-200",
  "bg-purple-500/20 border-purple-500 text-purple-900 dark:text-purple-200",
  "bg-orange-500/20 border-orange-500 text-orange-900 dark:text-orange-200",
  "bg-pink-500/20 border-pink-500 text-pink-900 dark:text-pink-200",
  "bg-cyan-500/20 border-cyan-500 text-cyan-900 dark:text-cyan-200",
];



/**
 * 2026-05-27 (richiesta utente "non vedo appuntamenti prima delle 8"):
 * range esteso da 08:00–22:00 a 06:00–23:00. Copre i casi reali del
 * mestiere — sopralluoghi mattutini alle 7, cantieri serali — senza
 * far esplodere l'altezza del DOM (era 14h × 2 slot = 28; ora 17h × 2 = 34).
 *
 * Una vista 00:00-23:59 (48 slot) sarebbe troppo: scroll infinito,
 * appuntamenti minuscoli. Se serve un range custom in futuro,
 * accettare parametri startHour/endHour qui.
 */
export const CALENDAR_START_HOUR = 6;
export const CALENDAR_END_HOUR = 23;

export function buildTimeSlots(slotMinutes: number): string[] {
  const slots: string[] = [];
  for (let m = CALENDAR_START_HOUR * 60; m < CALENDAR_END_HOUR * 60; m += slotMinutes) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
  return slots;
}

export function buildColorMap(calendarIds: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  calendarIds.forEach((id, i) => {
    map[id] = CALENDAR_COLORS[i % CALENDAR_COLORS.length];
  });
  return map;
}

/** Convert "HH:MM" to total minutes */
export function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Convert total minutes to "HH:MM" string */
export function minutesToTimeStr(totalMin: number): string {
  const clamped = Math.max(0, Math.min(totalMin, 23 * 60 + 59));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Add minutes to a "HH:MM" time string */
export function addMinutesToTimeStr(t: string, mins: number): string {
  return minutesToTimeStr(timeToMin(t) + mins);
}

/**
 * Layout di sovrapposizione stile Google Calendar: per ogni appuntamento di una
 * giornata calcola in quale "colonna" affiancarlo e quante colonne servono nel
 * suo cluster di sovrapposizioni. Così due appuntamenti che condividono la stessa
 * fascia oraria vengono mostrati fianco a fianco (mezza larghezza ciascuno) invece
 * che uno sopra l'altro.
 *
 * Algoritmo standard a colonne: ordina per inizio, raggruppa gli eventi che si
 * sovrappongono a catena, e assegna ad ognuno la prima colonna libera.
 */
export interface OverlapPlacement {
  column: number;
  columnsCount: number;
}

export function computeOverlapLayout(
  items: { id: string; start: number; end: number }[],
): Map<string, OverlapPlacement> {
  const result = new Map<string, OverlapPlacement>();
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);

  let cluster: typeof sorted = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;
    // columns[c] = orario di fine dell'ultimo evento nella colonna c
    const columns: number[] = [];
    const colOf = new Map<string, number>();
    for (const ev of cluster) {
      let placed = -1;
      for (let c = 0; c < columns.length; c++) {
        if (columns[c] <= ev.start) { placed = c; break; }
      }
      if (placed === -1) { placed = columns.length; columns.push(ev.end); }
      else { columns[placed] = ev.end; }
      colOf.set(ev.id, placed);
    }
    const columnsCount = columns.length;
    for (const ev of cluster) {
      result.set(ev.id, { column: colOf.get(ev.id) ?? 0, columnsCount });
    }
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const ev of sorted) {
    if (cluster.length > 0 && ev.start >= clusterEnd) flush();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.end);
  }
  flush();

  return result;
}
