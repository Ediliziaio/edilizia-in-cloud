import type { Database } from "@/integrations/supabase/types";
import { addMinutesToTimeStr } from "@/lib/marketingCalendarConstants";

type Fields = Database["public"]["Tables"]["appointments"]["Update"];

/** Una modifica parziale non deve riscrivere stato, commessa o assegnazioni
 * rimasti invariati, né annullare modifiche concorrenti su altri campi. */
export function appointmentEditPatch(original: Fields, values: Fields): Fields {
  const provider = original.meeting_provider === "manual" ? "manual"
    : original.meeting_provider === "google_meet" || original.appointment_type === "videocall" ? "google_meet" : "none";
  const baseline: Fields = {
    ...original,
    appointment_end_time: original.appointment_end_time || addMinutesToTimeStr(original.appointment_time?.slice(0, 5) || "09:00", 30),
    address_country: original.address_country || "IT",
    is_blocked_slot: original.is_blocked_slot ?? false,
    meeting_provider: provider,
  };
  const patch: Fields = {};
  const normalize = (key: string, value: unknown) => {
    if (key === "appointment_time" || key === "appointment_end_time") return String(value || "").slice(0, 5);
    return typeof value === "string" ? value.trim() || null : value ?? null;
  };
  const meetingChanged = normalize("", provider) !== normalize("", values.meeting_provider)
    || normalize("", original.meeting_url) !== normalize("", values.meeting_url);
  for (const key of Object.keys(values) as (keyof Fields)[]) {
    if (["company_id", "order_id", "created_by"].includes(key)) continue;
    if (!meetingChanged && ["meeting_status", "meeting_created_at"].includes(key)) continue;
    if (key === "appointment_type" && !meetingChanged && !!original.is_blocked_slot === !!values.is_blocked_slot) continue;
    if (normalize(key, baseline[key]) !== normalize(key, values[key])) {
      Object.assign(patch, { [key]: values[key] });
    }
  }
  return patch;
}

type Timing = { id: string; appointment_date: string; appointment_time?: string | null; appointment_end_time?: string | null };
type TimingPatch = Partial<Omit<Timing, "id">>;
/** Un rollback della data non deve ripristinare tutta la cache, né cancellare
 * note, altri appuntamenti o un secondo spostamento avvenuto nel frattempo. */
export function rollbackAppointmentTiming<T extends Timing>(rows: T[] | undefined, previous: T[] | undefined, id: string, optimistic: TimingPatch): T[] | undefined {
  const old = previous?.find(row => row.id === id);
  if (!old || !rows) return rows;
  const keys = Object.keys(optimistic) as (keyof TimingPatch)[];
  const normalize = (key: keyof TimingPatch, value: unknown) => key === "appointment_date" ? value : value == null ? null : String(value).slice(0, 5);
  return rows.map(row => {
    if (row.id !== id || keys.some(key => normalize(key, row[key]) !== normalize(key, optimistic[key]))) return row;
    const restored = { ...row };
    for (const key of keys) Object.assign(restored, { [key]: old[key] });
    return restored;
  });
}
