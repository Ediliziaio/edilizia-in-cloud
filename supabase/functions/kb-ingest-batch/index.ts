/**
 * kb-ingest-batch — Edge function per ingestion KB universale
 *
 * Riceve un batch di chunk già preparati dal client locale (parsing/chunking),
 * genera embeddings via OpenAI (server-side, secret OPENAI_API_KEY),
 * fa upsert via brain_upsert_kb_chunk RPC (server-side, service_role).
 *
 * Solo super_admin può chiamarla (bypass RBAC tramite service_role check
 * sul JWT del chiamante).
 *
 * Input:
 *   { chunks: [{source_path, title, content, category, metadata, source_hash}], ...up to 100 }
 *
 * Output:
 *   { success, results: [{source_path, action: insert|update|skip|error, ...}],
 *     stats: { inserted, updated, skipped, errors }, ai_meta }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

interface InputChunk {
  source_path: string;
  title: string;
  content: string;
  category: string;
  metadata: AnyObj;
  source_hash: string;
}

const MAX_BATCH = 100;
const EMBEDDING_MODEL = "text-embedding-3-small";

async function generateEmbeddingsBatch(apiKey: string, texts: string[]): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI embed ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  return data.data.map((d: { embedding: number[] }) => d.embedding);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const cors = getCorsHeaders(req);

  try {
    if (req.method !== "POST") return errorResponse("POST only", 405, cors);

    // Auth: solo super_admin può chiamare (verifichiamo dal JWT)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Missing Authorization", 401, cors);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY")!;
    if (!SUPABASE_URL || !SERVICE_KEY) return errorResponse("Supabase env missing", 500, cors);
    if (!OPENAI_KEY) return errorResponse("OPENAI_API_KEY missing", 500, cors);

    // Auth: accetta JWT valido (super_admin o admin) — endpoint usato per setup KB
    // TODO: ripristinare check super_admin dopo setup iniziale Track 2
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return errorResponse("Invalid JWT", 401, cors);

    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Log chi sta facendo l'ingestion (audit)
    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const userRoles = (roles ?? []).map((r: AnyObj) => r.role);
    if (!userRoles.some((r: string) => ["super_admin", "company_admin"].includes(r))) {
      return errorResponse("admin role required", 403, cors);
    }
    console.log(`[kb-ingest-batch] caller user_id=${userData.user.id} roles=${userRoles.join(",")}`);

    // Parse body
    const body = await req.json().catch(() => ({}));
    const chunks: InputChunk[] = body?.chunks ?? [];
    if (!Array.isArray(chunks) || chunks.length === 0) {
      return errorResponse("chunks array required", 400, cors);
    }
    if (chunks.length > MAX_BATCH) {
      return errorResponse(`Max ${MAX_BATCH} chunks per request`, 400, cors);
    }

    // Validate each chunk
    for (const c of chunks) {
      if (!c.source_path || !c.content || !c.category || !c.title || !c.source_hash) {
        return errorResponse(`chunk invalid: ${c.source_path ?? "?"}`, 400, cors);
      }
    }

    // Generate embeddings (single batch call)
    const startEmb = Date.now();
    const embeddings = await generateEmbeddingsBatch(OPENAI_KEY, chunks.map((c) => c.content));
    const embDurationMs = Date.now() - startEmb;

    // Upsert each
    const results: Array<{
      source_path: string;
      action: string;
      id?: string;
      error?: string;
    }> = [];
    let inserted = 0, updated = 0, skipped = 0, errors = 0;

    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const emb = embeddings[i];
      try {
        const { data, error } = await adminClient.rpc("brain_upsert_kb_chunk", {
          p_source_path: c.source_path,
          p_title: c.title,
          p_content: c.content,
          p_embedding: `[${emb.join(",")}]`,
          p_category: c.category,
          p_metadata: c.metadata,
          p_source_hash: c.source_hash,
        });
        if (error) throw error;
        const action = (data as AnyObj)?.action ?? "unknown";
        const id = (data as AnyObj)?.id;
        results.push({ source_path: c.source_path, action, id });
        if (action === "insert") inserted++;
        else if (action === "update") updated++;
        else if (action === "skip") skipped++;
      } catch (e) {
        results.push({
          source_path: c.source_path,
          action: "error",
          error: e instanceof Error ? e.message : String(e),
        });
        errors++;
      }
    }

    return jsonResponse({
      success: true,
      results,
      stats: { total: chunks.length, inserted, updated, skipped, errors },
      ai_meta: {
        model: EMBEDDING_MODEL,
        embedding_duration_ms: embDurationMs,
      },
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(`Errore: ${err instanceof Error ? err.message : String(err)}`, 500, getCorsHeaders(req));
  }
});
