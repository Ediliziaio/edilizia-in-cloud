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
  /** Cantieri fra cui l'operaio può scegliere (18/10/2026): la scelta vale come conferma. */
  cantieri?: CantiereDaScegliere[];
  /** L'elenco dei cantieri è già stato mostrato: «2» vuol dire il secondo. */
  lista_mostrata?: boolean;
}

export interface CantiereDaScegliere {
  id: string;
  titolo: string;
  dettaglio: string;
}

function cantieriValidi(v: unknown): CantiereDaScegliere[] | null {
  if (!Array.isArray(v)) return null;
  const out = v.filter((c): c is CantiereDaScegliere => !!record(c) && typeof c.id === "string" && typeof c.titolo === "string" && typeof c.dettaglio === "string")
    .map((c) => ({ id: c.id, titolo: c.titolo, dettaglio: c.dettaglio }));
  return out.length === v.length ? out : null;
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
      ...(cantieriValidi(c.cantieri) ? { cantieri: cantieriValidi(c.cantieri)! } : {}),
      ...(c.lista_mostrata === true ? { lista_mostrata: true } : {}),
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
  const value = testo.trim().toLowerCase().replace(/[.!?👍✅]+$/gu, "").trim();
  if (/^(no|annulla|annullo|non confermo|ferma|stop|lascia stare)$/.test(value)) return "no";
  if (/^(s[ìi]|ok|okay|va bene|confermo|conferma|procedi|approvo|d'accordo|certo|esatto|perfetto|giusto|vai)$/.test(value)) return "si";
  // «Sì, confermo», «ok procedi», «no, annulla» (18/10/2026): solo parole di
  // conferma o di rifiuto, niente altro. «Ok, ma cambia le ore» resta una richiesta.
  const parole = value.split(/[\s,;]+/).filter(Boolean);
  const SI = new Set(["sì", "si", "ok", "okay", "va", "bene", "confermo", "conferma", "procedi", "vai", "pure", "approvo",
    "certo", "esatto", "giusto", "perfetto", "grazie", "d'accordo", "tutto", "a", "posto",
    // «sì, fallo», «sì salvalo», «ok mandalo»: il verbo di ciò che si sta confermando.
    "fallo", "falla", "salvalo", "salvala", "salva", "mandalo", "mandala", "manda", "invialo", "inviala", "registralo",
    "registrala", "registra", "generalo", "generala", "caricalo", "caricala", "procediamo", "andiamo"]);
  const NO = new Set(["no", "annulla", "annullo", "non", "confermo", "ferma", "stop", "lascia", "stare", "grazie", "niente"]);
  if (parole.length >= 2 && parole.length <= 5) {
    if (parole[0] === "no" && parole.every((w) => NO.has(w))) return "no";
    if (["sì", "si", "ok", "okay", "confermo", "procedi", "vai", "certo", "perfetto"].includes(parole[0]) && parole.every((w) => SI.has(w))) return "si";
  }
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
