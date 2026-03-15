import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/headers.ts";

const EL_BASE = "https://api.elevenlabs.io/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
    const { data: profile } = await adminClient
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();

    const companyId = profile?.company_id;
    if (!companyId) return json({ error: "Nessuna azienda associata" }, 403);

    // Get ElevenLabs API key from company config
    const { data: elConfig } = await adminClient
      .from("ai_elevenlabs_config")
      .select("api_key_encrypted")
      .eq("company_id", companyId)
      .single();

    if (!elConfig?.api_key_encrypted) {
      return json({ error: "API key ElevenLabs non configurata" }, 400);
    }

    // Decrypt API key
    const { decrypt, getEncryptionKey } = await import("../_shared/encryption.ts");
    const apiKey = await decrypt(elConfig.api_key_encrypted, getEncryptionKey());

    const body = await req.json();
    const { action, doc_id, agent_id, payload } = body;

    let result: unknown;

    switch (action) {
      case "sync_document": {
        if (!doc_id) throw new Error("doc_id richiesto");

        // Update status to syncing
        await adminClient.rpc("update_kb_sync_status", {
          p_doc_id: doc_id,
          p_status: "syncing",
        });

        // Get document details
        const { data: doc } = await adminClient
          .from("ai_knowledge_base_v2")
          .select("*")
          .eq("id", doc_id)
          .single();

        if (!doc) throw new Error("Documento non trovato");

        try {
          let elDocId: string | null = null;

          if (doc.tipo === "url" && doc.url) {
            // Sync URL document
            const elRes = await elFetch("/convai/knowledge-base", "POST", apiKey, {
              url: doc.url,
              name: doc.titolo,
            });
            elDocId = elRes?.id || null;
          } else if (doc.tipo === "text" && doc.contenuto) {
            // Sync text document
            const elRes = await elFetch("/convai/knowledge-base", "POST", apiKey, {
              text: doc.contenuto,
              name: doc.titolo,
            });
            elDocId = elRes?.id || null;
          } else if (doc.tipo === "file") {
            // For files, we need to upload via multipart
            const filePath = `${companyId}/${doc_id}`;
            const { data: fileData } = await adminClient.storage
              .from("ai-knowledge")
              .download(filePath);

            if (fileData) {
              const formData = new FormData();
              formData.append("file", fileData, doc.titolo);
              formData.append("name", doc.titolo);

              const elRes = await fetch(`${EL_BASE}/convai/knowledge-base`, {
                method: "POST",
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

          await adminClient.rpc("update_kb_sync_status", {
            p_doc_id: doc_id,
            p_status: "synced",
            p_el_doc_id: elDocId,
          });

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
        const { data: doc } = await adminClient
          .from("ai_knowledge_base_v2")
          .select("elevenlabs_doc_id")
          .eq("id", doc_id)
          .single();

        if (!doc?.elevenlabs_doc_id) {
          throw new Error("Documento non sincronizzato con ElevenLabs");
        }

        // Get agent's EL agent id
        const { data: agent } = await adminClient
          .from("ai_agents_v2")
          .select("elevenlabs_agent_id")
          .eq("id", agent_id)
          .single();

        if (!agent?.elevenlabs_agent_id) {
          throw new Error("Agente non ha un ID ElevenLabs");
        }

        // Attach to agent on EL
        await elFetch(
          `/convai/agents/${agent.elevenlabs_agent_id}/add-to-knowledge-base`,
          "POST",
          apiKey,
          { document_id: doc.elevenlabs_doc_id }
        );

        // Save in junction table
        await adminClient.from("ai_agent_knowledge_v2").upsert({
          agent_id,
          doc_id,
        });

        result = { success: true };
        break;
      }

      case "delete_document": {
        if (!doc_id) throw new Error("doc_id richiesto");

        const { data: doc } = await adminClient
          .from("ai_knowledge_base_v2")
          .select("elevenlabs_doc_id")
          .eq("id", doc_id)
          .single();

        // Delete from EL if synced
        if (doc?.elevenlabs_doc_id) {
          try {
            await elFetch(
              `/convai/knowledge-base/${doc.elevenlabs_doc_id}`,
              "DELETE",
              apiKey
            );
          } catch {
            // May already be deleted on EL side
          }
        }

        // Delete junction records
        await adminClient
          .from("ai_agent_knowledge_v2")
          .delete()
          .eq("doc_id", doc_id);

        // Delete local record
        await adminClient
          .from("ai_knowledge_base_v2")
          .delete()
          .eq("id", doc_id);

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
    const message = err instanceof Error ? err.message : "Errore interno";
    console.error("kb-sync error:", message);
    return json({ error: message }, 500);
  }
});

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
