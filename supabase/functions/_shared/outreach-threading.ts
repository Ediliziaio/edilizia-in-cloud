/**
 * outreach-threading — logica PURA per tenere i follow-up nello STESSO thread
 * del primo messaggio (In-Reply-To / References / "Re: …").
 *
 * Perche' conta: un follow-up che arriva come email nuova e' un secondo cold;
 * lo stesso testo dentro il thread del primo e' una persona che riscrive.
 * Gmail e Outlook li raggruppano, i filtri antispam li leggono come
 * conversazione. Nessuna dipendenza Deno: testabile in vitest.
 */

export interface SentStep {
  messageId: string | null;
  subject: string | null;
  threadId?: string | null;
  /** Casella che ha spedito quel passo (il follow-up deve partire dalla stessa). */
  senderId?: string | null;
}

export interface FollowupHeaders {
  subject: string;
  inReplyTo: string | null;
  references: string[];
  /** Id thread del provider (Gmail) del primo invio, se noto. */
  threadId: string | null;
  /** Numero del touch: 1 = primo contatto, 2 = primo follow-up, … */
  touch: number;
}

/** Toglie i prefissi "Re:", "R:", "Fwd:", "I:" ripetuti in testa all'oggetto. */
export function stripRe(subject: string | null | undefined): string {
  return String(subject ?? "").replace(/^\s*(?:(?:re|r|fwd?|fw|i|ris?|aw|sv|vs)\s*:\s*)+/i, "").trim();
}

/**
 * Header del passo da spedire dati i passi GIA' spediti (in ordine di invio).
 * Oggetto del passo vuoto = "rispondi nello stesso thread": Re: + oggetto del
 * primo. Oggetto valorizzato = si usa quello, ma resta agganciato al thread.
 */
export function buildFollowupHeaders(previous: SentStep[], stepSubject: string | null | undefined): FollowupHeaders {
  // Solo Message-ID RFC ("<…@…>"): gli id API di Elastic Email non lo sono e
  // finirebbero in un In-Reply-To malformato.
  const conId = previous.filter((p) => !!p.messageId && p.messageId.trim().startsWith("<"));
  const touch = previous.length + 1;
  const proprio = String(stepSubject ?? "").trim();
  if (previous.length === 0) {
    return { subject: proprio, inReplyTo: null, references: [], threadId: null, touch };
  }
  const primoOggetto = stripRe(previous.find((p) => (p.subject ?? "").trim())?.subject ?? "");
  const subject = proprio || (primoOggetto ? `Re: ${primoOggetto}` : "");
  const references = conId.map((p) => p.messageId as string);
  const ultimo = conId.length ? conId[conId.length - 1] : null;
  const threadId = [...previous].reverse().find((p) => p.threadId)?.threadId ?? null;
  return { subject, inReplyTo: ultimo?.messageId ?? null, references, threadId, touch };
}
