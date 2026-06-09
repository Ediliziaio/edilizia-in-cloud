// supabase/functions/meta-capi-send-event/index.ts
//
// Server-side Conversions API per Meta — risolve la perdita di attribuzione
// post-iOS 14.5 / GDPR / ad blocker.
//
// CHIAMATA TIPICA:
//   • Da hook nel CRM EiC quando un lead viene creato / convertito / commessa chiusa
//   • Body: { company_id, event_name, event_id, event_time, user_data, custom_data }
//
// EVENTI SUPPORTATI:
//   • Lead          — al primo touch (lead creato dal Meta Lead Form o landing)
//   • Schedule      — quando si crea un'opportunità (qualificato)
//   • Purchase      — quando si chiude una commessa (con value = importo)
//
// HASHING:
//   Tutti i PII (email, telefono, nome, cap) vengono SHA256-ati prima di
//   essere inviati a Meta. Meta dedup automatic con il Pixel client-side
//   se l'event_id corrisponde.
//
// SICUREZZA:
//   • Service role bearer (chiamata interna dal worker EiC)
//   • Validazione company → pixel match
//   • Token CAPI cifrato in DB

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decrypt, getEncryptionKey } from "../_shared/encryption.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

const apiVersion = Deno.env.get("META_API_VERSION") || "v21.0";

interface CapiEventRequest {
  company_id: string;
  event_name: "Lead" | "Schedule" | "Purchase" | "CompleteRegistration" | "Contact";
  /** Unique ID per dedup con pixel client. UUID generato dal client al fbclid capture. */
  event_id: string;
  /** Unix timestamp seconds. Default: now. */
  event_time?: number;
  /** URL della pagina dove è avvenuto l'evento. */
  event_source_url?: string;
  /** Action source — website | crm | email | phone_call | physical_store | system_generated | other */
  action_source?: "website" | "crm" | "email" | "phone_call" | "physical_store" | "system_generated" | "other";
  /**
   * Codice "Eventi di test" di Events Manager: se presente, l'evento NON viene
   * conteggiato nei dati reali ma appare nella scheda "Eventi di test" → permette
   * di verificare la configurazione CAPI senza inquinare le metriche di campagna.
   */
  test_event_code?: string;
  /** PII utente — verranno hashati */
  user_data: {
    email?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
    zip?: string;
    city?: string;
    country?: string; // ISO 3166-1 alpha-2 (es. "it")
    /** ID univoco interno (es. contact.id CRM) — alza il match quality. */
    external_id?: string;
    fbc?: string; // _fbc cookie (es. "fb.1.1554763741205.AbCdEfGhIjKlMnOp")
    fbp?: string; // _fbp cookie
    client_ip_address?: string;
    client_user_agent?: string;
    /** Lead ID Meta originale (se evento da Lead Form) */
    lead_id?: string;
  };
  /** Custom data (varia per evento) */
  custom_data?: {
    /** Per Purchase */
    value?: number;
    currency?: string;
    /** Tipo intervento (per attribuzione semantica) */
    content_category?: string;
    content_name?: string;
    content_ids?: string[];
  };
}

