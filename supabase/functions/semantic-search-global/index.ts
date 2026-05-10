/**
 * semantic-search-global — GAP 8 (Search semantica globale)
 *
 * Cerca semanticamente nella KB aziendale (ai_brain_documents) usando
 * embedding text-embedding-3-small + pgvector cosine similarity.
 *
 * Differenza vs useGlobalSearch (ILIKE):
 *   - useGlobalSearch trova match esatti su orders/profiles/contacts/tickets
 *     (es. "rossi" → cliente Rossi)
 *   - semantic-search-global trova CONCETTI vicini (es. "problemi sicurezza"
 *     → cantieri con DURC scaduto, infortuni, multe Inail, ecc.)
 *
 * Body:
 *   { query: string, top_k?: number (default 8), category_path?: string }
 *
 * Risposta:
 *   {
 *     results: Array<{
 *       chunk_id, doc_id, title, category_path, content_preview,
 *       similarity, language
 *     }>,
 *     query_embedded_in_ms: number,
 *     total_search_ms: number
 *   }
 *
 * Auth: company_admin / super_admin (RLS via security_invoker della VIEW).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

interface SearchBody {
  query: string;
  top_k?: number;
  category_path?: string;
  min_similarity?: number;
  // 🆕 GAP 8b: filtro per tipo (kb_documents | entities) e tipi entità
  search_in?: ("kb_documents" | "entities")[];
  entity_types?: string[];
  company_id?: string;  // necessario per entity search
}

interface EmbedResponse {
  data?: Array<{ embedding: number[] }>;
  error?: { message: string };
}

const OPENAI_EMBED_URL = "https://api.openai.com/v1/embeddings";
const EMBED_MODEL = "text-embedding-3-small";

async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return null;
  const t0 = Date.now();
  try {
    const res = await fetch(OPENAI_EMBED_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: text.substring(0, 8000),
      }),
    });
    if (!res.ok) {
      console.error("[semantic-search] embed HTTP", res.status);
      return null;
    }
    const json = (await res.json()) as EmbedResponse;
    const emb = json.data?.[0]?.embedding ?? null;
    if (emb) {
      console.info(`[semantic-search] embedded in ${Date.now() - t0}ms`);
    }
    return emb;
  } catch (e) {
    console.error("[semantic-search] embed error:", e);
    return null;
  }
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Auth: passa-through il bearer dell'utente (RLS della VIEW si applica)
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "auth_required" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({})) as SearchBody;
  const query = (body.query ?? "").trim();
  if (query.length < 3) {
    return new Response(JSON.stringify({
      results: [], query_embedded_in_ms: 0, total_search_ms: 0,
      error: "query_too_short",
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  const t0Total = Date.now();

  // 1) Embed query
  const tEmbStart = Date.now();
  const queryEmbedding = await generateEmbedding(query);
  const queryEmbMs = Date.now() - tEmbStart;

  if (!queryEmbedding) {
    return new Response(JSON.stringify({
      results: [], query_embedded_in_ms: queryEmbMs, total_search_ms: Date.now() - t0Total,
      error: "embedding_failed",
    }), { status: 503, headers: { ...cors, "Content-Type": "application/json" } });
  }

  // 2) Search PARALLELA: KB documents + Entities (clienti/cantieri/fatture)
  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const topK = Math.min(body.top_k ?? 8, 25);
  const minSim = body.min_similarity ?? 0.20;
  const searchIn = body.search_in ?? ["kb_documents", "entities"];

  // 2a) KB documents search
  const kbPromise = searchIn.includes("kb_documents")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (supa as any).rpc("kb_test_query_multilang", {
        p_query: query,
        p_query_embedding: queryEmbedding,
        p_top_k: topK,
        p_min_similarity: minSim,
        p_language: "it",
        p_cross_lang_fallback: true,
        p_category_path: body.category_path ?? null,
      })
    : Promise.resolve({ data: [], error: null });

  // 2b) Entity search (clienti/cantieri/fatture) — richiede company_id
  const entityPromise = (searchIn.includes("entities") && body.company_id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (supa as any).rpc("search_entities_semantic", {
        p_company_id: body.company_id,
        p_query_embedding: queryEmbedding,
        p_top_k: topK,
        p_min_similarity: minSim,
        p_entity_types: body.entity_types ?? null,
      })
    : Promise.resolve({ data: [], error: null });

  const [kbRes, entityRes] = await Promise.all([kbPromise, entityPromise]);

  // KB results (soft fail su permission denied)
  let kbResults: unknown[] = [];
  let kbError: string | null = null;
  if (kbRes.error) {
    if (!kbRes.error.message?.includes("Permesso negato") && kbRes.error.code !== "42501") {
      kbError = kbRes.error.message;
    }
  } else {
    kbResults = kbRes.data ?? [];
  }

  // Entity results (soft fail)
  let entityResults: unknown[] = [];
  let entityError: string | null = null;
  if (entityRes.error) {
    if (!entityRes.error.message?.includes("Permesso negato")) {
      entityError = entityRes.error.message;
    }
  } else {
    entityResults = entityRes.data ?? [];
  }

  return new Response(JSON.stringify({
    results: kbResults,        // back-compat: campo "results" = KB documents
    entity_results: entityResults,  // 🆕 GAP 8b: clienti/cantieri/fatture
    kb_error: kbError,
    entity_error: entityError,
    query_embedded_in_ms: queryEmbMs,
    total_search_ms: Date.now() - t0Total,
  }), { headers: { ...cors, "Content-Type": "application/json" } });
});
