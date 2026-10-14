import { calendarMidnight } from "./calendarTime.ts";
/** Bounded, tenant-scoped reconciliation. A failed/partial Google read never
 * authorizes deleting busy slots. Unchanged rows are not written again. */
export interface GoogleBusySlot {
  company_id: string; user_id: string; google_event_id: string; google_calendar_id: string;
  summary: string | null; start_at: string; end_at: string; is_all_day: boolean;
}
const BATCH = 100;
const MAX_PAGES = 20;
const COLUMNS = "id,company_id,user_id,google_event_id,google_calendar_id,summary,start_at,end_at,is_all_day";
const sameInstant = (a: string, b: string) => Date.parse(a) === Date.parse(b);
export function sameBusySlot(a: GoogleBusySlot, b: GoogleBusySlot) {
  return a.google_calendar_id === b.google_calendar_id && a.summary === b.summary
    && a.is_all_day === b.is_all_day && sameInstant(a.start_at, b.start_at) && sameInstant(a.end_at, b.end_at);
}
export async function syncGoogleBusySlots(db: any, scope: {
  companyId: string; userId: string; connectionId: string; calendarIds: string[]; accessToken: string;
  timeMin: string; timeMax: string;
}, send: typeof fetch = fetch) {
  let pulled = 0, written = 0, removed = 0;
  const failedCalendars: string[] = [];
  const deferredCalendars: string[] = [];
  const deadline = Date.now() + 45_000;
  for (const calendarId of new Set(scope.calendarIds)) {
    const owner = crypto.randomUUID();
    const lease = { p_company: scope.companyId, p_user: scope.userId, p_calendar: calendarId, p_owner: owner,p_connection:scope.connectionId };
    let acquired = false;
    try {
      if (Date.now() >= deadline) throw new Error("Sync budget exhausted");
      const claim = await db.rpc("gcal_busy_claim",lease)
        .abortSignal(AbortSignal.timeout(Math.max(1,deadline-Date.now())));
      if(claim.error)throw new Error("Calendar lease unavailable");
      if(claim.data===false){deferredCalendars.push(calendarId);continue;}
      if(claim.data!==true)throw new Error("Invalid calendar lease response");
      acquired = true;
      const rows = new Map<string, GoogleBusySlot>();
      const present = new Set<string>();
      const tokens = new Set<string>();
      let token: string | undefined;
      let complete = false;
      for (let page = 0; page < MAX_PAGES; page++) {
        if (Date.now() >= deadline) throw new Error("Sync budget exhausted");
        const params = new URLSearchParams({ timeMin: scope.timeMin, timeMax: scope.timeMax,
          singleEvents: "true", orderBy: "startTime", maxResults: "250" });
        if (token) params.set("pageToken", token);
        const response = await send(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`, {
          headers: { Authorization: `Bearer ${scope.accessToken}` },
          signal: AbortSignal.timeout(Math.min(15_000, Math.max(1, deadline - Date.now()))),
        });
        if (!response.ok) throw new Error("Google calendar read failed");
        const data = await response.json();
        if (!data || data.error || (data.items !== undefined && !Array.isArray(data.items))) throw new Error("Invalid Google response");
        for (const event of data.items ?? []) {
          if (typeof event.id !== "string" || !event.id) throw new Error("Event without identity");
          if (event.status === "cancelled" || event.transparency === "transparent"
            || event.eventType === "workingLocation" || event.attendees?.some((a: any) => a.self && a.responseStatus === "declined")
            || event.extendedProperties?.private?.eic_kind === "posa") continue;
          // Keep an existing slot when an event has malformed dates: absence
          // of a usable date does not mean its appointment has been deleted.
          present.add(event.id);
          const allDay = !!event.start?.date;
          const zone = data.timeZone || "Europe/Rome";
          const start = allDay ? calendarMidnight(event.start.date,zone) : event.start?.dateTime;
          const end = allDay ? calendarMidnight(event.end?.date ?? "",zone) : event.end?.dateTime;
          if (!start || !end || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start)) continue;
          rows.set(event.id, { company_id: scope.companyId, user_id: scope.userId,
            google_event_id: event.id, google_calendar_id: calendarId, summary: event.summary || null,
            start_at: start, end_at: end, is_all_day: allDay });
        }
        const next = data.nextPageToken;
        if (!next) { complete = true; break; }
        if (typeof next !== "string" || tokens.has(next)) throw new Error("Invalid pagination");
        tokens.add(next); token = next;
      }
      if (!complete) throw new Error("Incomplete Google snapshot");

      const existing: Array<GoogleBusySlot & { id: string }> = [];
      let readComplete = false;
      for (let page = 0; page < MAX_PAGES; page++) {
        if (Date.now() >= deadline) throw new Error("Sync budget exhausted");
        const { data, error } = await db.from("google_calendar_busy_slots").select(COLUMNS)
          .eq("company_id", scope.companyId).eq("user_id", scope.userId).eq("google_calendar_id", calendarId)
          .order("id").range(page * 1000, page * 1000 + 999)
          .abortSignal(AbortSignal.timeout(Math.max(1, deadline - Date.now())));
        if (error || !Array.isArray(data)) throw new Error("Busy slot read failed");
        existing.push(...data);
        if (data.length < 1000) { readComplete = true; break; }
      }
      if (!readComplete) throw new Error("Incomplete local snapshot");
      const byId = new Map(existing.map(row => [row.google_event_id, row]));
      const changed = [...rows.values()].filter(row => !byId.has(row.google_event_id) || !sameBusySlot(byId.get(row.google_event_id)!, row));
      for (let i = 0; i < changed.length; i += BATCH) {
        if (Date.now() >= deadline) throw new Error("Sync budget exhausted");
        // The RPC checks the owner token inside the same short transaction as
        // the write. An expired worker can never overwrite its successor.
        const { data,error } = await db.rpc("gcal_busy_batch", { ...lease,p_rows:changed.slice(i,i+BATCH),p_remove:[] })
          .abortSignal(AbortSignal.timeout(Math.max(1, deadline - Date.now())));
        if (error || !Number.isInteger(data?.written) || data.written<0 || data.written>Math.min(BATCH,changed.length-i)) throw new Error("Busy slot write failed");
        written += data.written;
      }
      // A snapshot owns only the rows it actually read. Include tenant/user/
      // calendar even when deleting by primary key, and bound every batch.
      const stale = existing.filter(row => !present.has(row.google_event_id)).map(row => row.id);
      for (let i = 0; i < stale.length; i += BATCH) {
        if (Date.now() >= deadline) throw new Error("Sync budget exhausted");
        const { data,error } = await db.rpc("gcal_busy_batch", { ...lease,p_rows:[],p_remove:stale.slice(i,i+BATCH) })
          .abortSignal(AbortSignal.timeout(Math.max(1, deadline - Date.now())));
        if (error || !Number.isInteger(data?.removed) || data.removed<0 || data.removed>Math.min(BATCH,stale.length-i)) throw new Error("Busy slot cleanup failed");
        removed += data.removed;
      }
      pulled += rows.size;
    } catch {
      // Never include tokens, event descriptions or provider bodies in logs.
      failedCalendars.push(calendarId);
    } finally {
      if (acquired) {
        // Crashed workers expire automatically. Release is token-scoped and
        // cannot unlock a newer worker; failure only delays the next attempt.
        try { await db.rpc("gcal_busy_release",lease).abortSignal(AbortSignal.timeout(3000)); } catch { /* TTL fallback */ }
      }
    }
  }
  return { pulled, written, removed, failedCalendars,...(deferredCalendars.length?{deferredCalendars}:{}) };
}
