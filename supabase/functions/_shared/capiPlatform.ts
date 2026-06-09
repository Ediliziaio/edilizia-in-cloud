// capiPlatform — Conversions API verso il PIXEL DI PIATTAFORMA di EiC
// (NON i pixel per-cliente di meta_conversion_pixel).
//
// Serve a tracciare gli eventi in-app del funnel di EiC (Subscribe = "abbonato",
// Purchase, StartTrial) per costruire Custom Audience di remarketing in Ads
// Manager (upsell, win-back, esclusione abbonati dalle campagne di acquisizione).
//
// Gli eventi in-app NON usano il Pixel browser (l'app loggata è privata): si
// inviano server-side via CAPI con l'email dell'utente (hashata) → Meta la
// matcha al profilo. Per utenti loggati il match via email è più affidabile.
//
// Config (secret edge function):
//   EIC_CAPI_PIXEL_TOKEN = CAPI access token del pixel EiC (Events Manager → Conversions API)
//   EIC_CAPI_PIXEL_ID    = (opzionale) override dell'id pixel; default 1813311922204796
//   EIC_CAPI_TEST_CODE   = (opzionale) test_event_code per verificare in "Eventi di test"
//
// Se manca il TOKEN → NO-OP silenzioso: l'integrazione resta spenta finché non
// si configura il secret, senza mai rompere il chiamante (es. webhook Stripe).

const API_VERSION = "v21.0";
const DEFAULT_PIXEL_ID = "1813311922204796";

export type PlatformCapiEvent =
  | "Subscribe"
  | "Purchase"
  | "StartTrial"
  | "Lead"
  | "CompleteRegistration";

export interface PlatformUserData {
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  /** Identificatore interno (es. company_id) — alza il match quality. */
  external_id?: string;
}

export interface PlatformCustomData {
  value?: number;
  currency?: string;
  content_name?: string;
  content_category?: string;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Telefono in E.164 (cifre + country code, senza '+'); default Italia (+39). */
function normalizePhoneE164(raw: string): string {
  const hadPlus = raw.trim().startsWith("+");
  let d = raw.replace(/[^0-9]/g, "");
  if (!d) return "";
  if (d.startsWith("00")) return d.slice(2);
  if (hadPlus) return d;
  if (d.startsWith("39") && d.length >= 11) return d;
  if (d.startsWith("3") && d.length >= 9 && d.length <= 11) return "39" + d;
  if (d.startsWith("0")) return "39" + d;
  return d.length >= 11 ? d : "39" + d;
}

/**
 * Invia un evento standard del funnel EiC al pixel di piattaforma via CAPI.
 * Best-effort: ritorna SEMPRE senza sollevare eccezioni. No-op se il token
 * non è configurato.
 */
export async function sendPlatformCapiEvent(
  eventName: PlatformCapiEvent,
  userData: PlatformUserData,
  customData?: PlatformCustomData,
  eventId?: string,
): Promise<{ sent: boolean; reason?: string }> {
  try {
    const token = Deno.env.get("EIC_CAPI_PIXEL_TOKEN") ?? "";
    const pixelId = Deno.env.get("EIC_CAPI_PIXEL_ID") || DEFAULT_PIXEL_ID;
    const testCode = Deno.env.get("EIC_CAPI_TEST_CODE") ?? "";
    if (!token) return { sent: false, reason: "platform_capi_token_missing" };

    const ud: Record<string, string> = {};
    if (userData.email) ud.em = await sha256Hex(userData.email.trim().toLowerCase());
    if (userData.phone) {
      const e164 = normalizePhoneE164(userData.phone);
      if (e164) ud.ph = await sha256Hex(e164);
    }
    if (userData.first_name) ud.fn = await sha256Hex(userData.first_name.trim().toLowerCase());
    if (userData.last_name) ud.ln = await sha256Hex(userData.last_name.trim().toLowerCase());
    if (userData.external_id) ud.external_id = await sha256Hex(userData.external_id.trim().toLowerCase());

    const event: Record<string, unknown> = {
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      action_source: "system_generated",
      user_data: ud,
    };
    if (eventId) event.event_id = eventId;
    if (customData) {
      const cd: Record<string, unknown> = { ...customData };
      if (cd.value != null && !cd.currency) cd.currency = "EUR";
      event.custom_data = cd;
    }

    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${pixelId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [event],
        access_token: token,
        ...(testCode ? { test_event_code: testCode } : {}),
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.warn(JSON.stringify({
        level: "warn", fn: "capiPlatform", msg: "meta_api_error",
        event: eventName, detail: txt.slice(0, 300),
      }));
      return { sent: false, reason: "meta_api_error" };
    }
    return { sent: true };
  } catch (e) {
    console.warn(JSON.stringify({
      level: "warn", fn: "capiPlatform", msg: "exception",
      error: (e as Error)?.message,
    }));
    return { sent: false, reason: "exception" };
  }
}
