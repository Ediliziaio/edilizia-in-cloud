/**
 * Cosa il bot operativo ricorda fra un messaggio e l'altro (27/09/2026):
 *  - la domanda di conferma in attesa (quale strumento sblocca il «Sì»,
 *    eventualmente la proposta di Silvio da eseguire);
 *  - le aree di strumenti di Silvio già caricate.
 * Sta in whatsapp_sessions.state_data, sotto chiavi proprie, e scade dopo
 * 30 minuti. Prima qualunque «sì» sbloccava qualunque azione.
 */

export interface ConfermaAttesa {
  /** Strumento che il Sì può eseguire; null = scelta, non autorizza scritture. */
  azione: string | null;
  /** Proposta di Silvio da eseguire al Sì. */
  proposta_id: string | null;
  chiesta_il: string;
  numero_id?: string;
  id?: string;
  parametri?: Record<string, unknown>;
  payload_hash?: string;
  source_message_id?: string;
  media?: { storagePath: string; url: string; tipo: string } | null;
}

export interface StatoSessioneBot {
  conferma: ConfermaAttesa | null;
  domini: string[];
}

export const VALIDITA_MS = 30 * 60 * 1000;

function record(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function recente(iso: unknown, adesso: Date): boolean {
  const t = typeof iso === "string" ? Date.parse(iso) : NaN;
  const age = adesso.getTime() - t;
  return Number.isFinite(t) && age >= 0 && age <= VALIDITA_MS;
}

export function leggiStatoSessione(stateData: unknown, adesso: Date): StatoSessioneBot {
  const s = record(stateData) ?? {};
  const c = record(s.bot_conferma);
  const conferma = c && recente(c.chiesta_il, adesso)
    ? {
      azione: typeof c.azione === "string" && c.azione ? c.azione : null,
      proposta_id: typeof c.proposta_id === "string" && c.proposta_id ? c.proposta_id : null,
      chiesta_il: String(c.chiesta_il),
      ...(typeof c.numero_id === "string" ? { numero_id: c.numero_id } : {}),
      ...(typeof c.id === "string" ? { id: c.id } : {}),
      ...(record(c.parametri) ? { parametri: record(c.parametri)! } : {}),
      ...(typeof c.payload_hash === "string" ? { payload_hash: c.payload_hash } : {}),
      ...(typeof c.source_message_id === "string" ? { source_message_id: c.source_message_id } : {}),
      ...(record(c.media) ? { media: c.media as unknown as ConfermaAttesa["media"] } : {}),
    }
    : null;
  const a = record(s.bot_aree);
  const domini = a && recente(a.il, adesso) && Array.isArray(a.domini)
    ? a.domini.filter((d): d is string => typeof d === "string")
    : [];
  return { conferma, domini };
}

/** Il «Sì» di questo turno sblocca QUESTO strumento? */
export function confermaValePer(
  conferma: ConfermaAttesa | null,
  nomeStrumento: string,
  utenteHaConfermato: boolean,
): boolean {
  if (!utenteHaConfermato) return false;
  if (!conferma?.azione) return false;
  return conferma.azione === nomeStrumento;
}

/** Una scelta di cantiere o «ok, ma cambia ...» non è approvazione dell'azione. */
export function rispostaAllaConferma(testo: string): "si" | "no" | null {
  const value = testo.trim().toLowerCase().replace(/[.!?]+$/g, "").trim();
  if (/^(no|annulla|annullo|non confermo|ferma|stop|lascia stare)$/.test(value)) return "no";
  if (/^(s[ìi]|ok|okay|va bene|confermo|conferma|procedi|approvo|d'accordo|certo|esatto)$/.test(value)) return "si";
  return null;
}

/** Il nuovo state_data: tiene le altre chiavi, cambia solo quelle passate. */
export function statoDaSalvare(
  precedente: unknown,
  cambi: { conferma?: ConfermaAttesa | null; domini?: string[] },
  adesso: Date,
): Record<string, unknown> {
  const s: Record<string, unknown> = { ...(record(precedente) ?? {}) };
  if (cambi.conferma === null) delete s.bot_conferma;
  else if (cambi.conferma) s.bot_conferma = cambi.conferma;
  if (cambi.domini) s.bot_aree = { domini: cambi.domini, il: adesso.toISOString() };
  return s;
}
