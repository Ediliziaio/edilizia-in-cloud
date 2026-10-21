import { supabase } from "@/integrations/supabase/client";
import type { CalendarAppointment } from "@/types/calendar";

/**
 * Nel calendario dei lavori un appuntamento commerciale (senza commessa) di un
 * collega è un impegno, non un'informazione da leggere: chi non ha il permesso
 * di vedere gli appuntamenti del CRM sa che quella persona è occupata, non con
 * chi né dove. Restano visibili i propri appuntamenti e quelli di una commessa.
 */
export function appuntamentoRiservato(
  apt: CalendarAppointment,
  userId: string | null | undefined,
): boolean {
  if (apt.order_id) return false;
  if (userId && (apt.assigned_to === userId || apt.created_by === userId)) return false;
  return true;
}

export function mascheraAppuntamentoRiservato(apt: CalendarAppointment): CalendarAppointment {
  return {
    id: apt.id,
    title: "Occupato",
    description: null,
    appointment_date: apt.appointment_date,
    appointment_time: apt.appointment_time,
    appointment_end_time: apt.appointment_end_time ?? null,
    appointment_type: apt.appointment_type,
    assigned_to: apt.assigned_to,
    order_id: null,
    calendar_id: apt.calendar_id ?? null,
    is_completed: apt.is_completed,
    company_id: apt.company_id,
    created_by: apt.created_by,
    status: apt.status,
    contact: null,
    order: null,
    riservato: true,
  };
}

export function appuntamentiPerCalendarioLavori(
  rows: CalendarAppointment[],
  opts: { userId: string | null | undefined; vedeCrm: boolean },
): CalendarAppointment[] {
  if (opts.vedeCrm) return rows;
  return rows.map((a) => (appuntamentoRiservato(a, opts.userId) ? mascheraAppuntamentoRiservato(a) : a));
}

/** Riga di calendario_impegni_riservati(): solo quando e chi. */
export type ImpegnoRiservato = Pick<
  CalendarAppointment,
  "id" | "appointment_date" | "appointment_time" | "appointment_type" | "assigned_to" | "created_by" | "company_id" | "is_completed"
> & { appointment_end_time: string | null; calendar_id: string | null; status: string | null };

export async function caricaImpegniRiservati(
  dal: string,
  al: string,
  signal?: AbortSignal,
): Promise<ImpegnoRiservato[]> {
  // La funzione non è nei tipi generati: la si chiama come le altre RPC nuove.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any).rpc("calendario_impegni_riservati", { p_dal: dal, p_al: al });
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error) throw new Error(`Impegni dei colleghi: ${error.message}`);
  return (data ?? []) as ImpegnoRiservato[];
}

export function unisciImpegniRiservati(
  rows: CalendarAppointment[],
  impegni: ImpegnoRiservato[],
): CalendarAppointment[] {
  if (impegni.length === 0) return rows;
  const presenti = new Set(rows.map((r) => r.id));
  const extra = impegni
    .filter((i) => !presenti.has(i.id))
    .map((i) =>
      mascheraAppuntamentoRiservato({
        ...i,
        title: "",
        description: null,
        order_id: null,
        status: i.status ?? undefined,
      }),
    );
  return [...rows, ...extra].sort((a, b) =>
    `${a.appointment_date} ${a.appointment_time ?? ""} ${a.id}`.localeCompare(`${b.appointment_date} ${b.appointment_time ?? ""} ${b.id}`),
  );
}
