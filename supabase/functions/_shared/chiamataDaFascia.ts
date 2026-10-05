/**
 * La chiamata fissata dal pulsante «15-16» del primo WhatsApp (06/10/2026,
 * Green Energy Group): il cliente tocca una fascia, l'appuntamento nasce
 * subito nel calendario Call Center.
 *
 * Il giorno non lo sceglie il cliente: è oggi se la fascia ha ancora almeno
 * una chiamata davanti (da mezz'ora dopo il tocco), altrimenti il primo giorno
 * utile. La domenica non si chiama. Dentro la fascia si prende il primo inizio
 * libero a passi di 15 minuti; se la fascia è piena si fissa comunque
 * all'inizio (come per le risposte all'outreach: meglio due chiamate vicine
 * che un cliente senza appuntamento).
 *
 * Tutto in ora italiana. La parte pura è testata da vitest; la scrittura sul
 * database sta in `fissaChiamataDaFascia`.
 */
// deno-lint-ignore-file no-explicit-any
import { dataEstesa, nuovoToken, romaVersoUtc, sincronizzaCalendariEsterni } from "./appuntamentiPubblici.ts";
import { hhmm, primoSlotLibero } from "./outreach-richiesta-chiamata.ts";

/** Si chiama fino alle 18: nessuna fascia oltre. */
export const FINE_CHIAMATE = 18 * 60;

/** «15-16», «Mattina (9-11)», «16 - 18» → 15:00-16:00. null se non è una fascia sensata. */
export function fasciaDalMessaggio(testo: string | null | undefined): { da: number; a: number } | null {
  const m = /(\d{1,2})\s*[-–]\s*(\d{1,2})(?!\d)/.exec(String(testo ?? ""));
  if (!m) return null;
  const da = +m[1] * 60, a = +m[2] * 60;
  if (!(da >= 6 * 60 && a > da && a <= FINE_CHIAMATE)) return null;
  return { da, a };
}

function romaOra(adesso: Date): { giorno: string; min: number; dow: number } {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(adesso);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return {
    giorno: `${v("year")}-${v("month")}-${v("day")}`,
    min: +v("hour") * 60 + +v("minute"),
    dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(v("weekday")),
  };
}

function piuUnGiorno(giorno: string): { giorno: string; dow: number } {
  const [y, m, d] = giorno.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return { giorno: dt.toISOString().slice(0, 10), dow: dt.getUTCDay() };
}

/** Il giorno della chiamata e la fascia in cui cercare lo slot (oggi, o il primo giorno utile). */
export function giornoDellaChiamata(fascia: { da: number; a: number }, adesso: Date, durata = 15):
  { giorno: string; fascia: { da: number; a: number } } {
  const ora = romaOra(adesso);
  const primoUtile = Math.ceil((ora.min + 30) / 15) * 15;
  if (ora.dow !== 0 && fascia.a - Math.max(fascia.da, primoUtile) >= durata) {
    return { giorno: ora.giorno, fascia: { da: Math.max(fascia.da, primoUtile), a: fascia.a } };
  }
  let g = piuUnGiorno(ora.giorno);
  if (g.dow === 0) g = piuUnGiorno(g.giorno);
  return { giorno: g.giorno, fascia };
}

/** L'inizio della chiamata (minuti) dentro la fascia, lontano dagli `occupati`. */
export function inizioChiamata(fascia: { da: number; a: number }, occupati: Array<{ da: number; a: number }>, durata = 15): number {
  return primoSlotLibero(fascia, occupati, durata) ?? fascia.da;
}

