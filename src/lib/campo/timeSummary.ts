import { campoWorkDay, shiftWorkDay, workDayStart } from "./workDay";

/** Pure read model. Reconstruct sessions BEFORE filtering by site or day.
 * State is as of supplied now; durations are clipped to the selected day.
 */
export interface CampoPunch {
  id?: string;
  tipo: string;
  timestamp_evento: string;
  order_id: string | null;
}

export type CampoClockState = "out" | "working" | "paused";
export interface CampoTimeSegment {
  orderId: string | null;
  start: number;
  end: number;
  kind: "work" | "pause";
  provisional: boolean;
}
export interface CampoTimeIssue {
  kind: "invalid_event" | "duplicate_entry" | "site_change" | "orphan_event" | "context_mismatch" | "open_session";
  at: string;
}

/** Italian workday boundaries, including 23/25-hour daylight-saving days. */
export function campoDayWindow(day: string | Date = new Date()) {
  const date = typeof day === "string" ? day : campoWorkDay(day);
  const start = workDayStart(date);
  const end = workDayStart(shiftWorkDay(date, 1));
  const lookback = workDayStart(shiftWorkDay(date, -1));
  return { start, end, lookback };
}

export function summarizeCampoTime(
  punches: readonly CampoPunch[],
  options: { start: Date; end: Date; now: Date; includeOpen?: boolean },
) {
  const from = options.start.getTime();
  const until = Math.min(options.end.getTime(), options.now.getTime());
  const segments: CampoTimeSegment[] = [];
  const issues: CampoTimeIssue[] = [];
  const seen = new Set<string>();
  const events = punches.filter(p => {
    const ts = Date.parse(p.timestamp_evento);
    if (!Number.isFinite(ts) || !["entrata", "uscita", "pausa_inizio", "pausa_fine"].includes(p.tipo)) {
      issues.push({ kind: "invalid_event", at: p.timestamp_evento });
      return false;
    }
    // A confirmed exit after midnight also closes the previous day's portion.
    // Ignore genuinely future events, not valid events after the day boundary.
    if (ts > options.now.getTime()) return false;
    const key = p.id ?? `${p.tipo}|${ts}|${p.order_id ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => Date.parse(a.timestamp_evento) - Date.parse(b.timestamp_evento));
  let state: CampoClockState = "out";
  let orderId: string | null = null;
  let openedAt = 0;
  let lastEvent: CampoPunch | null = null;

  const append = (end: number, provisional = false) => {
    const start = Math.max(from, openedAt);
    const clippedEnd = Math.min(until, end);
    if (state !== "out" && clippedEnd > start) {
      segments.push({ orderId, start, end: clippedEnd, kind: state === "paused" ? "pause" : "work", provisional });
    }
  };
  for (const event of events) {
    const at = Date.parse(event.timestamp_evento);
    const issue = (kind: CampoTimeIssue["kind"]) => {
      if (at >= from && at <= until) issues.push({ kind, at: event.timestamp_evento });
    };
    lastEvent = event;
    if (event.tipo === "entrata") {
      if (state === "working" && orderId === event.order_id) {
        issue("duplicate_entry"); // Do not discard the first portion of work.
        continue;
      }
      if (state !== "out") { append(at); issue("site_change"); }
      state = "working";
      orderId = event.order_id;
      openedAt = at;
    } else if (event.tipo === "pausa_inizio") {
      if (state !== "working") { issue("orphan_event"); continue; }
      if (event.order_id && event.order_id !== orderId) issue("context_mismatch");
      append(at);
      state = "paused";
      openedAt = at;
    } else if (event.tipo === "pausa_fine") {
      if (state !== "paused") { issue("orphan_event"); continue; }
      append(at);
      if (event.order_id && event.order_id !== orderId) {
        issue("site_change");
        orderId = event.order_id;
      }
      state = "working";
      openedAt = at;
    } else {
      if (state === "out") { issue("orphan_event"); continue; }
      if (event.order_id && event.order_id !== orderId) issue("context_mismatch");
      append(at); // A generic/mismatched exit closes the actual open session.
      state = "out";
      orderId = null;
    }
  }
  if (state !== "out") {
    issues.push({ kind: "open_session", at: new Date(openedAt).toISOString() });
    // Never project a forgotten entry to midnight on a historical day.
    if (options.includeOpen && options.now < options.end) append(until, true);
  }
  const byOrder = new Map<string | null, { workMinutes: number; pauseMinutes: number; provisional: boolean }>();
  for (const segment of segments) {
    const total = byOrder.get(segment.orderId) ?? { workMinutes: 0, pauseMinutes: 0, provisional: false };
    const minutes = (segment.end - segment.start) / 60_000;
    if (segment.kind === "work") total.workMinutes += minutes;
    else total.pauseMinutes += minutes;
    total.provisional ||= segment.provisional;
    byOrder.set(segment.orderId, total);
  }
  return {
    segments, issues, byOrder, state, activeOrderId: orderId, lastEvent,
    workMinutes: [...byOrder.values()].reduce((sum, s) => sum + s.workMinutes, 0),
    pauseMinutes: [...byOrder.values()].reduce((sum, s) => sum + s.pauseMinutes, 0),
  };
}

/** Existing campo_rapportini.ore_lavorate stores tenths of an hour. */
export function campoReportHours(minutes: number) {
  return Math.round(minutes / 6) / 10;
}

/** Continuing a session never moves it to the currently opened screen's site. */
export function campoPunchOrderId(tipo: string, activeOrderId: string | null, selectedOrderId: string | null) {
  return tipo === "entrata" ? selectedOrderId : activeOrderId;
}

export function canRecordCampoPunch(state: CampoClockState, tipo: string) {
  return tipo === "entrata" ? state === "out" :
    tipo === "pausa_inizio" ? state === "working" :
    tipo === "pausa_fine" ? state === "paused" :
    tipo === "uscita" && state !== "out";
}
