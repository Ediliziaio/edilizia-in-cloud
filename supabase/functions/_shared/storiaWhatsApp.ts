/**
 * La storia di una chat WhatsApp trasformata in turni per l'LLM (25/09/2026).
 *
 * Si legge per contatto, nei due versi: i bot di prima filtravano per
 * `from_phone` = il cliente, così non vedevano le proprie risposte (in uscita
 * `from_phone` è il numero dell'azienda) e rifacevano le stesse domande.
 * Vocali e foto diventano una nota tra parentesi quadre: l'agente sa che sono
 * arrivati anche se non li può ascoltare o guardare.
 *
 * Nessun import: lo leggono sia Deno sia i test.
 */

export interface RigaMessaggio {
  direction: "inbound" | "outbound" | string;
  message_type: string | null;
  content_text: string | null;
  created_at: string;
}

export interface Turno {
  role: "user" | "assistant";
  content: string;
}

export function testoDelMessaggio(tipo: string | null, testo: string | null): string {
  const t = String(testo ?? "").trim();
  const k = String(tipo ?? "text").toLowerCase();
  if (k === "audio" || k === "voice" || k === "ptt") return "[Il cliente ha mandato un messaggio vocale, che non puoi ascoltare]";
  if (k === "image" || k === "sticker") return t ? `[Il cliente ha mandato una foto] ${t}` : "[Il cliente ha mandato una foto]";
  if (k === "video") return t ? `[Il cliente ha mandato un video] ${t}` : "[Il cliente ha mandato un video]";
  if (k === "document") return t ? `[Il cliente ha mandato un documento] ${t}` : "[Il cliente ha mandato un documento]";
  return t || "[Messaggio vuoto]";
}

export function turniPerLlm(righe: RigaMessaggio[], max = 24): Turno[] {
  const ordinate = [...righe].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const turni: Turno[] = [];
  for (const r of ordinate) {
    const role: Turno["role"] = r.direction === "inbound" ? "user" : "assistant";
    const content = role === "user"
      ? testoDelMessaggio(r.message_type, r.content_text)
      : String(r.content_text ?? "").trim();
    if (!content) continue;
    const ultimo = turni[turni.length - 1];
    if (ultimo && ultimo.role === role) ultimo.content = `${ultimo.content}\n${content}`;
    else turni.push({ role, content });
  }
  return turni.slice(-Math.max(1, max));
}
