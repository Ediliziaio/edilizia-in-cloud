/**
 * Orari liberi e prenotazione su un calendario, lato server (25/09/2026).
 *
 * Le regole stanno in calendarioSlot.ts (puro, testato); qui si leggono i
 * dati e si scrive l'appuntamento. Serve agli agenti AI (WhatsApp, voce) e a
 * tutto ciò che prenota senza passare dalla pagina /prenota: prima gli agenti
 * inserivano appuntamenti senza calendario, senza titolare e senza token,
 * quindi niente promemoria, niente Google Calendar e niente link «sposta».
 *
 * Doppie prenotazioni: il controllo prima dell'insert non basta se due lead
 * scelgono lo stesso orario nello stesso secondo. Dopo l'insert si ricontrolla:
 * se c'è un appuntamento sovrapposto creato prima, il proprio si cancella e si
 * risponde «non più libero».
 */

// deno-lint-ignore-file no-explicit-any

import { dataEstesa, minutiDa, nuovoToken, orarioDa, sincronizzaCalendariEsterni } from "./appuntamentiPubblici.ts";
import { slotLiberi } from "./calendarioSlot.ts";

export interface CalendarioBase {
  id: string;
  company_id: string;
  name: string;
  owner_id: string | null;
  duration_minutes: number;
  buffer_before_min: number | null;
  buffer_after_min: number | null;
  min_notice_minutes: number | null;
  max_per_day: number | null;
}

const COLONNE_CALENDARIO =
  "id, company_id, name, owner_id, duration_minutes, buffer_before_min, buffer_after_min, min_notice_minutes, max_per_day, is_active";

async function leggiCalendario(admin: any, calendarId: string, companyId?: string): Promise<CalendarioBase | null> {
  let q = admin.from("marketing_calendars").select(COLONNE_CALENDARIO).eq("id", calendarId).eq("is_active", true);
  if (companyId) q = q.eq("company_id", companyId);
  const { data } = await q.maybeSingle();
  return (data as CalendarioBase | null) ?? null;
}

/** "yyyy-MM-dd" di oggi a Roma, più `giorni`. */
export function dataRoma(adesso: Date, giorni = 0): string {
  const oggi = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(adesso);
  const [y, m, d] = oggi.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + giorni, 12)).toISOString().slice(0, 10);
}

async function slotDelGiorno(admin: any, cal: CalendarioBase, dataIso: string, adesso: Date): Promise<string[]> {
  const [{ data: regole }, { data: presi }] = await Promise.all([
    admin.from("marketing_calendar_availability")
      .select("day_of_week, start_time, end_time, specific_date")
      .eq("calendar_id", cal.id).eq("is_enabled", true),
    admin.from("appointments")
      .select("appointment_time, appointment_end_time")
      .eq("calendar_id", cal.id).eq("appointment_date", dataIso)
      .not("status", "in", '("annullato","cancelled","disdetto")')
      .or("is_blocked_slot.is.null,is_blocked_slot.eq.false"),
  ]);

  let impegni: Array<{ start_at: string; end_at: string }> = [];
  if (cal.owner_id) {
    const { data: pref } = await admin
      .from("user_calendar_preferences").select("block_busy_slots").eq("user_id", cal.owner_id).maybeSingle();
    if (pref?.block_busy_slots !== false) {
      // Un giorno di margine ai lati: gli impegni sono in UTC.
      const { data: busy } = await admin
        .from("unified_calendar_busy_slots")
        .select("start_at, end_at")
        .eq("user_id", cal.owner_id)
        .lt("start_at", `${dataIso}T23:59:59.999Z`)
        .gt("end_at", `${dataIso}T00:00:00.000Z`);
      impegni = (busy ?? []) as typeof impegni;
    }
  }

  return slotLiberi({
    dataIso,
    regole: (regole ?? []) as any[],
    durataMin: cal.duration_minutes || 30,
    bufferPrimaMin: Number(cal.buffer_before_min ?? 0),
    bufferDopoMin: Number(cal.buffer_after_min ?? 0),
    preavvisoMin: Number(cal.min_notice_minutes ?? 0),
    maxAlGiorno: cal.max_per_day ? Number(cal.max_per_day) : null,
    appuntamenti: (presi ?? []).map((a: any) => ({
      inizio: String(a.appointment_time ?? "00:00").slice(0, 5),
      fine: a.appointment_end_time ? String(a.appointment_end_time).slice(0, 5) : null,
    })),
    impegni,
    adesso,
  });
}

export async function slotLiberiCalendario(
  admin: any,
  calendarId: string,
  dataIso: string,
  opzioni: { companyId?: string; adesso?: Date } = {},
): Promise<{ calendario: CalendarioBase | null; slot: string[] }> {
  const cal = await leggiCalendario(admin, calendarId, opzioni.companyId);
  if (!cal) return { calendario: null, slot: [] };
  return { calendario: cal, slot: await slotDelGiorno(admin, cal, dataIso, opzioni.adesso ?? new Date()) };
}

