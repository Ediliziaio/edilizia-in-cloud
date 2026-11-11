/**
 * Orari liberi e prenotazione su un calendario, lato server (25/09/2026).
 *
 * Le regole autorevoli stanno nelle RPC SQL calendar_booking_slots e reserve_calendar_booking; qui si leggono i
 * dati e si scrive l'appuntamento. Serve agli agenti AI (WhatsApp, voce) e a
 * tutto ciò che prenota senza passare dalla pagina /prenota: prima gli agenti
 * inserivano appuntamenti senza calendario, senza titolare e senza token,
 * quindi niente promemoria, niente Google Calendar e niente link «sposta».
 *
 * Doppie prenotazioni: l'insert passa dalla RPC prenota_su_calendario_con_blocco
 * (migrazione 20280925235600), che controlla e inserisce nella stessa
 * transazione sotto un advisory lock per calendario e giorno. Un orario preso
 * da un altro nel frattempo non viene inserito affatto: niente conferme, eventi
 * Google o CAPI partiti per un appuntamento che poi sparisce.
 *
 * Una lettura che fallisce ferma tutto: con zero appuntamenti letti per un
 * errore, ogni orario sembrerebbe libero.
 */

// deno-lint-ignore-file no-explicit-any

import { dataEstesa, minutiDa, nuovoToken, orarioDa, sincronizzaCalendariEsterni } from "./appuntamentiPubblici.ts";

/** Gli stati di un appuntamento che non occupa più l'orario (come notificheAppuntamento.ts). */
export const STATI_CHE_LIBERANO = ["annullato", "cancellato", "cancelled", "disdetto"];

export interface CalendarioBase {
  id: string;
  company_id: string;
  name: string;
  owner_id: string | null;
  duration_minutes: number;
  default_meeting_provider?: string | null;
  link_videochiamata?: string | null;
  calendar_type?: string;
  team_calendar_ids?: string[];
  buffer_before_min: number | null;
  buffer_after_min: number | null;
  min_notice_minutes: number | null;
  max_per_day: number | null;
  /** Ogni quanti minuti si offre un orario. NULL = usa duration_minutes. */
  slot_interval_min: number | null;
}

const COLONNE_CALENDARIO =
  "id, company_id, name, owner_id, duration_minutes, buffer_before_min, buffer_after_min, min_notice_minutes, max_per_day, slot_interval_min, is_active, calendar_type, team_calendar_ids, default_meeting_provider, link_videochiamata";

async function leggiCalendario(admin: any, calendarId: string, companyId?: string): Promise<CalendarioBase | null> {
  let q = admin.from("marketing_calendars").select(COLONNE_CALENDARIO).eq("id", calendarId).eq("is_active", true);
  if (companyId) q = q.eq("company_id", companyId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(`calendario: ${error.message}`);
  return (data as CalendarioBase | null) ?? null;
}

/** "yyyy-MM-dd" di oggi a Roma, più `giorni`. */
export function dataRoma(adesso: Date, giorni = 0): string {
  const oggi = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(adesso);
  const [y, m, d] = oggi.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + giorni, 12)).toISOString().slice(0, 10);
}

async function slotDelGiorno(admin:any,cal:CalendarioBase,dataIso:string,_adesso:Date,escludiAppuntamentoId?:string):Promise<string[]>{
  const {data,error}=await admin.rpc("calendar_booking_slots",{p_calendar:cal.id,p_date:dataIso,p_exclude:escludiAppuntamentoId??null});
  if(error)throw new Error(`disponibilità calendario: ${error.message}`);
  if(!Array.isArray(data))throw new Error("Risposta disponibilità non valida");
  return data;
}

export async function slotLiberiCalendario(
  admin: any,
  calendarId: string,
  dataIso: string,
  opzioni: { companyId?: string; adesso?: Date; escludiAppuntamentoId?: string } = {},
): Promise<{ calendario: CalendarioBase | null; slot: string[] }> {
  const cal = await leggiCalendario(admin, calendarId, opzioni.companyId);
  if (!cal) return { calendario: null, slot: [] };
  return {
    calendario: cal,
    slot: await slotDelGiorno(admin, cal, dataIso, opzioni.adesso ?? new Date(), opzioni.escludiAppuntamentoId),
  };
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
  | { ok: true; appointmentId: string; duplicate?: boolean; dataIso: string; ora: string; fine: string; quando: string }
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
  requestKey?: string;
  remindersHandled?: boolean;
}): Promise<EsitoPrenotazione> {
  const cal = await leggiCalendario(admin, a.calendarId, a.companyId);
  if (!cal) return { ok: false, motivo: "calendario_non_valido", messaggio: "Il calendario non è attivo o non è di questa azienda." };

  const ora = String(a.ora).slice(0, 5);
  // The atomic reservation checks availability; a retry must reach its stored request key.
  const durata = cal.duration_minutes || 30;
  const fineMin = minutiDa(ora) + durata;
  const fine = fineMin === 1440 ? "24:00" : orarioDa(fineMin);
  const fixedLink=cal.link_videochiamata?.trim()||null;
  const useMeet=!fixedLink&&cal.default_meeting_provider==="google_meet";
  const { data: idCreato, error } = await admin.rpc("reserve_calendar_booking", {
    p_calendar_id: cal.id,
    p_company_id: cal.company_id,
    p_data: a.dataIso,
    p_inizio: `${ora}:00`,
    p_fine: `${fine}:00`,
    p_buffer_prima: Number(cal.buffer_before_min ?? 0),
    p_buffer_dopo: Number(cal.buffer_after_min ?? 0),
    p_durata_min: durata,
    p_riga: {
      contact_id: a.contactId,
      opportunity_id: a.opportunityId,
      title: a.titolo,
      description: a.descrizione,
      appointment_type: a.tipo ?? ((fixedLink||useMeet)?"videocall":"agente_ai"),
      meeting_provider: fixedLink?"manual":useMeet?"google_meet":"none",
      meeting_status: fixedLink?"ready":useMeet?"pending":"none",
      meeting_url: fixedLink,
      assigned_to: cal.owner_id,
      manage_token: nuovoToken(),
      request_key: a.requestKey??null,
      reminders_handled: a.remindersHandled??false,
    },
  });
  if (error) {
    console.error("[calendarioPrenotazione] prenotazione:", error.message);
    return { ok: false, motivo: "errore", messaggio: "Non sono riuscito a salvare l'appuntamento." };
  }
  if (!idCreato) return { ok: false, motivo: "non_libero", messaggio: "Questo orario è stato appena preso da un altro cliente." };
  const confirmedId=typeof idCreato==="string"?idCreato:idCreato?.id;
  if(typeof confirmedId!=="string"||!confirmedId)return {ok:false,motivo:"errore",messaggio:"Il server non ha confermato l’appuntamento"};
  const creato={id:confirmedId};
  if(idCreato.duplicate)return {ok:true,appointmentId:creato.id,duplicate:true,dataIso:a.dataIso,ora,fine,quando:`${dataEstesa(a.dataIso)} alle ${ora}`};

  const {data:assegnato,error:assegnazioneError}=await admin.from("appointments").select("assigned_to").eq("id",creato.id).eq("company_id",cal.company_id).maybeSingle();
  if(assegnazioneError)console.warn("[calendarioPrenotazione] responsabile non letto",assegnazioneError.message);
  await sincronizzaCalendariEsterni({ azione: "push-event", appointmentId: creato.id, companyId: cal.company_id, userId: assegnato?.assigned_to??cal.owner_id });
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
