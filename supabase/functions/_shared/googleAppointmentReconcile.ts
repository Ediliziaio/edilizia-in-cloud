import { dataOraItaliana } from "./oraItaliana.ts";

type GoogleEvent = { id: string; status?: string; summary?: string; etag?: string; [key: string]: unknown };
type Fetcher = typeof fetch;
export interface MappedGoogleAppointment {
  id: string; appointment_id: string; google_event_id: string;
  company_id: string; user_id: string; google_calendar_id: string;
}
export interface ReconciledAppointment {
  id: string; appointment_date: string | null; appointment_time: string | null;
  status: string | null; is_completed: boolean | null; updated_at: string | null;
  internal_notes: string | null;
}

/** Read every page before reconciling. A partial list must never be a deletion signal. */
export async function listGoogleAppointmentEvents(
  calendarId: string, accessToken: string, timeMin: string, timeMax: string,
  fetcher: Fetcher = fetch,
): Promise<GoogleEvent[]> {
  const events = new Map<string, GoogleEvent>();
  const tokens = new Set<string>();
  let token: string | undefined;
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "500" });
    if (token) params.set("pageToken", token);
    const response = await fetcher(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok) throw new Error(`Lettura appuntamenti Google incompleta (HTTP ${response.status})`);
    const data = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data) || data.error ||
      (data.items !== undefined && !Array.isArray(data.items))) throw new Error("Risposta appuntamenti Google non valida");
    for (const event of data.items ?? []) {
      if (!event || typeof event.id !== "string" || !event.id) throw new Error("Evento Google senza identificativo");
      events.set(event.id, event);
    }
    if (data.nextPageToken === undefined || data.nextPageToken === null) return [...events.values()];
    if (typeof data.nextPageToken !== "string" || !data.nextPageToken || tokens.has(data.nextPageToken)) {
      throw new Error("Paginazione Google non valida: storico conservato");
    }
    token = data.nextPageToken;
    tokens.add(data.nextPageToken);
  }
  throw new Error("Limite pagine Google raggiunto: storico conservato");
}

/** Keep history and commercial outcomes. Absence from a rolling window proves nothing. */
export function mayCancelMissingGoogleAppointment(apt: ReconciledAppointment, now: Date, timeMax: string): boolean {
  if (apt.status !== "confermato" || apt.is_completed || !apt.updated_at ||
    !apt.appointment_date || !/^\d{4}-\d{2}-\d{2}$/.test(apt.appointment_date) ||
    !apt.appointment_time || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(apt.appointment_time)) return false;
  const date = new Date(`${apt.appointment_date}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== apt.appointment_date) return false;
  const localNow = dataOraItaliana(now.toISOString()), localMax = dataOraItaliana(timeMax);
  if (!localNow || !localMax) return false;
  const start = `${apt.appointment_date}T${apt.appointment_time.slice(0, 5)}`;
  // Protect the whole current minute as well as past/in-progress appointments.
  return start > `${localNow.data}T${localNow.ora}` && start < `${localMax.data}T${localMax.ora}`;
}

/** 404 may mean revoked access or a moved event. Only an explicit tombstone is proof. */
export async function googleAppointmentDeletionConfirmed(
  calendarId: string, eventId: string, accessToken: string, fetcher: Fetcher = fetch,
): Promise<boolean> {
  try {
    const response = await fetcher(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) },
    );
    const data = await response.json();
    if (response.ok) return data?.id === eventId && data?.status === "cancelled";
    return response.status === 410 && Array.isArray(data?.error?.errors) &&
      data.error.errors.some((error: { reason?: string }) => error.reason === "deleted");
  } catch {
    // Network/auth/JSON failures preserve the appointment and the mapping for retry.
    return false;
  }
}

export async function reconcileMissingGoogleAppointments(
  db: any,
  scope: { companyId: string; userId: string; calendarId: string; accessToken: string; timeMax: string },
  mappings: MappedGoogleAppointment[], seen: Set<string>,
  options: { fetcher?: Fetcher; now?: () => Date } = {},
): Promise<number> {
  const clock = options.now ?? (() => new Date());
  let removed = 0;
  for (const mapping of mappings) {
    if (seen.has(mapping.google_event_id) || mapping.company_id !== scope.companyId ||
      mapping.user_id !== scope.userId || mapping.google_calendar_id !== scope.calendarId) continue;
    const { data: apt, error: readError } = await db.from("appointments")
      .select("id,appointment_date,appointment_time,status,is_completed,internal_notes,updated_at")
      .eq("id", mapping.appointment_id).eq("company_id", scope.companyId).maybeSingle();
    if (readError) throw new Error("Impossibile verificare lo stato dell'appuntamento");
    if (!apt || !mayCancelMissingGoogleAppointment(apt, clock(), scope.timeMax)) continue;
    if (!await googleAppointmentDeletionConfirmed(scope.calendarId, mapping.google_event_id, scope.accessToken, options.fetcher)) continue;
    const now = clock();
    if (!mayCancelMissingGoogleAppointment(apt, now, scope.timeMax)) continue;
    const note = `Annullato il ${now.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}: cancellazione verificata su Google Calendar.`;
    // Compare-and-swap: never overwrite a completion/reschedule made during the Google request.
    const { data: saved, error: writeError } = await db.from("appointments").update({
      status: "annullato", cancelled_at: now.toISOString(),
      internal_notes: apt.internal_notes ? `${apt.internal_notes}\n${note}` : note,
    }).eq("id", apt.id).eq("company_id", scope.companyId).eq("status", "confermato")
      .eq("is_completed", false).eq("updated_at", apt.updated_at).select("id").maybeSingle();
    if (writeError) throw new Error("Annullamento Google non salvato");
    if (!saved) continue;
    const { error: mapError } = await db.from("google_calendar_event_map").delete()
      .eq("id", mapping.id).eq("company_id", scope.companyId).eq("user_id", scope.userId)
      .eq("google_calendar_id", scope.calendarId).eq("appointment_id", apt.id).eq("google_event_id", mapping.google_event_id);
    if (mapError) throw new Error("Appuntamento aggiornato, collegamento Google non rimosso");
    removed++;
  }
  return removed;
}
