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
  /** Il testo spedito (HTML o testo), per citarlo nel follow-up come fa chi risponde. */
  body?: string | null;
  sentAt?: string | null;
  /** Chi lo ha spedito, per la riga «X ha scritto:». */
  fromName?: string | null;
  fromEmail?: string | null;
}

/**
 * Il messaggio precedente citato sotto al follow-up, come lo fa un client di
 * posta quando si preme «Rispondi»: una riga «Il giorno … ha scritto:» e il
 * testo con «> » davanti. Un follow-up nudo, senza il messaggio a cui
 * risponde, è una delle cose che distinguono un mailer da una persona — e
 * al destinatario toglie il contesto.
 */
export function citazionePrecedente(
  prev: SentStep | null | undefined,
  testoDa: (htmlOTesto: string) => string,
): { testo: string; html: string } {
  const corpo = String(prev?.body ?? "").trim();
  if (!prev || !corpo) return { testo: "", html: "" };
  const pulito = testoDa(corpo).trim();
  if (!pulito) return { testo: "", html: "" };
  const quando = prev.sentAt ? dataItaliana(prev.sentAt) : null;
  const chi = prev.fromName && prev.fromEmail
    ? `${prev.fromName} <${prev.fromEmail}>`
    : (prev.fromEmail ?? prev.fromName ?? "");
  const intestazione = quando
    ? `Il giorno ${quando}${chi ? `, ${chi}` : ""} ha scritto:`
    : `${chi || "Io"} ha scritto:`;
  const righe = pulito.split(/\r?\n/).map((r) => `> ${r}`.trimEnd());
  const testo = `\n\n${intestazione}\n${righe.join("\n")}`;
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<br><br><div>${esc(intestazione)}</div>`
    + `<blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">${esc(pulito).replace(/\r?\n/g, "<br>")}</blockquote>`;
  return { testo, html };
}

/** «gio 10 set 2026 alle ore 09:12» nel fuso di Roma, come lo scrive Gmail in italiano. */
function dataItaliana(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parti = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).formatToParts(d);
  const v = (t: string) => parti.find((x) => x.type === t)?.value ?? "";
  return `${v("weekday")} ${v("day")} ${v("month")} ${v("year")} alle ore ${v("hour")}:${v("minute")}`;
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
