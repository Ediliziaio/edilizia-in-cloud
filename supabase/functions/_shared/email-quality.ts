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
  codaAttaccata: boolean; // «…@studio.itpec»: la parola dopo l'indirizzo è rimasta incollata
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

/**
 * Domini di primo livello che vediamo davvero, più quelli che iniziano come
 * uno di essi (company, computer, network…): servono a NON scambiare per
 * errore un indirizzo buono.
 */
const TLD_NOTI = new Set([
  "it", "com", "net", "org", "eu", "info", "biz", "io", "co", "me", "pro", "tv", "cc",
  "cloud", "online", "store", "site", "tech", "blog", "art", "space", "digital", "fun",
  "shop", "agency", "company", "computer", "consulting", "construction", "contractors",
  "coop", "community", "condos", "network", "works", "solutions", "services", "group",
  "studio", "design", "email", "expert", "casa", "house", "immo", "build", "engineering",
  "green", "energy", "organic", "network", "srl", "band", "life", "world", "click",
  "de", "fr", "es", "ch", "at", "uk", "us", "nl", "be", "si", "hr", "mt", "sm", "va",
  "ru", "pl", "pt", "gr", "se", "no", "dk", "fi", "ie", "lu", "cz", "sk", "hu", "ro", "bg", "tr",
]);

/** Prefissi da cui nascono gli indirizzi «incollati» che abbiamo visto. */
const TLD_TRONCABILI = ["it", "com", "net", "org", "eu", "info", "biz"];

/**
 * «boggeri@boggeri.itpec», «…@studio.ittelefono», «…@x.comvoglio»: chi ha
 * raccolto l'indirizzo si è portato dietro la parola successiva della pagina
 * («PEC:», «Telefono:», «Voglio…»). Sintatticamente sono validi, quindi
 * passavano i controlli e finivano nell'outreach: il server del destinatario
 * li rifiuta (550) e ogni rifiuto pesa sulla reputazione di chi spedisce.
 * Il 23/09/2026 erano 47 contatti, 23 rifiuti in sette giorni.
 *
 * Non si indovina l'indirizzo giusto: si riconosce che è rotto e non gli si
 * scrive. Un dominio che è già un TLD vero (company, computer, network…) non
 * viene toccato.
 */
export function codaAttaccataAlDominio(email: string): boolean {
  const dominio = String(email ?? "").trim().toLowerCase().split("@")[1] ?? "";
  const etichetta = dominio.split(".").pop() ?? "";
  if (!etichetta || TLD_NOTI.has(etichetta)) return false;
  return TLD_TRONCABILI.some((tld) =>
    etichetta.startsWith(tld) && etichetta.length >= tld.length + 2 && !TLD_NOTI.has(etichetta.slice(tld.length))
  );
}

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
    codaAttaccata: syntaxValid && codaAttaccataAlDominio(email),
    isDisposable: !!domain && DISPOSABLE_DOMAINS.has(domain),
    isFree: !!domain && FREE_DOMAINS.has(domain),
  };
}

/** Da scartare per il cold se si vuole alta qualità: sintassi errata, coda attaccata, role o usa-e-getta. */
export function isLowQuality(q: EmailQuality): boolean {
  return !q.syntaxValid || q.codaAttaccata || q.isRole || q.isDisposable;
}
