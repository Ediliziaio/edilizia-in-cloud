import { bookingCalendarDestination } from "./bookingCalendarDestination.ts";

type Provider = "google" | "apple" | "outlook";
// deno-lint-ignore no-explicit-any
export async function providersAppuntamento(db: any, a: {
  appointmentId: string; companyId: string; userId: string | null;
  azione: "push-event" | "update-event" | "delete-event";
}): Promise<Provider[]> {
  const providers = new Set<Provider>();
  if (a.azione !== "push-event") {
    for (const [provider, table] of [["google","google_calendar_event_map"],["apple","apple_calendar_event_map"],["outlook","appointment_outlook_links"]] as const) {
      const {data,error} = await db.from(table).select("id").eq("company_id",a.companyId).eq("appointment_id",a.appointmentId).limit(1).maybeSingle();
      if (error) throw error;
      if (data) providers.add(provider);
    }
    // Per cancellare conta la mappa dell'evento esistente, anche se il
    // calendario di destinazione è stato cambiato o l'appuntamento rimosso.
    if (a.azione === "delete-event") return [...providers];
  }
  const {data:appointment,error} = await db.from("appointments").select("id,calendar_id,assigned_to").eq("id",a.appointmentId).eq("company_id",a.companyId).maybeSingle();
  if (error) throw error;
  if (!appointment) return [...providers];
  const dest = await bookingCalendarDestination(db,appointment,a.companyId);
  let owner = dest.assigned_to ?? a.userId;
  if (dest.calendar_id) {
    const {data:calendar,error:calendarError} = await db.from("marketing_calendars").select("owner_id,external_provider,external_connection_id,external_calendar_id").eq("id",dest.calendar_id).eq("company_id",a.companyId).maybeSingle();
    if (calendarError) throw calendarError;
    if (calendar?.external_connection_id && calendar?.external_calendar_id && ["google","apple","outlook"].includes(calendar.external_provider)) {
      providers.add(calendar.external_provider);
      return [...providers];
    }
    owner = calendar?.owner_id ?? owner;
  }
  if (!owner) return [...providers];
  for (const provider of ["google","apple","outlook"] as const) {
    const {data:connection,error:connectionError} = await db.from(`${provider}_calendar_connections`).select("id").eq("company_id",a.companyId).eq("user_id",owner).eq("status","connected").limit(1).maybeSingle();
    if (connectionError) throw connectionError;
    if (connection) providers.add(provider);
  }
  return [...providers];
}
