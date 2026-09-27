/**
 * Cosa il bot operativo ricorda fra un messaggio e l'altro (27/09/2026):
 *  - la domanda di conferma in attesa (quale strumento sblocca il «Sì»,
 *    eventualmente la proposta di Silvio da eseguire);
 *  - le aree di strumenti di Silvio già caricate.
 * Sta in whatsapp_sessions.state_data, sotto chiavi proprie, e scade dopo
 * 30 minuti. Prima qualunque «sì» sbloccava qualunque azione.
 */

export interface ConfermaAttesa {
  /** Strumento che il Sì può eseguire; null = qualunque (domanda senza azione indicata). */
  azione: string | null;
  /** Proposta di Silvio da eseguire al Sì. */
  proposta_id: string | null;
  chiesta_il: string;
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
  return Number.isFinite(t) && adesso.getTime() - t <= VALIDITA_MS;
}

export function leggiStatoSessione(stateData: unknown, adesso: Date): StatoSessioneBot {
  const s = record(stateData) ?? {};
  const c = record(s.bot_conferma);
  const conferma = c && recente(c.chiesta_il, adesso)
    ? {
      azione: typeof c.azione === "string" && c.azione ? c.azione : null,
      proposta_id: typeof c.proposta_id === "string" && c.proposta_id ? c.proposta_id : null,
      chiesta_il: String(c.chiesta_il),
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
  if (!conferma || !conferma.azione) return true;
  return conferma.azione === nomeStrumento;
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
