/**
 * trackEvent — client helper per loggare eventi prodotto su `product_events`.
 *
 * Pattern: chiama OVUNQUE serve tracciare un'azione utente in EiC.
 * Esempi:
 *   trackEvent("commesse.created", { count: 1 });
 *   trackEvent("oda.first_use", "feature");
 *   trackEvent("export.csv", "export", { rows: 1247 });
 *
 * - Fire-and-forget (no await richiesto) — non blocca la UX
 * - Throttling automatico: stesso evento entro 500ms scartato (anti-spam click)
 * - Sessione: usa `sessionStorage._eic_session_id` (creato se manca)
 * - Niente PII nei properties: il helper rifiuta key sensibili
 */
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";

type EventCategory =
  | "login"
  | "feature"
  | "billing"
  | "onboarding"
  | "error"
  | "team"
  | "integration"
  | "settings"
  | "export"
  | "support";

/** Lista di key sensibili NON loggabili nei properties. */
const FORBIDDEN_PROPERTY_KEYS = new Set([
  "password",
  "token",
  "secret",
  "api_key",
  "credit_card",
  "iban",
  "ssn",
  "codice_fiscale",
  "cf",
]);

/** Mappa { eventName → lastTimestamp } per throttle 500ms. */
const recentEvents = new Map<string, number>();
const THROTTLE_MS = 500;

function getSessionId(): string {
  try {
    let sid = window.sessionStorage.getItem("_eic_session_id");
    if (!sid) {
      sid = `s-${crypto.randomUUID()}`;
      window.sessionStorage.setItem("_eic_session_id", sid);
    }
    return sid;
  } catch {
    return "s-unknown";
  }
}

function sanitizeProperties(properties?: Record<string, unknown>): Record<string, unknown> {
  if (!properties) return {};
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    const keyLc = key.toLowerCase();
    if (FORBIDDEN_PROPERTY_KEYS.has(keyLc)) {
      logger.warn(`[trackEvent] skipped sensitive key: ${key}`);
      continue;
    }
    // Limita size individuale (anti-payload bomb)
    if (typeof value === "string" && value.length > 500) {
      safe[key] = value.slice(0, 500) + "…";
    } else {
      safe[key] = value;
    }
  }
  return safe;
}

interface TrackEventOptions {
  category?: EventCategory;
  properties?: Record<string, unknown>;
  /** Override company_id (usato in admin context per impersonation). */
  companyId?: string;
}

/**
 * Logga un evento prodotto. Fire-and-forget.
 *
 * @param eventName Nome evento (dot.notation tipo "commesse.created")
 * @param categoryOrOpts Categoria stringa o options object completo
 * @param properties Properties opzionali (se categoria passata come stringa)
 */
export function trackEvent(
  eventName: string,
  categoryOrOpts?: EventCategory | TrackEventOptions,
  properties?: Record<string, unknown>,
): void {
  // Throttle anti-spam
  const now = Date.now();
  const last = recentEvents.get(eventName);
  if (last && now - last < THROTTLE_MS) {
    return;
  }
  recentEvents.set(eventName, now);

  // Normalizza args
  let category: EventCategory = "feature";
  let safeProperties: Record<string, unknown> = {};
  let companyIdOverride: string | undefined;

  if (typeof categoryOrOpts === "string") {
    category = categoryOrOpts;
    safeProperties = sanitizeProperties(properties);
  } else if (categoryOrOpts) {
    category = categoryOrOpts.category ?? "feature";
    safeProperties = sanitizeProperties(categoryOrOpts.properties);
    companyIdOverride = categoryOrOpts.companyId;
  }

  // Fire-and-forget
  void (async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) return;

      // Estrai company_id corrente dal profilo (cached via tanstack? ok keep semplice)
      let companyId = companyIdOverride;
      if (!companyId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sp = supabase as any;
        const { data: profile } = await sp
          .from("profiles")
          .select("company_id")
          .eq("id", user.id)
          .maybeSingle();
        companyId = profile?.company_id;
      }
      if (!companyId) return;  // utente senza company → skip

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sp = supabase as any;
      await sp.from("product_events").insert({
        company_id: companyId,
        user_id: user.id,
        event_name: eventName.slice(0, 100),
        category,
        properties: safeProperties,
        session_id: getSessionId(),
        user_agent: navigator.userAgent.slice(0, 250),
        page_url: window.location.pathname,
      });
    } catch (err) {
      // Fail-silent: tracking NON deve mai rompere l'UX
      logger.debug("[trackEvent] failed:", (err as Error).message);
    }
  })();
}

/** Versione "bulk" per batch eventi (es. import CSV → 1000 row processed). */
export function trackEventBulk(
  events: Array<{
    eventName: string;
    category?: EventCategory;
    properties?: Record<string, unknown>;
  }>,
  companyId?: string,
): void {
  if (events.length === 0) return;
  void (async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) return;

      let resolvedCompanyId = companyId;
      if (!resolvedCompanyId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sp = supabase as any;
        const { data: profile } = await sp
          .from("profiles").select("company_id").eq("id", user.id).maybeSingle();
        resolvedCompanyId = profile?.company_id;
      }
      if (!resolvedCompanyId) return;

      const sid = getSessionId();
      const ua = navigator.userAgent.slice(0, 250);
      const path = window.location.pathname;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sp = supabase as any;
      await sp.from("product_events").insert(
        events.map((e) => ({
          company_id: resolvedCompanyId,
          user_id: user.id,
          event_name: e.eventName.slice(0, 100),
          category: e.category ?? "feature",
          properties: sanitizeProperties(e.properties),
          session_id: sid,
          user_agent: ua,
          page_url: path,
        })),
      );
    } catch (err) {
      logger.debug("[trackEventBulk] failed:", (err as Error).message);
    }
  })();
}
