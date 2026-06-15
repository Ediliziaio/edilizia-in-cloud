/**
 * outreach-reply-match — logica PURA per associare una risposta IMAP/webhook al
 * contatto noto. Match per indirizzo mittente (case-insensitive). Niente
 * Deno/Supabase: testata in vitest. inReplyTo/references sono accettati per
 * estensioni future (threading), oggi il match è solo per indirizzo.
 */

export interface ReplyHeaders {
  from: string;
  inReplyTo?: string | null;
  references?: string[];
}

export interface KnownContact {
  id: string;
  email: string | null;
}

/** Estrae l'indirizzo da "Nome <email@x.com>" o "email@x.com". Lowercase, trimmed. */
function emailOf(s: string): string {
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim().toLowerCase();
}

/** Ritorna il contatto il cui indirizzo coincide col mittente, altrimenti null. */
export function matchReplyToContact(h: ReplyHeaders, contacts: KnownContact[]): KnownContact | null {
  const addr = emailOf(h.from || "");
  if (!addr) return null;
  return contacts.find((c) => (c.email ?? "").trim().toLowerCase() === addr) ?? null;
}
