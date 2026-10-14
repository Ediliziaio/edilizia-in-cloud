import { googleAppointmentDeletionConfirmed } from "./googleAppointmentReconcile.ts";

type Scope = { companyId: string; userId: string; calendarId: string };
type Mapping = Record<string, any> & { id: string; appointment_id: string; google_event_id: string;
  company_id: string; user_id: string; google_calendar_id: string };

async function hash(parts: string[]): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(parts)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Stable across retries/accounts writing the same appointment on the same calendar. */
export async function googleAppointmentEventId(companyId: string, appointmentId: string): Promise<string> {
  return `eic${await hash(["appointment", companyId, appointmentId])}`;
}

/** A custom UUID (v8): retries of a Google import always address the same CRM row. */
export async function googleImportedAppointmentId(scope: Scope, eventId: string): Promise<string> {
  // Shared calendars may be read by multiple accounts: the event is still one appointment.
  const hex = await hash(["google-import", scope.companyId, scope.calendarId, eventId]);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function insertGoogleAppointmentEvent(
  url: string, accessToken: string, event: Record<string, any>,
  companyId: string, appointmentId: string, fetcher: typeof fetch = fetch,
): Promise<Response> {
  const id = await googleAppointmentEventId(companyId, appointmentId);
  const body = { ...event, id, extendedProperties: { ...event.extendedProperties,
    private: { ...event.extendedProperties?.private, crm_company_id: companyId, crm_appointment_id: appointmentId } } };
  const response = await fetcher(url, { method: "POST", headers: {
    Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json",
  }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  if (response.status !== 409) {
    if (response.ok) {
      const created = await response.clone().json();
      if (created?.id !== id || created.status === "cancelled") throw new Error("Evento Google creato non verificabile");
    }
    return response;
  }
  // A previous POST may have succeeded even if the caller lost its response/map.
  // Recover it, do not create another event or overwrite edits made on Google.
  const getUrl = new URL(url); getUrl.search = ""; getUrl.pathname += `/${id}`;
  const existing = await fetcher(getUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000),
  });
  if (!existing.ok) throw new Error("Evento Google esistente non verificabile: collegamento conservato");
  const data = await existing.clone().json();
  const owner = data?.extendedProperties?.private;
  if (data?.id !== id || data.status === "cancelled" || owner?.crm_company_id !== companyId || owner?.crm_appointment_id !== appointmentId) {
    throw new Error("Conflitto evento Google: nessuna sovrascrittura eseguita");
  }
  return Response.json(data, { headers: { "x-eic-recovered": "true" } });
}

/** Never purge local mappings/cache after a timeout, revoked access or ambiguous 404. */
export async function deleteGoogleAppointmentEvent(
  calendarId: string, eventId: string, accessToken: string, fetcher: typeof fetch = fetch,
): Promise<void> {
  const response = await fetcher(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) },
  );
  if (response.ok) return;
  if ((response.status === 404 || response.status === 410) &&
    await googleAppointmentDeletionConfirmed(calendarId, eventId, accessToken, fetcher)) return;
  throw new Error(`Cancellazione Google non confermata (HTTP ${response.status}): collegamento conservato`);
}

export async function loadGoogleAppointmentMappings(db: any, scope: Scope): Promise<Mapping[]> {
  const mappings: Mapping[] = [];
  for (let page = 0; page < 100; page++) {
    const { data, error } = await db.from("google_calendar_event_map").select("*")
      .eq("company_id", scope.companyId).eq("user_id", scope.userId).eq("google_calendar_id", scope.calendarId)
      .order("id").range(page * 500, page * 500 + 499);
    if (error || !Array.isArray(data)) throw new Error("Lettura collegamenti Google incompleta");
    mappings.push(...data);
    if (data.length < 500) return mappings;
  }
  throw new Error("Limite collegamenti Google raggiunto: nessuna riconciliazione parziale");
}

export async function saveGoogleAppointmentMapping(db: any, values: Record<string, any>): Promise<void> {
  const { error } = await db.from("google_calendar_event_map").insert(values);
  if (!error) return;
  if (error.code === "23505") {
    const { data, error: readError } = await db.from("google_calendar_event_map").select("id")
      .eq("company_id", values.company_id)
      .eq("appointment_id", values.appointment_id).eq("google_calendar_id", values.google_calendar_id)
      .eq("google_event_id", values.google_event_id).maybeSingle();
    if (!readError && data) return; // Same mapping saved by a concurrent webhook.
  }
  throw new Error("Collegamento Google non salvato: sincronizzazione da riprovare");
}

/** A failed/missing CRM write must not advance the Google etag and lose the change. */
export async function applyGoogleAppointmentChange(
  db: any, scope: Scope, mapping: Mapping, fields: Record<string, unknown>, etag: string | null,
): Promise<void> {
  const { data: apt, error: readError } = await db.from("appointments").select("id,updated_at")
    .eq("id", mapping.appointment_id).eq("company_id", scope.companyId).maybeSingle();
  if (readError || !apt?.updated_at) throw new Error("Appuntamento da aggiornare non verificabile");
  const { data: saved, error: writeError } = await db.from("appointments").update(fields)
    .eq("id", apt.id).eq("company_id", scope.companyId).eq("updated_at", apt.updated_at).select("id").maybeSingle();
  if (writeError || !saved) throw new Error("Modifica Google non salvata o appuntamento modificato nel frattempo");
  let query = db.from("google_calendar_event_map").update({ etag,
    last_synced_at: new Date().toISOString(), last_updated_by: "google" })
    .eq("id", mapping.id).eq("company_id", scope.companyId).eq("user_id", scope.userId)
    .eq("google_calendar_id", scope.calendarId).eq("google_event_id", mapping.google_event_id);
  query = mapping.etag == null ? query.is("etag", null) : query.eq("etag", mapping.etag);
  const { data: acknowledged, error: mapError } = await query.select("id").maybeSingle();
  if (mapError || !acknowledged) throw new Error("Modifica salvata, conferma Google da riprovare");
}

export async function importGoogleAppointment(
  db: any, scope: Scope, eventId: string, fields: Record<string, unknown>, mappingFields: Record<string, unknown>,
): Promise<{ id: string; created: boolean }> {
  const id = await googleImportedAppointmentId(scope, eventId);
  // Ignore the existing row on retry: never overwrite a user edit or completion.
  const { data: inserted, error } = await db.from("appointments").upsert({ ...fields, id, company_id: scope.companyId }, {
    onConflict: "id", ignoreDuplicates: true,
  }).select("id");
  if (error) throw new Error("Importazione appuntamento Google non salvata");
  await saveGoogleAppointmentMapping(db, { ...mappingFields, company_id: scope.companyId,
    user_id: scope.userId, google_calendar_id: scope.calendarId, google_event_id: eventId, appointment_id: id });
  return { id, created: Array.isArray(inserted) && inserted.length > 0 };
}
