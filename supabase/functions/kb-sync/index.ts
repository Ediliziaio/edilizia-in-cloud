import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders } from "../_shared/headers.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { agentCompanyAccess } from "../_shared/agentCompanyAccess.ts";

const EL_BASE = "https://api.elevenlabs.io/v1";

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
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();
    const { action, doc_id, agent_id } = body;
    const { companyId } = await agentCompanyAccess(adminClient, user.id, body.company_id, corsHeaders);
    if (!["sync_document", "attach_to_agent", "delete_document"].includes(action)) return json({ error: "Azione non supportata" }, 400);
    if (!doc_id) return json({ error: "doc_id richiesto" }, 400);
    const { data: ownedDoc, error: docError } = await adminClient.from("ai_knowledge_base_v2")
      .select("*").eq("id", doc_id).eq("company_id", companyId).single();
    if (docError || !ownedDoc) return json({ error: "Documento non trovato o non autorizzato" }, 403);

    if (action === "sync_document" && ownedDoc.sync_status === "synced" && ownedDoc.elevenlabs_doc_id) {
      return json({ success: true, elevenlabs_doc_id: ownedDoc.elevenlabs_doc_id });
    }
    // Use the same provider account as the agent proxy.
    const needsProvider = action !== "delete_document" || !!ownedDoc.elevenlabs_doc_id;
    let apiKey = needsProvider ? await getPlatformSetting("elevenlabs_api_key", "ELEVENLABS_API_KEY") : "";
    if (needsProvider && !apiKey) {
      const { data: elConfig } = await adminClient
        .from("ai_elevenlabs_config")
        .select("api_key_encrypted")
        .eq("company_id", companyId)
        .single();
      if (!elConfig?.api_key_encrypted) {
        return json({ error: "API key ElevenLabs non configurata" }, 400);
      }

      const { decrypt, getEncryptionKey } = await import("../_shared/encryption.ts");
      apiKey = await decrypt(elConfig.api_key_encrypted, getEncryptionKey());
    }

    let result: unknown;

    switch (action) {
      case "sync_document": {
        if (!doc_id) throw new Error("doc_id richiesto");

        // Update status to syncing
        const { error: markingError } = await adminClient.rpc("update_kb_sync_status", {
          p_doc_id: doc_id,
          p_status: "syncing",
        });
        if (markingError) throw markingError;

        // Get document details
        const doc = ownedDoc;

        if (!doc) throw new Error("Documento non trovato");

        try {
          let elDocId: string | null = null;

          if (doc.tipo === "url" && doc.url) {
            // Sync URL document
            const elRes = await elFetch("/convai/knowledge-base/url", "POST", apiKey, {
              url: doc.url,
              name: doc.titolo,
            });
            elDocId = elRes?.id || null;
          } else if (doc.tipo === "text" && doc.contenuto) {
            // Sync text document
            const elRes = await elFetch("/convai/knowledge-base/text", "POST", apiKey, {
              text: doc.contenuto,
              name: doc.titolo,
            });
            elDocId = elRes?.id || null;
          } else if (doc.tipo === "file") {
            // For files, we need to upload via multipart
            const filePath = `${companyId}/${doc_id}`;
            const { data: fileData, error: fileError } = await adminClient.storage
              .from("ai-knowledge")
              .download(filePath);
            if (fileError || !fileData) throw fileError || new Error("File del documento non disponibile");

            if (fileData) {
              const formData = new FormData();
              formData.append("file", fileData, doc.titolo);
              formData.append("name", doc.titolo);

              const elRes = await fetch(`${EL_BASE}/convai/knowledge-base/file`, {
                method: "POST",
                signal: AbortSignal.timeout(30_000),
                headers: { "xi-api-key": apiKey },
                body: formData,
              });

              if (!elRes.ok) {
                const errText = await elRes.text();
                throw new Error(`EL error ${elRes.status}: ${errText}`);
              }
              const elData = await elRes.json();
              elDocId = elData?.id || null;
            }
          }

          if (!elDocId) throw new Error("ElevenLabs non ha restituito l'ID del documento: sincronizzazione non completata");
          const { error: syncStatusError } = await adminClient.rpc("update_kb_sync_status", {
            p_doc_id: doc_id,
            p_status: "synced",
            p_el_doc_id: elDocId,
          });
          if (syncStatusError) throw syncStatusError;

          result = { success: true, elevenlabs_doc_id: elDocId };
        } catch (syncErr) {
          const errMsg = syncErr instanceof Error ? syncErr.message : "Errore sync";
          await adminClient.rpc("update_kb_sync_status", {
            p_doc_id: doc_id,
            p_status: "error",
            p_error: errMsg,
          });
          throw syncErr;
        }
        break;
      }

      case "attach_to_agent": {
        if (!doc_id || !agent_id) throw new Error("doc_id e agent_id richiesti");

        // Get the EL doc id
        const doc = ownedDoc;

        if (!doc?.elevenlabs_doc_id) {
          throw new Error("Documento non sincronizzato con ElevenLabs");
        }

        // Get agent's EL agent id
        const { data: agent, error: agentError } = await adminClient
          .from("ai_agents_v2")
          .select("elevenlabs_agent_id")
          .eq("id", agent_id)
          .eq("company_id", companyId)
          .single();
        if (agentError || !agent) return json({ error: "Agente non trovato o non autorizzato" }, 403);
        if (!agent?.elevenlabs_agent_id) {
          throw new Error("Agente non ha un ID ElevenLabs");
        }

        const remote = await elFetch(`/convai/agents/${agent.elevenlabs_agent_id}`, "GET", apiKey);
        const current = remote?.conversation_config?.agent?.prompt?.knowledge_base ?? [];
        const knowledge = current.filter((entry: { id: string }) => entry.id !== doc.elevenlabs_doc_id);
        knowledge.push({ id: doc.elevenlabs_doc_id, name: doc.titolo, type: doc.tipo });
        await elFetch(`/convai/agents/${agent.elevenlabs_agent_id}`, "PATCH", apiKey,
          { conversation_config: { agent: { prompt: { ...remote?.conversation_config?.agent?.prompt, knowledge_base: knowledge } } } });

        // Save in junction table
        const { error: attachError } = await adminClient.from("ai_agent_knowledge_v2").upsert({
          agent_id,
          doc_id,
        });
        if (attachError) throw attachError;

        result = { success: true };
        break;
      }

      case "delete_document": {
        if (!doc_id) throw new Error("doc_id richiesto");

        const doc = ownedDoc;

        // Delete from EL if synced
        if (doc?.elevenlabs_doc_id) {
          try {
            await elFetch(
              `/convai/knowledge-base/${doc.elevenlabs_doc_id}`,
              "DELETE",
              apiKey
            );
          } catch (err) {
            if (!(err instanceof KnowledgeProviderError && err.status === 404)) throw err;
          }
        }

        // Delete junction records
        const { error: junctionError } = await adminClient
          .from("ai_agent_knowledge_v2")
          .delete()
          .eq("doc_id", doc_id);
        if (junctionError) throw junctionError;

        // Delete local record
        const { data: deleted, error: deleteError } = await adminClient
          .from("ai_knowledge_base_v2")
          .delete()
          .eq("id", doc_id).eq("company_id", companyId).select("id").single();
        if (deleteError || !deleted) throw deleteError || new Error("Documento non eliminato");

        // Delete file from storage if exists
        try {
          await adminClient.storage
            .from("ai-knowledge")
            .remove([`${companyId}/${doc_id}`]);
        } catch {
          // File may not exist
        }

        result = { success: true };
        break;
      }

      default:
        return json({ error: `Azione non supportata: ${action}` }, 400);
    }

    return json(result);
  } catch (err: unknown) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : "Errore interno";
    console.error("kb-sync error:", message);
    return json({ error: message }, 500);
  }
});

async function elFetch(path: string, method: string, apiKey: string, body?: unknown) {
  const opts: RequestInit = {
    method,
    signal: AbortSignal.timeout(30_000),
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
  };
  if (body && method !== "GET") opts.body = JSON.stringify(body);
  const res = await fetch(`${EL_BASE}${path}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new KnowledgeProviderError(res.status, text);
  }
  if (res.status === 204) return null;
  return res.json();
}

class KnowledgeProviderError extends Error {
  constructor(public status: number, detail: string) { super(`ElevenLabs API error ${status}: ${detail}`); }
}
