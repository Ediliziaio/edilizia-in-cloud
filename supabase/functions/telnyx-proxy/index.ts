import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { decrypt, encrypt, getEncryptionKey } from "../_shared/encryption.ts";
import { getCompanyBillingConfig } from "../_shared/billingConfig.ts";

import { corsHeaders, secureHeaders } from "../_shared/headers.ts";

const TELNYX_BASE = "https://api.telnyx.com/v2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth — accept both user token and service role key
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const isServiceCall = token === serviceRoleKey;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    let companyId: string | null = null;

    if (isServiceCall) {
      // Internal call from other edge functions — company_id must be in body
    } else {
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

    const body = await req.json();
    const { action, payload } = body;

    // For service calls, use company_id from body
    if (isServiceCall && body.company_id) {
      companyId = body.company_id;
    }

    const encKey = getEncryptionKey();

    // Handle save_settings before loading telnyx settings (chicken-egg)
    if (action === "save_settings") {
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
        await adminClient.from("telnyx_settings").update(upsertData).eq("id", payload.existing_id);
      } else {
        if (!upsertData.api_key_encrypted) {
          return json({ error: "API Key obbligatoria per la prima configurazione" }, 400);
        }
        await adminClient.from("telnyx_settings").insert(upsertData);
      }
      return json({ success: true });
    }

    // Load Telnyx settings for all other actions
    const { data: telnyxSettings } = await adminClient
      .from("telnyx_settings")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!telnyxSettings) {
      return json({ error: "Telnyx non configurato. Configurare le credenziali nelle impostazioni piattaforma." }, 500);
    }

    const apiKey = await decrypt(telnyxSettings.api_key_encrypted, encKey);
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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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
