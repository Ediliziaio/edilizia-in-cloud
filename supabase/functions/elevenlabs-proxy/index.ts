import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";

import { getCorsHeaders } from "../_shared/headers.ts";

const EL_BASE = "https://api.elevenlabs.io/v1";

// ── FIX BUG #1 — Voce italiana di default ──────────────────────────────────
// "JBFqnCBsd6RMkjVDRZzb" (George) è una voce inglese monolingua: produce output
// in inglese anche con testo italiano. Usare always eleven_multilingual_v2.
// Rachel (21m00Tcm4TlvDq8ikWAM) supporta italiano nativo con multilingual_v2.
const DEFAULT_ITALIAN_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_TTS_MODEL = "eleven_multilingual_v2";

// ── FIX BUG #2 — Tool builder inline (non può importare da src/) ─────────────
// Converte tools_config (JSONB dal DB) nel formato array richiesto da ElevenLabs ConvAI.

interface ToolsConfigEdiliziaTool { enabled: boolean; webhook_url: string }
interface ToolsConfig {
  system_tools?: Record<string, boolean>;
  custom_tools?: Array<{ id: string; name: string; description: string }>;
  edilizia_tools?: Record<string, ToolsConfigEdiliziaTool>;
}

const SYSTEM_TOOL_MAP: Record<string, string> = {
  end_conversation: "end_call",
  detect_language: "language_detection",
  skip_turn: "skip_turn",
  transfer_agent: "transfer_to_agent",
  transfer_number: "transfer_call",
  play_dtmf: "play_dtmf",
  voicemail_detection: "voicemail_detection",
};

const EDILIZIA_TOOL_DESCRIPTIONS: Record<string, string> = {
  get_lead_info: "Recupera i dati di un contatto/lead dal CRM di Edilizia in Cloud. Usa quando il chiamante chiede informazioni su un cliente esistente.",
  create_appointment: "Crea un nuovo appuntamento nel calendario aziendale. Usa quando il chiamante vuole fissare un appuntamento, visita in cantiere o consulenza.",
  search_products: "Cerca prodotti o materiali nel catalogo aziendale. Usa per informazioni su disponibilità, prezzi o caratteristiche.",
  get_availability: "Verifica la disponibilità di slot liberi nel calendario. Usa prima di creare un appuntamento.",
  assign_to_user: "Assegna un contatto o lead a un membro del team. Usa per smistare il contatto all'ufficio competente.",
};

function buildElevenLabsToolsFromConfig(toolsConfig: ToolsConfig | null | undefined): unknown[] {
  if (!toolsConfig) return [];
  const tools: unknown[] = [];

  // Tool di sistema
  if (toolsConfig.system_tools) {
    for (const [id, enabled] of Object.entries(toolsConfig.system_tools)) {
      if (!enabled) continue;
      const elName = SYSTEM_TOOL_MAP[id];
      if (elName) tools.push({ type: "system", name: elName });
    }
  }

  // Tool Edilizia in Cloud (webhook)
  if (toolsConfig.edilizia_tools) {
    for (const [id, cfg] of Object.entries(toolsConfig.edilizia_tools)) {
      if (!cfg.enabled || !cfg.webhook_url) continue;
      tools.push({
        type: "webhook",
        name: id,
        description: EDILIZIA_TOOL_DESCRIPTIONS[id] ?? `Strumento ${id} di Edilizia in Cloud`,
        url: cfg.webhook_url,
        method: "POST",
        response_timeout_secs: 20,
        headers: [{ key: "Content-Type", value: "application/json" }],
      });
    }
  }

  return tools;
}

