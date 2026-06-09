/**
 * fbcTracker — cattura e persiste `fbclid` / `_fbc` / `_fbp` per attribuzione CAPI.
 *
 * Quando un utente arriva da Facebook Ads:
 *   1. URL contiene `?fbclid=XXX`
 *   2. Trasformiamo `fbclid` → `_fbc` cookie nel formato Meta: `fb.{subdomain_index}.{timestamp}.{fbclid}`
 *   3. `_fbp` è il Browser ID Meta (creato dal Pixel client-side, formato `fb.1.{timestamp}.{random}`)
 *      Se il Pixel non è installato, lo creiamo noi.
 *   4. Al lead/opportunity/order, leggiamo questi valori e li passiamo al CAPI server-side.
 *
 * Persistenza: cookies con durata 90 giorni (allineata al window di attribuzione Meta).
 */

const FBC_COOKIE = "_fbc";
const FBP_COOKIE = "_fbp";
const FBC_LIFETIME_DAYS = 90;
const SUBDOMAIN_INDEX = 1; // standard per dominio singolo

/** Legge il valore di un cookie. */
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[2]) : null;
}

/** Setta un cookie con durata in giorni. Auto-detect del dominio root. */
function setCookie(name: string, value: string, days: number) {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + days * 86400 * 1000).toUTCString();
  // Use root domain (.eic.app) per condividere cookie across subdomain
  const host = window.location.hostname;
  const isPrivateHost = /^(app|admin|clienti|lavori|commercialista|referral)\./.test(host);
  const cookieDomain = isPrivateHost ? `; domain=.${host.split(".").slice(-2).join(".")}` : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax${cookieDomain}`;
}

/** Estrae fbclid da URL (?fbclid=...) */
function getFbclidFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("fbclid");
}

/**
 * Inizializza la cattura fbclid → _fbc all'avvio dell'app.
 *
 * Chiamare in `App.tsx` o `main.tsx` una volta sola al mount.
 *
 * Flusso:
 *   1. Se URL contiene fbclid, costruisce _fbc nel formato Meta e lo salva
 *   2. Se non esiste _fbp, ne crea uno per consistenza con il Pixel
 *   3. Idempotente: non sovrascrive se _fbc già presente con stesso fbclid
 */
export function initFacebookClickTracker() {
  if (typeof window === "undefined") return;

  // 1. Cattura fbclid
  const fbclid = getFbclidFromUrl();
  if (fbclid) {
    const existingFbc = getCookie(FBC_COOKIE);
    const fbcValue = `fb.${SUBDOMAIN_INDEX}.${Date.now()}.${fbclid}`;
    // Se non esiste o se fbclid è cambiato, aggiorna
    if (!existingFbc || !existingFbc.endsWith(fbclid)) {
      setCookie(FBC_COOKIE, fbcValue, FBC_LIFETIME_DAYS);
    }
  }

  // 2. Bootstrap _fbp se mancante
  if (!getCookie(FBP_COOKIE)) {
    const random = Math.floor(Math.random() * 1e10);
    const fbpValue = `fb.${SUBDOMAIN_INDEX}.${Date.now()}.${random}`;
    setCookie(FBP_COOKIE, fbpValue, FBC_LIFETIME_DAYS);
  }
}

/**
 * Ritorna i cookie Meta per attribuzione, pronti per il CAPI payload.
 */
export function getFacebookAttribution(): {
  fbc: string | null;
  fbp: string | null;
  fbclid: string | null;
} {
  return {
    fbc: getCookie(FBC_COOKIE),
    fbp: getCookie(FBP_COOKIE),
    fbclid: getFbclidFromUrl(),
  };
}

/**
 * Helper per chiamare l'edge function meta-capi-send-event dal frontend.
 * NB: chiamata diretta dal client è OK SOLO per eventi non-PII (es. PageView).
 * Per eventi con PII (Lead/Schedule/Purchase) chiamare dal backend.
 */
export interface CapiEventPayload {
  company_id: string;
  event_name: "Lead" | "Schedule" | "Purchase" | "CompleteRegistration" | "Contact";
  event_id: string;
  event_time?: number;
  event_source_url?: string;
  action_source?: "website" | "crm" | "email" | "phone_call" | "physical_store" | "system_generated" | "other";
  user_data: {
    email?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
    zip?: string;
    city?: string;
    country?: string;
    fbc?: string;
    fbp?: string;
    client_ip_address?: string;
    client_user_agent?: string;
    lead_id?: string;
  };
  custom_data?: {
    value?: number;
    currency?: string;
    content_category?: string;
    content_name?: string;
    content_ids?: string[];
  };
}

/**
 * Genera un event_id UUID per dedup pixel ↔ CAPI.
 * Da chiamare PRIMA di emettere l'evento sia client (pixel) che server (CAPI).
 */
export function generateEventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Meta Pixel (browser) — emissione eventi standard.
 * Il Pixel base è installato in index.html SOLO sulle pagine marketing
 * (host ediliziaincloud.com, fuori dalle rotte private) e setta
 * window.__EIC_PIXEL_ENABLED. Qui emettiamo gli eventi in modo sicuro:
 * no-op se il Pixel non è attivo, e mai un throw che rompa il flusso utente.
 * ─────────────────────────────────────────────────────────────────────────── */

export type PixelEvent =
  | "PageView"
  | "ViewContent"
  | "Lead"
  | "InitiateCheckout"
  | "CompleteRegistration"
  | "Purchase"
  | "Contact";

/** True se il Pixel browser è caricato e abilitato (pagina marketing pubblica). */
export function isPixelEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { fbq?: unknown; __EIC_PIXEL_ENABLED?: boolean };
  return typeof w.fbq === "function" && w.__EIC_PIXEL_ENABLED === true;
}

/**
 * Emette un evento standard del Meta Pixel. Passa lo stesso `eventId` anche al
 * CAPI server-side (quando previsto) per la deduplica pixel↔CAPI. No-op se il
 * Pixel è spento (es. dentro l'app loggata o host non-marketing).
 */
export function trackPixel(
  event: PixelEvent,
  params?: Record<string, unknown>,
  eventId?: string,
): void {
  if (!isPixelEnabled()) return;
  try {
    const fbq = (window as unknown as { fbq: (...a: unknown[]) => void }).fbq;
    if (eventId) {
      fbq("track", event, params ?? {}, { eventID: eventId });
    } else {
      fbq("track", event, params ?? {});
    }
  } catch {
    /* il tracking non deve mai rompere il flusso utente */
  }
}
