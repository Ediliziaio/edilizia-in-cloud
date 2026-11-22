import type { FishLeadBooking } from "./fishSalesTools.ts";
import type { sincronizzaCalendariEsterni } from "./appuntamentiPubblici.ts";
import { italianVoiceDate,italianVoiceTime } from "./fishItalianSpeech.ts";
import { slotLiberiCalendario, prenotaSuCalendario } from "./calendarioPrenotazione.ts";
import { normalizzaData, normalizzaOra, suffissoTelefono, trovaContattoPerTelefono } from "./ediliziaCustomerTools.ts";
/** Uses the existing calendar rules, owner, external busy slots and atomic booking RPC. */
export async function fishCalendarTool(db:any,companyId:string,calendarId:string,phone:string,name:string,params:Record<string,unknown>,assistance?:{caseId:string;phone:string},effects?:{syncCalendar?:typeof sincronizzaCalendariEsterni;leadBooking?:FishLeadBooking}) {
  const date=normalizzaData(String(params.data || ""));
  if(!date) return {creato:false,risposta:"Per quale giorno vuole controllare il calendario? Mi indichi la data."};
  if(name==="disponibilita") {
    const result=await slotLiberiCalendario(db,calendarId,date,{companyId});
    if(!result.calendario) return {creato:false,risposta:"Il calendario dell’azienda non è disponibile. Posso raccogliere una richiesta di richiamo."};
    return {trovato:result.slot.length > 0,slot:result.slot,giorno_pronuncia:italianVoiceDate(date),orari_pronuncia:result.slot.slice(0,6).map(italianVoiceTime),risposta:result.slot.length?`Per ${date} sono disponibili questi orari: ${result.slot.slice(0,6).join(", ")}. Quale preferisce?`:`Per ${date} non ci sono orari disponibili. Vuole provare un altro giorno?`};
  }
  const time=normalizzaOra(String(params.ora || ""));
  if(!time)return {creato:false,risposta:"Mi conferma l’orario scelto, oltre al giorno?"};
  const linked = effects?.leadBooking;
  const contactId = linked?.contactId ?? (await trovaContattoPerTelefono(db,companyId,suffissoTelefono(phone),phone))?.id ?? null;
  const booked=await prenotaSuCalendario(db,{calendarId,companyId,dataIso:date,ora:time,contactId,opportunityId:linked?.opportunityId ?? null,requestKey:linked?.requestKey,titolo:`${String(params.motivo || "Sopralluogo").slice(0,200)}${params.nome?` — ${String(params.nome).slice(0,120)}`:""}`,descrizione:`Richiesta confermata durante la chiamata Fish. Recapito: ${phone}${params.indirizzo?`\nIndirizzo dichiarato e confermato: ${String(params.indirizzo).slice(0,400)}`:""}`,tipo:"agente_ai",assistance,syncCalendar:effects?.syncCalendar});
  return booked.ok === true?{giorno_pronuncia:italianVoiceDate(booked.dataIso),ora_pronuncia:italianVoiceTime(booked.ora),creato:true,appointment_id:booked.appointmentId,risposta:`Appuntamento confermato per ${booked.quando}.`}:{creato:false,risposta:`L’appuntamento non è confermato. ${booked.messaggio} Possiamo controllare un altro orario.`};
}