Deno.serve(async (req) => {
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

    const callerIsSuperAdmin = await isSuperAdmin(adminClient, userId);

    // Rate limit expensive AI operations: max 30 calls per minute per company
    const expensiveActions = [
      "create_agent",
      "update_agent",
      "delete_agent",
      "get_conversations",
      "get_conversation",
      "get_conversation_audio",
    ];
    if (expensiveActions.includes(action)) {
      const rl = await checkRateLimit({
        functionName: "elevenlabs-proxy",
        callerId: companyId,
        maxCalls: 30,
        windowSeconds: 60,
      });
      if (!rl.allowed) {
        return rateLimitResponse(rl.retryAfterSeconds ?? 60, getCorsHeaders(req));
      }
    }

    let result: unknown;

    switch (action) {
      case "create_agent": {
        // FIX BUG #1: usa voce italiana di default e modello multilingual
        const voiceId = payload?.voice_id || DEFAULT_ITALIAN_VOICE_ID;

        // FIX BUG #2: converti tools_config in tool definitions ElevenLabs
        const elTools = buildElevenLabsToolsFromConfig(
          payload?.tools_config as ToolsConfig | null | undefined
        );

        const createBody: Record<string, unknown> = {
          conversation_config: {
            agent: {
              prompt: { prompt: payload?.system_prompt || "" },
              first_message: payload?.first_message || "",
              language: payload?.language || "it",
              ...(elTools.length > 0 ? { tools: elTools } : {}),
            },
            tts: {
              voice_id: voiceId,
              model_id: DEFAULT_TTS_MODEL, // eleven_multilingual_v2 — supporta italiano
            },
          },
          name: payload?.name || "Nuovo Agente",
        };

        const elRes = await elFetch("/convai/agents/create", "POST", apiKey, createBody);

        const elAgentId = elRes?.agent_id;

        const { data: newAgent, error: insertErr } = await adminClient
          .from("ai_agents")
          .insert({
            company_id: companyId,
            elevenlabs_agent_id: elAgentId || null,
            name: payload?.name || "Nuovo Agente",
            system_prompt: payload?.system_prompt || "",
            first_message: payload?.first_message || "",
            voice_id: voiceId, // FIX BUG #1: salva la voce italiana scelta
            llm_model: payload?.llm_model || "gemini-2.5-flash",
            language: payload?.language || "it",
            created_by: userId,
            ...(payload?.tools_config ? { tools_config: payload.tools_config } : {}),
          })
          .select("id")
          .single();

        if (insertErr) {
          // ROLLBACK: se l'insert DB fallisce, elimina l'agente appena creato su ElevenLabs
          // per non lasciare orfani remoti che continuano a consumare crediti.
          if (elAgentId) {
            try {
              await elFetch(`/convai/agents/${elAgentId}`, "DELETE", apiKey);
              console.log(`[PROXY] Rollback ElevenLabs agent ${elAgentId} dopo fallimento DB`);
            } catch (rbErr) {
              console.error(`[PROXY] Rollback ElevenLabs fallito per ${elAgentId}:`, rbErr);
            }
          }
          throw insertErr;
        }

        await auditLog(adminClient, companyId, newAgent?.id, userId, "create_agent", { name: payload?.name });

        result = { agent_id: newAgent?.id, elevenlabs_agent_id: elAgentId };
        break;
      }

      case "update_agent": {
        if (!agent_id) throw new Error("agent_id richiesto");

        // SICUREZZA: verifica che l'elevenlabs_agent_id appartenga alla company del chiamante.
        // Senza questo check, un utente autenticato poteva modificare l'agente di un'altra azienda.
        const ownership = await findOwnedAgentByElevenLabsId(adminClient, companyId, agent_id);
        if (!ownership) {
          return json({ error: "Agente non trovato o non autorizzato" }, 403);
        }

        // FIX BUG #1 + BUG #2: costruisci il body ElevenLabs con merge corretto
        const agentPatch: Record<string, unknown> = {};
        const ttsPatch: Record<string, unknown> = {};

        if (payload?.system_prompt !== undefined) {
          agentPatch.prompt = { prompt: payload.system_prompt };
        }
        if (payload?.first_message !== undefined) {
          agentPatch.first_message = payload.first_message;
        }
        if (payload?.language !== undefined) {
          agentPatch.language = payload.language;
        }

        // FIX BUG #2: quando tools_config viene aggiornato, ri-sincronizza i tool su ElevenLabs
        if (payload?.tools_config !== undefined) {
          const elTools = buildElevenLabsToolsFromConfig(
            payload.tools_config as ToolsConfig | null
          );
          agentPatch.tools = elTools; // array vuoto = azzera i tool (intenzionale)
        }

        // FIX BUG #1: usa modello multilingual quando la voce viene aggiornata
        if (payload?.voice_id !== undefined) {
          ttsPatch.voice_id = payload.voice_id;
          ttsPatch.model_id = DEFAULT_TTS_MODEL;
        }

        if (payload?.name !== undefined) {
          // name è top-level in ElevenLabs, non dentro conversation_config
        }

        const updateBody: Record<string, unknown> = {};
        if (Object.keys(agentPatch).length > 0 || Object.keys(ttsPatch).length > 0) {
          updateBody.conversation_config = {};
          if (Object.keys(agentPatch).length > 0) {
            (updateBody.conversation_config as Record<string, unknown>).agent = agentPatch;
          }
          if (Object.keys(ttsPatch).length > 0) {
            (updateBody.conversation_config as Record<string, unknown>).tts = ttsPatch;
          }
        }
        if (payload?.name !== undefined) updateBody.name = payload.name;

        if (Object.keys(updateBody).length > 0) {
          try {
            await elFetch(`/convai/agents/${agent_id}`, "PATCH", apiKey, updateBody);
          } catch {
            // ElevenLabs may not have this agent — continue with local update
          }
        }

        if (ownership.v2AgentId) {
          const v2Patch: Record<string, unknown> = {};
          if (payload?.name !== undefined) v2Patch.nome = payload.name;
          if (payload?.system_prompt !== undefined) v2Patch.system_prompt = payload.system_prompt;
          if (payload?.first_message !== undefined) v2Patch.primo_messaggio = payload.first_message;
          if (payload?.language !== undefined) v2Patch.lingua = payload.language;
          if (payload?.llm_model !== undefined) v2Patch.llm_model = payload.llm_model;
          if (payload?.voice_id !== undefined) v2Patch.elevenlabs_voice_id = payload.voice_id;
          if (Object.keys(v2Patch).length > 0) {
            await adminClient
              .from("ai_agents_v2")
              .update(v2Patch)
              .eq("id", ownership.v2AgentId)
              .eq("company_id", companyId);
          }
        }

        if (ownership.legacyAgentId) {
          const legacyPatch: Record<string, unknown> = {};
          if (payload?.name !== undefined) legacyPatch.name = payload.name;
          if (payload?.system_prompt !== undefined) legacyPatch.system_prompt = payload.system_prompt;
          if (payload?.first_message !== undefined) legacyPatch.first_message = payload.first_message;
          if (payload?.language !== undefined) legacyPatch.language = payload.language;
          if (payload?.llm_model !== undefined) legacyPatch.llm_model = payload.llm_model;
          if (payload?.voice_id !== undefined) legacyPatch.voice_id = payload.voice_id;
          if (payload?.tools_config !== undefined) legacyPatch.tools_config = payload.tools_config;
          if (Object.keys(legacyPatch).length > 0) {
            await adminClient
              .from("ai_agents")
              .update(legacyPatch)
              .eq("id", ownership.legacyAgentId)
              .eq("company_id", companyId);
          }
        }

        await auditLog(adminClient, companyId, ownership.legacyAgentId ?? ownership.v2AgentId, userId, "update_agent", { agent_id, changes: Object.keys(payload || {}) });
        result = { success: true };
        break;
      }

      case "delete_agent": {
        if (!agent_id) throw new Error("agent_id richiesto");

        // SICUREZZA: verifica ownership prima di cancellare su ElevenLabs
        const ownership = await findOwnedAgentByElevenLabsId(adminClient, companyId, agent_id);
        if (!ownership) {
          return json({ error: "Agente non trovato o non autorizzato" }, 403);
        }

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
        if (!payload?.source_url && !payload?.name) throw new Error("source_url o name richiesti");
        // Ownership check
        const own = await findOwnedAgentByElevenLabsId(adminClient, companyId, agent_id);
        if (!own) return json({ error: "Agente non trovato o non autorizzato" }, 403);

        const docResult = await elFetch(`/convai/agents/${agent_id}/add-to-knowledge-base`, "POST", apiKey, {
          url: payload?.source_url,
          name: payload?.name,
        });
        result = { elevenlabs_doc_id: docResult?.id || null };
        break;
      }

      case "remove_kb_doc": {
        if (!agent_id || !payload?.doc_id) throw new Error("agent_id e doc_id richiesti");
        const own = await findOwnedAgentByElevenLabsId(adminClient, companyId, agent_id);
        if (!own) return json({ error: "Agente non trovato o non autorizzato" }, 403);

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
        const own = await findOwnedAgentByElevenLabsId(adminClient, companyId, agent_id);
        if (!own) return json({ error: "Agente non trovato o non autorizzato" }, 403);

        try {
          const docs = await elFetch(`/convai/agents/${agent_id}/knowledge-base`, "GET", apiKey);
          result = docs;
        } catch {
          result = { documents: [] };
        }
        break;
      }

      case "get_conversations": {
        if (!agent_id) throw new Error("agent_id richiesto");
        const own = await findOwnedAgentByElevenLabsId(adminClient, companyId, agent_id);
        if (!own) return json({ error: "Agente non trovato o non autorizzato" }, 403);

        const convRes = await elFetch(
          `/convai/conversations?agent_id=${agent_id}&page_size=${payload?.page_size || 20}${payload?.cursor ? `&cursor=${payload.cursor}` : ""}`,
          "GET",
          apiKey
        );
        result = convRes;
        break;
      }

      case "get_conversation": {
        if (!payload?.conversation_id) throw new Error("conversation_id richiesto");
        const canReadConversation = await hasConversationAccess(
          adminClient,
          companyId,
          String(payload.conversation_id),
        );
        if (!canReadConversation) {
          return json({ error: "Conversazione non trovata o non autorizzata" }, 403);
        }
        const convDetail = await elFetch(
          `/convai/conversations/${payload.conversation_id}`,
          "GET",
          apiKey
        );
        result = convDetail;
        break;
      }

      case "get_conversation_audio": {
        if (!payload?.conversation_id) throw new Error("conversation_id richiesto");
        const canReadConversation = await hasConversationAccess(
          adminClient,
          companyId,
          String(payload.conversation_id),
        );
        if (!canReadConversation) {
          return json({ error: "Conversazione non trovata o non autorizzata" }, 403);
        }
        const audioRes = await fetch(
          `${EL_BASE}/convai/conversations/${payload.conversation_id}/audio`,
          {
            headers: { "xi-api-key": apiKey },
          }
        );
        if (!audioRes.ok) {
          throw new Error(`ElevenLabs audio error ${audioRes.status}`);
        }
        // Return as base64
        const audioBuffer = await audioRes.arrayBuffer();
        const { encode: base64Encode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
        const base64Audio = base64Encode(audioBuffer);
        result = { audio_base64: base64Audio, content_type: audioRes.headers.get("content-type") || "audio/mpeg" };
        break;
      }

      case "get_phone_numbers": {
        const phonesRes = await elFetch("/convai/phone-numbers", "GET", apiKey);
        if (callerIsSuperAdmin) {
          result = phonesRes;
          break;
        }

        const rawNumbers = Array.isArray(phonesRes?.phone_numbers)
          ? phonesRes.phone_numbers
          : Array.isArray(phonesRes)
            ? phonesRes
            : [];
        const { data: localNumbers } = await adminClient
          .from("ai_phone_numbers_v2")
          .select("numero, elevenlabs_phone_id")
          .eq("company_id", companyId);
        const allowedIds = new Set(
          ((localNumbers as Array<{ elevenlabs_phone_id?: string | null }> | null) ?? [])
            .map((n) => n.elevenlabs_phone_id)
            .filter(Boolean),
        );
        const allowedNumbers = new Set(
          ((localNumbers as Array<{ numero?: string | null }> | null) ?? [])
            .map((n) => normalizePhone(n.numero))
            .filter(Boolean),
        );
        const filtered = rawNumbers.filter((n: Record<string, unknown>) => {
          const id = String(n.phone_number_id ?? n.id ?? "");
          const phone = normalizePhone(n.phone_number ?? n.number ?? "");
          return (id && allowedIds.has(id)) || (phone && allowedNumbers.has(phone));
        });
        result = Array.isArray(phonesRes)
          ? { phone_numbers: filtered }
          : { ...phonesRes, phone_numbers: filtered };
        break;
      }

      case "add_voice": {
        // P2-05: Add voice clone from base64 audio
        if (!payload?.name || !payload?.audio_base64) {
          throw new Error("name e audio_base64 richiesti");
        }
        const { decode: base64Decode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
        const audioBytes = base64Decode(payload.audio_base64 as string);
        const formData = new FormData();
        formData.append("name", payload.name as string);
        if (payload.description) formData.append("description", payload.description as string);
        const blob = new Blob([audioBytes], { type: "audio/mpeg" });
        formData.append("files", blob, "sample.mp3");

        const voiceRes = await fetch(`${EL_BASE}/voices/add`, {
          method: "POST",
          headers: { "xi-api-key": apiKey },
          body: formData,
        });
        if (!voiceRes.ok) {
          const err = await voiceRes.json().catch(() => ({}));
          throw new Error(`ElevenLabs add_voice error: ${err?.detail?.message || voiceRes.status}`);
        }
        result = await voiceRes.json();
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

        // Ownership check
        const own = await findOwnedAgentByElevenLabsId(adminClient, companyId, agent_id);
        if (!own) return json({ error: "Agente non trovato o non autorizzato" }, 403);

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

        // ── FIX F5 voce INBOUND ─────────────────────────────────────────────
        // Il create registra il numero su ElevenLabs ma NON lo assegna
        // all'agente: le chiamate outbound funzionavano, quelle IN ENTRATA
        // squillavano nel vuoto (nessun agente collegato al numero lato EL).
        // L'assegnazione esplicita chiude il cerchio: numero → agente.
        let inboundAssigned = false;
        if (elPhoneNumberId) {
          try {
            await elFetch(
              `/convai/phone-numbers/${elPhoneNumberId}`,
              "PATCH",
              apiKey,
              { agent_id },
            );
            inboundAssigned = true;
          } catch (assignErr) {
            console.error("[elevenlabs-proxy] assegnazione agente al numero fallita:", assignErr);
          }
        }

        // Update local DB record
        if (elPhoneNumberId && payload.local_phone_id) {
          await adminClient
            .from("ai_agent_phone_numbers")
            .update({ elevenlabs_phone_number_id: elPhoneNumberId })
            .eq("id", payload.local_phone_id)
            .eq("company_id", companyId);
        }

        await auditLog(adminClient, companyId, null, userId, "link_phone_number", {
          phone_number: payload.phone_number,
          elevenlabs_phone_number_id: elPhoneNumberId,
          inbound_assigned: inboundAssigned,
        });

        result = { success: true, elevenlabs_phone_number_id: elPhoneNumberId, inbound_assigned: inboundAssigned };
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

async function isSuperAdmin(client: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
  const { data } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  return ((data as Array<{ role?: string }> | null) ?? []).some((row) => row.role === "super_admin");
}

async function findOwnedAgentByElevenLabsId(
  client: ReturnType<typeof createClient>,
  companyId: string,
  elevenlabsAgentId: string,
): Promise<{ legacyAgentId: string | null; v2AgentId: string | null } | null> {
  const [{ data: legacyAgent }, { data: v2Agent }] = await Promise.all([
    client
      .from("ai_agents")
      .select("id")
      .eq("elevenlabs_agent_id", elevenlabsAgentId)
      .eq("company_id", companyId)
      .maybeSingle(),
    client
      .from("ai_agents_v2")
      .select("id")
      .eq("elevenlabs_agent_id", elevenlabsAgentId)
      .eq("company_id", companyId)
      .maybeSingle(),
  ]);

  const legacyAgentId = (legacyAgent as { id?: string } | null)?.id ?? null;
  const v2AgentId = (v2Agent as { id?: string } | null)?.id ?? null;
  if (!legacyAgentId && !v2AgentId) return null;
  return { legacyAgentId, v2AgentId };
}

async function hasConversationAccess(
  client: ReturnType<typeof createClient>,
  companyId: string,
  elevenlabsConversationId: string,
): Promise<boolean> {
  const [{ data: legacyConversation }, { data: v2Conversation }] = await Promise.all([
    client
      .from("ai_agent_conversations")
      .select("id")
      .eq("elevenlabs_conversation_id", elevenlabsConversationId)
      .eq("company_id", companyId)
      .maybeSingle(),
    client
      .from("ai_conversations_v2")
      .select("id")
      .eq("elevenlabs_conversation_id", elevenlabsConversationId)
      .eq("company_id", companyId)
      .maybeSingle(),
  ]);

  return Boolean(
    (legacyConversation as { id?: string } | null)?.id ||
    (v2Conversation as { id?: string } | null)?.id,
  );
}

function normalizePhone(value: unknown): string {
  return String(value ?? "").replace(/[^\d+]/g, "");
}
