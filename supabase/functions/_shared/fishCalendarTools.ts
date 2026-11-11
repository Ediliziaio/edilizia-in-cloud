import { italianVoiceDate,italianVoiceTime } from "./fishItalianSpeech.ts";
import { slotLiberiCalendario, prenotaSuCalendario } from "./calendarioPrenotazione.ts";
import { normalizzaData, normalizzaOra, suffissoTelefono, trovaContattoPerTelefono } from "./ediliziaCustomerTools.ts";
/** Uses the existing calendar rules, owner, external busy slots and atomic booking RPC. */
export async function fishCalendarTool(db:any,companyId:string,calendarId:string,phone:string,name:string,params:Record<string,unknown>) {
  const date=normalizzaData(String(params.data || ""));
  if(!date) return {creato:false,risposta:"Per quale giorno vuole controllare il calendario? Mi indichi la data."};
  if(name==="disponibilita") {
    const result=await slotLiberiCalendario(db,calendarId,date,{companyId});
    if(!result.calendario) return {creato:false,risposta:"Il calendario dell’azienda non è disponibile. Posso raccogliere una richiesta di richiamo."};
    return {slot:result.slot,giorno_pronuncia:italianVoiceDate(date),orari_pronuncia:result.slot.slice(0,6).map(italianVoiceTime),risposta:result.slot.length?`Per ${date} sono disponibili questi orari: ${result.slot.slice(0,6).join(", ")}. Quale preferisce?`:`Per ${date} non ci sono orari disponibili. Vuole provare un altro giorno?`};
  }
  const time=normalizzaOra(String(params.ora || ""));
  if(!time)return {creato:false,risposta:"Mi conferma l’orario scelto, oltre al giorno?"};
  const contact=await trovaContattoPerTelefono(db,companyId,suffissoTelefono(phone),phone);
  const booked=await prenotaSuCalendario(db,{calendarId,companyId,dataIso:date,ora:time,contactId:contact?.id || null,opportunityId:null,titolo:`${String(params.motivo || "Sopralluogo").slice(0,200)}${params.nome?` — ${String(params.nome).slice(0,120)}`:""}`,descrizione:`Richiesta confermata durante la chiamata Fish. Recapito: ${phone}${params.indirizzo?`\nIndirizzo dichiarato e confermato: ${String(params.indirizzo).slice(0,400)}`:""}`,tipo:"agente_ai"});
  return booked.ok?{giorno_pronuncia:italianVoiceDate(date),ora_pronuncia:italianVoiceTime(time),creato:true,appointment_id:booked.appointmentId,risposta:`Appuntamento confermato per ${booked.quando}.`}:{creato:false,risposta:`L’appuntamento non è confermato. ${booked.messaggio} Possiamo controllare un altro orario.`};
}
