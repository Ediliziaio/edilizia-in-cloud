/**
 * outreach-inbound-logic — logica PURA dell'ingestione risposte (niente Deno/Supabase).
 * Normalizza payload webhook di vari provider (SES/SNS, Mailgun, generico) in una
 * forma unica, estrae mittente/oggetto/snippet ripulito. Testata in vitest.
 */

export interface NormalizedInbound {
  fromEmail: string;
  toEmail: string | null;
  subject: string | null;
  snippet: string | null;
  messageId: string | null;
  inReplyTo: string | null;
}

const EMAIL_RE = /[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+/;

/** Estrae l'indirizzo da "Nome <email@x.com>" o "email@x.com". Lowercase. */
export function extractEmail(raw: unknown): string | null {
  if (raw == null) return null;
  const m = String(raw).match(EMAIL_RE);
  return m ? m[0].toLowerCase() : null;
}

/** Snippet leggibile: rimuove righe citate (>), firme banali, comprime spazi, tronca. */
export function snippetFrom(text: unknown, maxLen = 280): string | null {
  if (text == null) return null;
  const lines = String(text).split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith(">")) continue; // testo citato
    if (/^On .+wrote:$/.test(t)) break; // header di quoting EN
    if (/^Il .+ ha scritto:$/.test(t)) break; // header di quoting IT
    if (t === "--" || t === "-- ") break; // separatore firma
    kept.push(t);
  }
  const cleaned = kept.join(" ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen - 1) + "…" : cleaned;
}

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== "") return obj[k];
  }
  return null;
}

/**
 * Normalizza un payload webhook generico. Supporta chiavi comuni di
 * SES/Lambda parsed, Mailgun (body-plain, stripped-text), e un formato semplice.
 * Ritorna null se non si riesce a determinare il mittente.
 */
export function normalizeInbound(body: unknown): NormalizedInbound | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const fromEmail = extractEmail(pick(b, ["from", "From", "sender", "from_email"]));
  if (!fromEmail) return null;
  return {
    fromEmail,
    toEmail: extractEmail(pick(b, ["to", "To", "recipient", "to_email"])),
    subject: (pick(b, ["subject", "Subject"]) as string | null) ?? null,
    snippet: snippetFrom(pick(b, ["text", "body-plain", "stripped-text", "stripped_text", "html", "body"])),
    messageId: (pick(b, ["messageId", "Message-Id", "message-id", "message_id"]) as string | null) ?? null,
    inReplyTo: (pick(b, ["inReplyTo", "In-Reply-To", "in_reply_to"]) as string | null) ?? null,
  };
}

/** Una notifica SNS di conferma sottoscrizione va gestita a parte (non è una risposta). */
export function isSnsSubscriptionConfirmation(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  return (body as Record<string, unknown>).Type === "SubscriptionConfirmation";
}
