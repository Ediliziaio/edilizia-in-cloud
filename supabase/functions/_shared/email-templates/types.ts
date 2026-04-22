/**
 * Tipi condivisi dei template email.
 *
 * Ogni template esporta:
 *   - Props: tipo delle variabili dinamiche richieste
 *   - SUBJECT: funzione che produce l'oggetto email da Props
 *   - render: funzione che produce l'HTML body da Props + Branding
 *   - plainText: funzione che produce la versione testuale (fallback text/plain)
 */

/** Branding dinamico da company_email_preferences (una riga per azienda). */
export interface Branding {
  /** Nome azienda mittente (es. "Rossi Costruzioni SRL"). */
  companyName: string;
  /** URL logo azienda (HTTPS). Se NULL viene mostrato solo il testo. */
  logoUrl?: string | null;
  /** Colore primario in formato #RRGGBB. */
  primaryColor: string;
  /** Colore secondario/accento in formato #RRGGBB. */
  secondaryColor: string;
  /** Testo personalizzato nel footer (es. indirizzo legale, P.IVA). */
  footerText?: string | null;
  /** Se true aggiunge "Inviato con EdiliziaInCloud" al footer. */
  showPoweredBy: boolean;
  /** Testo sostitutivo del footer unsubscribe per email marketing (HTML). */
  unsubscribeFooterHtml?: string | null;
  /** Reply-to configurato (es. info@azienda.it). */
  replyTo: string;
  /** Link unsubscribe (marketing) o link vuoto per transactional. */
  unsubscribeUrl?: string | null;
}

/** Output di ogni template dopo il render. */
export interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
}

/** Helper per evitare HTML injection dai campi dinamici. */
export function escapeHtml(str: string | number | null | undefined): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Format Euro amount in it-IT locale. */
export function formatEuro(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  const value = cents / 100;
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(value);
}

/** Format date ISO → gg/mm/aaaa it-IT. */
export function formatDateIt(isoDate: string | Date | null | undefined): string {
  if (!isoDate) return "—";
  const d = isoDate instanceof Date ? isoDate : new Date(isoDate);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}
