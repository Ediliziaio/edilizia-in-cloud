/**
 * email-quality — classificazione PURA della qualità di un indirizzo email
 * (niente Deno/Supabase). Per filtrare i lead a basso recapito prima dell'invio
 * cold: indirizzi role (info@, noreply@), usa-e-getta, provider gratuiti.
 * Testato in vitest. Condiviso UI import + eventuale verifica server.
 */

export interface EmailQuality {
  email: string;
  domain: string | null;
  syntaxValid: boolean;
  isRole: boolean;       // info@, noreply@, … (non una persona)
  isDisposable: boolean; // dominio usa-e-getta
  isFree: boolean;       // provider gratuito (gmail, libero, …)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLE_LOCALS = new Set([
  "info", "noreply", "no-reply", "postmaster", "admin", "administrator", "webmaster",
  "support", "assistenza", "sales", "contact", "contatti", "hello", "help", "abuse",
  "marketing", "amministrazione", "segreteria", "ufficio", "commerciale", "direzione",
]);

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "tempmail.com", "temp-mail.org", "10minutemail.com", "guerrillamail.com",
  "yopmail.com", "trashmail.com", "getnada.com", "sharklasers.com", "fakeinbox.com",
  "throwawaymail.com", "maildrop.cc", "dispostable.com",
]);

const FREE_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.it", "outlook.com", "outlook.it",
  "live.com", "live.it", "yahoo.com", "yahoo.it", "icloud.com", "me.com",
  "libero.it", "virgilio.it", "alice.it", "tin.it", "tiscali.it", "email.it", "fastwebnet.it",
]);

export function classifyEmail(raw: string): EmailQuality {
  const email = String(raw ?? "").trim().toLowerCase();
  const syntaxValid = EMAIL_RE.test(email);
  const at = email.indexOf("@");
  const local = at >= 0 ? email.slice(0, at) : "";
  const domain = at >= 0 ? email.slice(at + 1) : null;
  const localBase = local.split("+")[0]; // ignora il +tag

  return {
    email,
    domain,
    syntaxValid,
    isRole: syntaxValid && ROLE_LOCALS.has(localBase),
    isDisposable: !!domain && DISPOSABLE_DOMAINS.has(domain),
    isFree: !!domain && FREE_DOMAINS.has(domain),
  };
}

/** Da scartare per il cold se si vuole alta qualità: sintassi errata, role o usa-e-getta. */
export function isLowQuality(q: EmailQuality): boolean {
  return !q.syntaxValid || q.isRole || q.isDisposable;
}
