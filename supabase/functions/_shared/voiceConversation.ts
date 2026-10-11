/** Translate provider events into the existing v2 database vocabulary. */
export function voiceConversationStatus(status: string): string {
  const states: Record<string, string> = {
    completed: "completata", failed: "fallita", no_answer: "no_risposta",
    busy: "occupato", voicemail: "segreteria",
    completata: "completata", fallita: "fallita", no_risposta: "no_risposta",
    occupato: "occupato", segreteria: "segreteria",
  };
  if (!states[status]) throw new Error(`Stato della chiamata non riconosciuto: ${status}`);
  return states[status];
}