/** I prossimi giorni (da `daIso` compreso) che hanno almeno un orario libero. */
export async function prossimiGiorniLiberi(
  admin: any,
  calendarId: string,
  daIso: string,
  giorni: number,
  opzioni: { companyId?: string; adesso?: Date; bastano?: number } = {},
): Promise<{ calendario: CalendarioBase | null; giorni: Array<{ dataIso: string; slot: string[] }> }> {
  const cal = await leggiCalendario(admin, calendarId, opzioni.companyId);
  if (!cal) return { calendario: null, giorni: [] };
  const adesso = opzioni.adesso ?? new Date();
  const bastano = opzioni.bastano ?? 3;
  const trovati: Array<{ dataIso: string; slot: string[] }> = [];
  const [y, m, d] = daIso.split("-").map(Number);
  for (let i = 0; i < Math.max(1, giorni) && trovati.length < bastano; i++) {
    const dataIso = new Date(Date.UTC(y, m - 1, d + i, 12)).toISOString().slice(0, 10);
    const slot = await slotDelGiorno(admin, cal, dataIso, adesso);
    if (slot.length) trovati.push({ dataIso, slot });
  }
  return { calendario: cal, giorni: trovati };
}

export type EsitoPrenotazione =
  | { ok: true; appointmentId: string; dataIso: string; ora: string; fine: string; quando: string }
  | { ok: false; motivo: "non_libero" | "calendario_non_valido" | "errore"; messaggio: string };

export async function prenotaSuCalendario(admin: any, a: {
  calendarId: string;
  companyId: string;
  dataIso: string;
  ora: string;
  contactId: string | null;
  opportunityId: string | null;
  titolo: string;
  descrizione: string;
  tipo?: string;
  adesso?: Date;
}): Promise<EsitoPrenotazione> {
  const cal = await leggiCalendario(admin, a.calendarId, a.companyId);
  if (!cal) return { ok: false, motivo: "calendario_non_valido", messaggio: "Il calendario non è attivo o non è di questa azienda." };

  const ora = String(a.ora).slice(0, 5);
  const liberi = await slotDelGiorno(admin, cal, a.dataIso, a.adesso ?? new Date());
  if (!liberi.includes(ora)) return { ok: false, motivo: "non_libero", messaggio: "Questo orario non è più libero." };

  const durata = cal.duration_minutes || 30;
  const fine = orarioDa(minutiDa(ora) + durata);
  const { data: creato, error } = await admin.from("appointments").insert({
    calendar_id: cal.id,
    company_id: cal.company_id,
    contact_id: a.contactId,
    opportunity_id: a.opportunityId,
    appointment_date: a.dataIso,
    appointment_time: `${ora}:00`,
    appointment_end_time: `${fine}:00`,
    title: a.titolo,
    description: a.descrizione,
    appointment_type: a.tipo ?? "agente_ai",
    status: "confermato",
    assigned_to: cal.owner_id,
    created_by: "00000000-0000-0000-0000-000000000000",
    manage_token: nuovoToken(),
    // Conferma e promemoria li manda l'automazione dell'azienda sul trigger
    // «Appuntamento prenotato»: il giro dei promemoria non la ripete.
    conferma_inviata_at: new Date().toISOString(),
  }).select("id, created_at").single();
  if (error || !creato) {
    console.error("[calendarioPrenotazione] insert:", error?.message);
    return { ok: false, motivo: "errore", messaggio: "Non sono riuscito a salvare l'appuntamento." };
  }

  // Ricontrollo: un altro appuntamento sovrapposto creato prima vince.
  const { data: stessoGiorno } = await admin
    .from("appointments")
    .select("id, appointment_time, appointment_end_time, created_at")
    .eq("calendar_id", cal.id).eq("appointment_date", a.dataIso)
    .not("status", "in", '("annullato","cancelled","disdetto")')
    .neq("id", creato.id);
  const s = minutiDa(ora), e = s + durata;
  const conflitto = (stessoGiorno ?? []).some((x: any) => {
    const xs = minutiDa(String(x.appointment_time ?? "00:00").slice(0, 5));
    const xe = x.appointment_end_time ? minutiDa(String(x.appointment_end_time).slice(0, 5)) : xs + durata;
    return s < xe && e > xs && String(x.created_at) <= String(creato.created_at);
  });
  if (conflitto) {
    await admin.from("appointments").delete().eq("id", creato.id);
    return { ok: false, motivo: "non_libero", messaggio: "Questo orario è stato appena preso da un altro cliente." };
  }

  await sincronizzaCalendariEsterni({ azione: "push-event", appointmentId: creato.id, companyId: cal.company_id, userId: cal.owner_id });
  if (a.contactId) {
    const { error: attErr } = await admin.from("marketing_contact_activities").insert({
      company_id: cal.company_id,
      contact_id: a.contactId,
      activity_type: "appuntamento_prenotato",
      description: `Appuntamento «${cal.name}» per ${dataEstesa(a.dataIso)} alle ${ora}`,
      metadata: { appointment_id: creato.id, calendar_id: cal.id, origine: a.tipo ?? "agente_ai" },
    });
    if (attErr) console.warn("[calendarioPrenotazione] attività non registrata:", attErr.message);
  }

  return { ok: true, appointmentId: creato.id, dataIso: a.dataIso, ora, fine, quando: `${dataEstesa(a.dataIso)} alle ${ora}` };
}