const minuti = (t: string | null | undefined) => {
  const [h, m] = String(t ?? "00:00").slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export interface ChiamataDaFascia {
  appointmentId: string;
  giorno: string;
  ora: string;
  /** «lunedì 12 ottobre 2026». */
  giornoEsteso: string;
  /** C'era già una chiamata futura per questo contatto: non se ne crea un'altra. */
  esistente: boolean;
}

export async function fissaChiamataDaFascia(admin: any, opz: {
  companyId: string;
  calendarId: string;
  contactId: string;
  messaggio: string;
  titolo?: string;
  adesso?: Date;
}): Promise<ChiamataDaFascia> {
  const fascia = fasciaDalMessaggio(opz.messaggio);
  if (!fascia) throw new Error(`«${opz.messaggio}» non è una fascia oraria (es. 15-16), massimo fino alle 18`);

  const { data: cal } = await admin.from("marketing_calendars")
    .select("id, name, duration_minutes, owner_id").eq("id", opz.calendarId).eq("company_id", opz.companyId)
    .eq("is_active", true).maybeSingle();
  if (!cal?.id) throw new Error("Il calendario scelto non esiste o non è attivo");
  const durata = Math.max(5, Number(cal.duration_minutes ?? 15));

  // Un cliente che tocca due pulsanti non ha due chiamate: vale la prima ancora davanti.
  const adesso = opz.adesso ?? new Date();
  const oggi = romaOra(adesso).giorno;
  const { data: gia } = await admin.from("appointments")
    .select("id, appointment_date, appointment_time")
    .eq("contact_id", opz.contactId).eq("company_id", opz.companyId).eq("calendar_id", cal.id)
    .gte("appointment_date", oggi).not("status", "in", '("annullato","cancelled","canceled")')
    .order("appointment_date").order("appointment_time").limit(1).maybeSingle();
  if (gia?.id) {
    return {
      appointmentId: gia.id, giorno: gia.appointment_date, ora: String(gia.appointment_time).slice(0, 5),
      giornoEsteso: dataEstesa(gia.appointment_date), esistente: true,
    };
  }

  const { giorno, fascia: cerca } = giornoDellaChiamata(fascia, adesso, durata);
  const { data: app } = await admin.from("appointments")
    .select("appointment_time, appointment_end_time")
    .eq("calendar_id", cal.id).eq("appointment_date", giorno)
    .not("status", "in", '("annullato","cancelled","canceled")');
  const occupati = (app ?? []).map((a: any) => {
    const da = minuti(a.appointment_time);
    return { da, a: a.appointment_end_time ? minuti(a.appointment_end_time) : da + durata };
  });
  const inizio = inizioChiamata(cerca, occupati, durata);

  const { data: contatto } = await admin.from("marketing_contacts")
    .select("first_name, last_name, company_name, phone, email").eq("id", opz.contactId).eq("company_id", opz.companyId).maybeSingle();
  const chi = [contatto?.first_name, contatto?.last_name].filter(Boolean).join(" ").trim() || contatto?.company_name || "contatto";
  const adessoIso = adesso.toISOString();

  const { data: creato, error } = await admin.from("appointments").insert({
    calendar_id: cal.id,
    company_id: opz.companyId,
    contact_id: opz.contactId,
    appointment_date: giorno,
    appointment_time: `${hhmm(inizio)}:00`,
    appointment_end_time: `${hhmm(inizio + durata)}:00`,
    title: opz.titolo?.trim() || `Richiamo — ${chi}`,
    description: [
      `Fascia scelta dal cliente nel primo WhatsApp: ${hhmm(fascia.da)}-${hhmm(fascia.a)}.`,
      contatto?.phone && `Tel: ${contatto.phone}`,
      contatto?.email && `Email: ${contatto.email}`,
    ].filter(Boolean).join("\n"),
    appointment_type: "chiamata",
    status: "confermato",
    assigned_to: cal.owner_id || null,
    created_by: "00000000-0000-0000-0000-000000000000",
    meeting_provider: "none",
    meeting_status: "none",
    manage_token: nuovoToken(),
    booking_email: contatto?.email || null,
    // La conferma al cliente la manda il flusso, con la fascia scelta: niente promemoria doppi.
    conferma_inviata_at: adessoIso,
    reminder_24h_at: adessoIso,
    reminder_1h_at: adessoIso,
    reminder_5m_at: adessoIso,
  }).select("id").single();
  if (error) throw error;

  await sincronizzaCalendariEsterni({ azione: "push-event", appointmentId: creato.id, companyId: opz.companyId, userId: cal.owner_id ?? null });
  await admin.from("marketing_contact_activities").insert({
    company_id: opz.companyId,
    contact_id: opz.contactId,
    activity_type: "appuntamento_prenotato",
    description: `Richiamo fissato per ${dataEstesa(giorno)} alle ${hhmm(inizio)}: ha scelto la fascia ${hhmm(fascia.da)}-${hhmm(fascia.a)} sul WhatsApp`,
    metadata: { appointment_id: creato.id, calendar_id: cal.id, origine: "whatsapp_fascia" },
  }).then(({ error: e }: any) => e && console.warn("[chiamataDaFascia] attività non registrata:", e.message));

  return { appointmentId: creato.id, giorno, ora: hhmm(inizio), giornoEsteso: dataEstesa(giorno), esistente: false };
}
