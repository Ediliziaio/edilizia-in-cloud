export type CentralinoCall = { id: string; kind: "human" | "ai"; agentId?: string; provider?: string; direction: string; number: string | null; status: string; seconds: number; date: string; contactId: string | null; customerId: string | null; name: string; who: string; audio: string | null; summary: string | null; transcript: { role?: string; message?: string; text?: string }[] };
export const completePhone = (value: string | null | undefined) => (value || "").replace(/\D/g, "");
export function centralinoCalls(human: any[], ai: any[]): CentralinoCall[] {
  return [...human.map(r => ({ id: r.id, kind: "human" as const, direction: r.direction, number: r.direction === "inbound" ? r.from_number : r.to_number, status: r.status, seconds: r.duration_seconds || 0, date: r.started_at, contactId: r.contact_id, customerId: r.customer_id, name: r.contact_name || "", who: r.user_name || "Operatore", audio: r.recording_url, summary: null, transcript: [] })),
    ...ai.map(r => ({ id: r.id, kind: "ai" as const, agentId: r.agent_id, provider: r.voice_provider, direction: r.direzione || "inbound", number: r.direzione === "outbound" ? r.numero_chiamato : r.numero_chiamante, status: r.stato, seconds: r.durata_secondi || 0, date: r.iniziata_il || r.creato_il, contactId: r.contact_id, customerId: r.customer_id, name: "", who: "Agente AI", audio: r.audio_url, summary: r.riassunto, transcript: Array.isArray(r.trascrizione_json) ? r.trascrizione_json : [] }))]
    .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
export function matchesCallParty(call: CentralinoCall, party: { contactId?: string | null; customerId?: string | null; phone?: string | null }) {
  const phone = completePhone(party.phone);
  if ((party.contactId && call.contactId === party.contactId) || (party.customerId && call.customerId === party.customerId)) return true;
  if (party.contactId || party.customerId || call.contactId || call.customerId) return false;
  return phone.length >= 7 && completePhone(call.number) === phone;
}
export const callStatus = (value: string) => ({ completed:"Completata",completata:"Completata",active:"In corso",in_progress:"In corso",in_corso:"In corso",ringing:"Squilla",failed:"Fallita",fallita:"Fallita",no_answer:"Senza risposta",no_risposta:"Senza risposta",occupato:"Occupato",busy:"Occupato",prepared:"In preparazione" }[value] || value);