interface CapiResponse {
  success: boolean;
  events_received?: number;
  fbtrace_id?: string;
  error?: string;
  detail?: string;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, corsHeaders);

  try {
    // AUTH: service role richiesto (chiamata interna)
    const authHeader = req.headers.get("Authorization");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (authHeader !== `Bearer ${serviceKey}`) {
      // Permetti anche user bearer ma solo per evento "self" (es. da frontend tracker)
      // Per ora: solo service role
      return json({ error: "service_role_required" }, 401, corsHeaders);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, serviceKey);

    let body: CapiEventRequest;
    try {
      body = (await req.json()) as CapiEventRequest;
    } catch {
      return json({ error: "invalid_json" }, 400, corsHeaders);
    }

    if (!body.company_id || !body.event_name || !body.event_id || !body.user_data) {
      return json({ error: "missing_required_fields" }, 400, corsHeaders);
    }

    // LOAD PIXEL + TOKEN
    const { data: pixel, error: pixelErr } = await admin
      .from("meta_conversion_pixel")
      .select("pixel_id, capi_token_encrypted, is_active")
      .eq("company_id", body.company_id)
      .eq("is_active", true)
      .maybeSingle();

    if (pixelErr || !pixel?.capi_token_encrypted) {
      return json({
        error: "pixel_not_configured",
        detail: "Configura pixel + CAPI token in /azienda/impostazioni/integrations/meta",
      }, 400, corsHeaders);
    }

    const encKey = await getEncryptionKey();
    const capiToken = await decrypt(pixel.capi_token_encrypted, encKey);

    // HASH PII
    const hashedUserData: Record<string, string | string[]> = {};

    if (body.user_data.email) {
      hashedUserData.em = await sha256Hex(body.user_data.email.trim().toLowerCase());
    }
    if (body.user_data.phone) {
      // Telefono in E.164 (cifre + country code, senza '+'): senza prefisso
      // paese Meta NON fa match. In Italia i numeri salvati spesso non hanno il
      // 39 → lo aggiungiamo prima dell'hash.
      const e164 = normalizePhoneE164(body.user_data.phone);
      if (e164) hashedUserData.ph = await sha256Hex(e164);
    }
    if (body.user_data.first_name) {
      hashedUserData.fn = await sha256Hex(normalizeName(body.user_data.first_name));
    }
    if (body.user_data.last_name) {
      hashedUserData.ln = await sha256Hex(normalizeName(body.user_data.last_name));
    }
    if (body.user_data.zip) {
      // CAP: solo cifre/lettere, no spazi.
      hashedUserData.zp = await sha256Hex(body.user_data.zip.replace(/\s+/g, "").toLowerCase());
    }
    if (body.user_data.city) {
      // City: lowercase, senza spazi/punteggiatura (richiesto da Meta).
      hashedUserData.ct = await sha256Hex(normalizeName(body.user_data.city).replace(/\s+/g, ""));
    }
    if (body.user_data.country) {
      // Country ISO alpha-2 lowercase (es. "it").
      hashedUserData.country = await sha256Hex(body.user_data.country.trim().toLowerCase().slice(0, 2));
    }
    if (body.user_data.external_id) {
      // external_id: hashato per coerenza (Meta lo accetta hashed o plain).
      hashedUserData.external_id = await sha256Hex(body.user_data.external_id.trim().toLowerCase());
    }
    // Cookie e network info NON vanno hashati
    if (body.user_data.fbc) hashedUserData.fbc = body.user_data.fbc;
    if (body.user_data.fbp) hashedUserData.fbp = body.user_data.fbp;
    if (body.user_data.client_ip_address) hashedUserData.client_ip_address = body.user_data.client_ip_address;
    if (body.user_data.client_user_agent) hashedUserData.client_user_agent = body.user_data.client_user_agent;
    if (body.user_data.lead_id) hashedUserData.lead_id = body.user_data.lead_id;

    // BUILD EVENT
    const event: Record<string, unknown> = {
      event_name: body.event_name,
      event_time: body.event_time ?? Math.floor(Date.now() / 1000),
      event_id: body.event_id,
      action_source: body.action_source ?? "crm",
      user_data: hashedUserData,
    };
    if (body.event_source_url) event.event_source_url = body.event_source_url;
    if (body.custom_data) {
      const customData: Record<string, unknown> = { ...body.custom_data };
      if (customData.value != null && !customData.currency) {
        customData.currency = "EUR";
      }
      event.custom_data = customData;
    }

    // SEND
    const url = `https://graph.facebook.com/${apiVersion}/${pixel.pixel_id}/events`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [event],
        access_token: capiToken,
        // test_event_code → evento in "Eventi di test", non nei dati reali.
        ...(body.test_event_code ? { test_event_code: body.test_event_code } : {}),
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("[meta-capi-send-event] meta_api_error", text);
      return json({
        success: false,
        error: "meta_api_error",
        detail: text.substring(0, 500),
      }, 502, corsHeaders);
    }

    const result = await resp.json() as { events_received?: number; fbtrace_id?: string };

    // events_received === 0 = Meta ha accettato la richiesta ma scartato l'evento
    // (es. pixel disattivato/non valido): NON è un vero successo.
    const accepted = (result.events_received ?? 0) > 0;

    // Update pixel stats solo sugli eventi REALI (non i test).
    if (accepted && !body.test_event_code) {
      await admin
        .from("meta_conversion_pixel")
        .update({ last_event_at: new Date().toISOString() })
        .eq("company_id", body.company_id);
    }

    const out: CapiResponse = {
      success: accepted,
      events_received: result.events_received,
      fbtrace_id: result.fbtrace_id,
      ...(accepted ? {} : { error: "no_events_received", detail: "Meta ha accettato la richiesta ma 0 eventi processati (pixel non valido o disattivo)." }),
    };
    return json(out, accepted ? 200 : 502, corsHeaders);
  } catch (e) {
    console.error("[meta-capi-send-event] uncaught", e);
    return json({ error: "internal_error", detail: String(e) }, 500, corsHeaders);
  }
});

/** SHA-256 hex della stringa COSÌ COM'È (la normalizzazione va fatta a monte). */
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Normalizza nome/cognome/città: trim, lowercase (Meta confronta lowercase). */
function normalizeName(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Normalizza un telefono a formato E.164 in sole cifre (senza '+'), così come
 * richiesto da Meta CAPI. Gestisce numeri italiani salvati senza prefisso paese.
 * - "+39 320 123 4567" → "393201234567"
 * - "320 1234567"      → "393201234567"  (mobile IT → +39)
 * - "06 1234567"       → "39061234567"   (fisso IT → +39, 0 mantenuto)
 * - "0039 320..."      → "39320..."      (prefisso internazionale 00)
 * - numeri esteri già con country code (es. +33...) vengono lasciati intatti.
 */
function normalizePhoneE164(raw: string): string {
  const hadPlus = raw.trim().startsWith("+");
  let d = raw.replace(/[^0-9]/g, "");
  if (!d) return "";
  if (d.startsWith("00")) return d.slice(2);            // prefisso internazionale 00XX
  if (hadPlus) return d;                                 // già E.164 (+XX...)
  if (d.startsWith("39") && d.length >= 11) return d;    // già con country code IT
  if (d.startsWith("3") && d.length >= 9 && d.length <= 11) return "39" + d; // mobile IT
  if (d.startsWith("0")) return "39" + d;               // fisso IT nazionale
  return d.length >= 11 ? d : "39" + d;                 // fallback: lungo=estero, corto=IT
}

function json(payload: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
