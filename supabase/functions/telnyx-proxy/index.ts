import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { decrypt, encrypt, getEncryptionKey } from "../_shared/encryption.ts";
import { getCompanyBillingConfig } from "../_shared/billingConfig.ts";

import { getCorsHeaders } from "../_shared/headers.ts";

import { serveConMetriche } from "../_shared/withMetrics.ts";
const TELNYX_BASE = "https://api.telnyx.com/v2";

/** Confronto timing-safe per stringhe (prevenzione timing attack su secret) */
function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

serveConMetriche("telnyx-proxy", async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    let isServiceCall = false;
    let companyId: string | null = null;

    // SEC-015: verifica autenticazione in ordine di preferenza
    const cronSecret = Deno.env.get("INTERNAL_CRON_SECRET");
    const requestCronSecret = req.headers.get("x-cron-secret");

    if (requestCronSecret !== null) {
      // 1) Service call via INTERNAL_CRON_SECRET (metodo preferito)
      if (!cronSecret || !timingSafeEqual(requestCronSecret, cronSecret)) {
        return json({ error: "Unauthorized" }, 401);
      }
      isServiceCall = true;
    } else {
      // 2) Bearer token: JWT utente oppure service role key (backward compat)
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return json({ error: "Unauthorized" }, 401);
      }

      const token = authHeader.replace("Bearer ", "");

      // Backward compat: service role key come Bearer (timing-safe)
      if (timingSafeEqual(token, serviceRoleKey)) {
        isServiceCall = true;
      } else {
        // JWT utente normale
        const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: { user }, error: userErr } = await userClient.auth.getUser();
        if (userErr || !user) return json({ error: "Unauthorized" }, 401);

        const { data: profile } = await adminClient
          .from("profiles")
          .select("company_id")
          .eq("id", user.id)
          .single();

        companyId = profile?.company_id;
        if (!companyId) return json({ error: "Nessuna azienda associata" }, 403);
      }
    }

    const body = await req.json();
    const { action, payload } = body;

    // Per service call il company_id arriva nel body
    if (isServiceCall && body.company_id) {
      companyId = body.company_id;
    }

    const encKey = getEncryptionKey();

    // Handle save_settings before loading telnyx settings (chicken-egg)
    if (action === "save_settings") {
      // SICUREZZA: solo super_admin può sovrascrivere le credenziali Telnyx
      // platform-wide. Prima mancava il check → qualunque utente autenticato
      // poteva ribaltare le chiavi della piattaforma.
      if (!isServiceCall) {
        // Serve user.id per verificare il ruolo
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
        const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: { user } } = await userClient.auth.getUser();
        if (!user) return json({ error: "Unauthorized" }, 401);
        const { data: roleRow } = await adminClient
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "super_admin")
          .maybeSingle();
        if (!roleRow) {
          return json({ error: "Solo super_admin può modificare le impostazioni Telnyx" }, 403);
        }
      }

      const upsertData: Record<string, unknown> = {
        messaging_profile_id: payload.messaging_profile_id || null,
        connection_id: payload.connection_id || null,
        is_active: payload.is_active ?? true,
        updated_at: new Date().toISOString(),
      };
      if (payload.api_key) {
        upsertData.api_key_encrypted = await encrypt(payload.api_key, encKey);
      }
      if (payload.webhook_signing_secret) {
        upsertData.webhook_signing_secret_encrypted = await encrypt(payload.webhook_signing_secret, encKey);
      }

      if (payload.existing_id) {
        const { error: updErr } = await adminClient
          .from("telnyx_settings")
          .update(upsertData)
          .eq("id", payload.existing_id);
        if (updErr) return json({ error: `Update Telnyx: ${updErr.message}` }, 500);
      } else {
        if (!upsertData.api_key_encrypted) {
          return json({ error: "API Key obbligatoria per la prima configurazione" }, 400);
        }
        const { error: insErr } = await adminClient.from("telnyx_settings").insert(upsertData);
        if (insErr) return json({ error: `Insert Telnyx: ${insErr.message}` }, 500);
      }
      return json({ success: true });
    }

    // Load Telnyx settings (tabella). Fallback ai secret di ambiente quando la
    // tabella non è popolata: stessa identità Telnyx usata dalle funzioni SMS,
    // così l'acquisto/ricerca numeri funziona anche senza riga in telnyx_settings.
    const { data: tableSettings } = await adminClient
      .from("telnyx_settings")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    const envApiKey = Deno.env.get("TELNYX_API_KEY") ?? "";
    const telnyxSettings = tableSettings ?? (envApiKey ? {
      api_key_encrypted: null as string | null,
      messaging_profile_id: Deno.env.get("TELNYX_MESSAGING_PROFILE_ID") ?? null,
      connection_id: Deno.env.get("TELNYX_WEBRTC_CONNECTION_ID") ?? null,
    } : null);

    if (!telnyxSettings) {
      return json({ error: "Telnyx non configurato. Configurare le credenziali nelle impostazioni piattaforma o il secret TELNYX_API_KEY." }, 500);
    }

    const apiKey = telnyxSettings.api_key_encrypted
      ? await decrypt(telnyxSettings.api_key_encrypted, encKey)
      : envApiKey;
    if (!apiKey) return json({ error: "Chiave API Telnyx non valida" }, 500);

    let result: unknown;

    switch (action) {
      case "list_available_numbers": {
        const country = payload?.country_code || "IT";
        const prefix = payload?.prefix || "";
        const limit = payload?.limit || 20;

        const params = new URLSearchParams({
          "filter[country_code]": country,
          "filter[limit]": String(limit),
          "filter[features][]": "sms",
        });
        if (prefix) params.set("filter[national_destination_code]", prefix);

        const res = await telnyxFetch(`/available_phone_numbers?${params}`, "GET", apiKey);
        result = { numbers: res?.data || [] };
        break;
      }

      case "buy_number": {
        if (!payload?.phone_number) throw new Error("phone_number richiesto");

        // ── GATE NORMATIVO (server-side, non aggirabile dalla UI) ──
        // Un'azienda può acquistare un numero SOLO se i suoi dati normativi sono
        // APPROVATI: così la titolarità/responsabilità è sua. Le service-call
        // interne (automazioni) restano consentite.
        if (!isServiceCall && companyId) {
          const { data: comp } = await adminClient
            .from("company_telephony_compliance")
            .select("stato")
            .eq("company_id", companyId)
            .maybeSingle();
          if (comp?.stato !== "approvato") {
            return json({
              error: "Acquisto bloccato: i Dati normativi dell'azienda non sono ancora approvati. Completali in Impostazioni → Telefonia.",
            }, 403);
          }
        }

        const orderBody: Record<string, unknown> = {
          phone_numbers: [{ phone_number: payload.phone_number }],
        };
        if (telnyxSettings.messaging_profile_id) {
          orderBody.messaging_profile_id = telnyxSettings.messaging_profile_id;
        }
        if (telnyxSettings.connection_id) {
          orderBody.connection_id = telnyxSettings.connection_id;
        }

        const res = await telnyxFetch("/number_orders", "POST", apiKey, orderBody);

        // Save to ai_agent_phone_numbers if agent_id provided
        if (payload.agent_id && companyId) {
          await adminClient.from("ai_agent_phone_numbers").insert({
            agent_id: payload.agent_id,
            company_id: companyId,
            phone_number: payload.phone_number,
            provider: "telnyx",
            telnyx_phone_id: res?.data?.phone_numbers?.[0]?.id || null,
            monthly_cost_eur: payload.monthly_cost || 0,
            label: payload.label || null,
            telnyx_connection_id: telnyxSettings.connection_id || null,
          });
        }

        result = { order: res?.data, phone_number: payload.phone_number };
        break;
      }

      case "list_numbers": {
        const params = new URLSearchParams({ "page[size]": "100" });
        const res = await telnyxFetch(`/phone_numbers?${params}`, "GET", apiKey);
        result = { numbers: res?.data || [] };
        break;
      }

      case "release_number": {
        if (!payload?.phone_number_id) throw new Error("phone_number_id richiesto");
        await telnyxFetch(`/phone_numbers/${payload.phone_number_id}`, "DELETE", apiKey);

        // Remove from local DB
        if (payload.phone_number_id) {
          await adminClient
            .from("ai_agent_phone_numbers")
            .delete()
            .eq("telnyx_phone_id", payload.phone_number_id);
        }

        result = { success: true };
        break;
      }

      case "send_sms": {
        if (!payload?.to || !payload?.body) throw new Error("to e body richiesti");

        // Check billing override for SMS
        if (companyId) {
          const smsBilling = await getCompanyBillingConfig(adminClient, companyId, "sms");
          if (!smsBilling.isEnabled) {
            return json({ error: "Servizio SMS disabilitato per questa azienda" }, 403);
          }
        }

        const from = payload.from || null;

        // If no from number, find a company number
        let fromNumber = from;
        if (!fromNumber && companyId) {
          const { data: phoneNum } = await adminClient
            .from("ai_agent_phone_numbers")
            .select("phone_number")
            .eq("company_id", companyId)
            .eq("provider", "telnyx")
            .limit(1)
            .maybeSingle();
          fromNumber = phoneNum?.phone_number;
        }

        if (!fromNumber) throw new Error("Nessun numero mittente disponibile");

        const smsBody: Record<string, unknown> = {
          from: fromNumber,
          to: payload.to.replace(/[^0-9+]/g, ""),
          text: payload.body,
          type: "SMS",
        };
        if (telnyxSettings.messaging_profile_id) {
          smsBody.messaging_profile_id = telnyxSettings.messaging_profile_id;
        }

        const res = await telnyxFetch("/messages", "POST", apiKey, smsBody);

        // Log in sms_logs
        if (companyId) {
          await adminClient.from("sms_logs").insert({
            company_id: companyId,
            contact_id: payload.contact_id || null,
            direction: "outbound",
            from_number: fromNumber,
            to_number: payload.to,
            body: payload.body,
            status: "queued",
            telnyx_message_id: res?.data?.id || null,
            automation_id: payload.automation_id || null,
          });
        }

        result = { success: true, message_id: res?.data?.id };
        break;
      }

      case "get_sms_status": {
        if (!payload?.message_id) throw new Error("message_id richiesto");
        const res = await telnyxFetch(`/messages/${payload.message_id}`, "GET", apiKey);
        result = res?.data || {};
        break;
      }

      default:
        return json({ error: `Azione non supportata: ${action}` }, 400);
    }

    return json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Errore interno";
    console.error("telnyx-proxy error:", message);
    return json({ error: message }, 500);
  }
});

// --- Helpers ---

async function telnyxFetch(path: string, method: string, apiKey: string, body?: unknown) {
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  };
  if (body && method !== "GET") opts.body = JSON.stringify(body);

  const res = await fetch(`${TELNYX_BASE}${path}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telnyx API error ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}
