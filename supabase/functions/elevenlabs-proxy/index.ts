import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";

import { corsHeaders, secureHeaders } from "../_shared/headers.ts";

const EL_BASE = "https://api.elevenlabs.io/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const userId = user.id;

    // Get user's company_id
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile } = await adminClient
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    const companyId = profile?.company_id;
    if (!companyId) {
      return json({ error: "Nessuna azienda associata" }, 403);
    }

    // --- Get API key from platform_settings first, then env fallback ---
    const apiKey = await getPlatformSetting("elevenlabs_api_key", "ELEVENLABS_API_KEY");
    if (!apiKey) {
      return json({ error: "Chiave API ElevenLabs non configurata. Contattare l'amministratore." }, 500);
    }

    // --- Parse request ---
    const body = await req.json();
    const { action, agent_id, payload } = body;

    let result: unknown;

    switch (action) {
      case "create_agent": {
        const elRes = await elFetch("/convai/agents/create", "POST", apiKey, {
          conversation_config: {
            agent: {
              prompt: {
                prompt: payload?.system_prompt || "",
              },
              first_message: payload?.first_message || "",
              language: payload?.language || "it",
            },
            tts: {
              voice_id: payload?.voice_id || "JBFqnCBsd6RMkjVDRZzb",
            },
          },
          name: payload?.name || "Nuovo Agente",
        });

        const elAgentId = elRes?.agent_id;

        const { data: newAgent, error: insertErr } = await adminClient
          .from("ai_agents")
          .insert({
            company_id: companyId,
            elevenlabs_agent_id: elAgentId || null,
            name: payload?.name || "Nuovo Agente",
            system_prompt: payload?.system_prompt || "",
            first_message: payload?.first_message || "",
            voice_id: payload?.voice_id || "JBFqnCBsd6RMkjVDRZzb",
            llm_model: payload?.llm_model || "gemini-2.5-flash",
            language: payload?.language || "it",
            created_by: userId,
          })
          .select("id")
          .single();

        if (insertErr) throw insertErr;

        await auditLog(adminClient, companyId, newAgent?.id, userId, "create_agent", { name: payload?.name });

        result = { agent_id: newAgent?.id, elevenlabs_agent_id: elAgentId };
        break;
      }

      case "update_agent": {
        if (!agent_id) throw new Error("agent_id richiesto");
        const updateBody: Record<string, unknown> = {};
        if (payload?.system_prompt !== undefined) {
          updateBody.conversation_config = {
            agent: { prompt: { prompt: payload.system_prompt } },
          };
        }
        if (payload?.first_message !== undefined) {
          if (!updateBody.conversation_config) updateBody.conversation_config = { agent: {} };
          (updateBody.conversation_config as Record<string, unknown>).agent = {
            ...((updateBody.conversation_config as Record<string, unknown>).agent as Record<string, unknown> || {}),
            first_message: payload.first_message,
          };
        }
        if (payload?.voice_id !== undefined) {
          if (!updateBody.conversation_config) updateBody.conversation_config = {};
          (updateBody.conversation_config as Record<string, unknown>).tts = { voice_id: payload.voice_id };
        }
        if (payload?.name !== undefined) updateBody.name = payload.name;

        try {
          await elFetch(`/convai/agents/${agent_id}`, "PATCH", apiKey, updateBody);
        } catch {
          // ElevenLabs may not have this agent — continue with local update
        }

        await auditLog(adminClient, companyId, null, userId, "update_agent", { agent_id, changes: Object.keys(payload || {}) });
        result = { success: true };
        break;
      }

      case "delete_agent": {
        if (!agent_id) throw new Error("agent_id richiesto");
        try {
          await elFetch(`/convai/agents/${agent_id}`, "DELETE", apiKey);
        } catch {
          // May already be deleted
        }
        await auditLog(adminClient, companyId, null, userId, "delete_agent", { agent_id });
        result = { success: true };
        break;
      }

      case "get_voices": {
        const voices = await elFetch("/voices", "GET", apiKey);
        result = voices;
        break;
      }

      case "get_models": {
        const models = await elFetch("/models", "GET", apiKey);
        result = models;
        break;
      }

      // --- KB Sync Actions (FIX 8) ---
      case "add_kb_doc": {
        if (!agent_id) throw new Error("agent_id richiesto");
        const docResult = await elFetch(`/convai/agents/${agent_id}/add-to-knowledge-base`, "POST", apiKey, {
          url: payload?.source_url,
          name: payload?.name,
        });
        result = { elevenlabs_doc_id: docResult?.id || null };
        break;
      }

      case "remove_kb_doc": {
        if (!agent_id || !payload?.doc_id) throw new Error("agent_id e doc_id richiesti");
        try {
          await elFetch(`/convai/agents/${agent_id}/remove-from-knowledge-base`, "POST", apiKey, {
            document_id: payload.doc_id,
          });
        } catch {
          // Doc may not exist on EL side
        }
        result = { success: true };
        break;
      }

      case "list_kb_docs": {
        if (!agent_id) throw new Error("agent_id richiesto");
        try {
          const docs = await elFetch(`/convai/agents/${agent_id}/knowledge-base`, "GET", apiKey);
          result = docs;
        } catch {
          result = { documents: [] };
        }
        break;
      }

      case "sync_kb": {
        // Sync local docs to EL — just returns current EL docs for comparison
        if (!agent_id) throw new Error("agent_id richiesto");
        try {
          const elDocs = await elFetch(`/convai/agents/${agent_id}/knowledge-base`, "GET", apiKey);
          result = { elevenlabs_docs: elDocs?.documents || [] };
        } catch {
          result = { elevenlabs_docs: [] };
        }
        break;
      }

      case "link_phone_number": {
        if (!agent_id) throw new Error("agent_id richiesto (elevenlabs_agent_id)");
        if (!payload?.phone_number) throw new Error("phone_number richiesto");

        // Get Telnyx settings for API key and connection_id
        const { data: telnyxSettings } = await adminClient
          .from("telnyx_settings")
          .select("api_key_encrypted, connection_id")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();

        if (!telnyxSettings?.api_key_encrypted) {
          throw new Error("Telnyx non configurato");
        }

        const { decrypt: decryptFn, getEncryptionKey: getKey } = await import("../_shared/encryption.ts");
        const telnyxApiKey = await decryptFn(telnyxSettings.api_key_encrypted, getKey());

        const linkBody: Record<string, unknown> = {
          phone_number: payload.phone_number,
          provider: "telnyx",
          telnyx_api_key: telnyxApiKey,
        };
        if (telnyxSettings.connection_id) {
          linkBody.telnyx_connection_id = telnyxSettings.connection_id;
        }

        const linkRes = await elFetch("/convai/phone-numbers/create", "POST", apiKey, linkBody);
        const elPhoneNumberId = linkRes?.phone_number_id || linkRes?.id;

        // Update local DB record
        if (elPhoneNumberId && payload.local_phone_id) {
          await adminClient
            .from("ai_agent_phone_numbers")
            .update({ elevenlabs_phone_number_id: elPhoneNumberId })
            .eq("id", payload.local_phone_id);
        }

        await auditLog(adminClient, companyId, null, userId, "link_phone_number", {
          phone_number: payload.phone_number,
          elevenlabs_phone_number_id: elPhoneNumberId,
        });

        result = { success: true, elevenlabs_phone_number_id: elPhoneNumberId };
        break;
      }

      default:
        return json({ error: `Azione non supportata: ${action}` }, 400);
    }

    return json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Errore interno";
    console.error("elevenlabs-proxy error:", message);
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

async function elFetch(path: string, method: string, apiKey: string, body?: unknown) {
  const opts: RequestInit = {
    method,
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
  };
  if (body && method !== "GET") opts.body = JSON.stringify(body);

  const res = await fetch(`${EL_BASE}${path}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ElevenLabs API error ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function auditLog(
  client: ReturnType<typeof createClient>,
  companyId: string,
  agentId: string | null,
  userId: string,
  action: string,
  details: Record<string, unknown>
) {
  await client.from("ai_agent_audit_log").insert({
    company_id: companyId,
    agent_id: agentId,
    user_id: userId,
    action,
    details,
  });
}
