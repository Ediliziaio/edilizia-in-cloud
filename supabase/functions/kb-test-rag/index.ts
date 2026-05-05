/**
 * kb-test-rag — Evaluation RAG per Track 2
 *
 * Riceve query text → genera embedding → match_brain → ritorna top N risultati
 * con similarity. Usato per validazione test set.
 *
 * Input: { queries: [{id, query, expected_doc_path?, expected_area?, ...}], top_k?: number }
 * Output: { results: [{id, query, top_n, hits: [...]}], summary: {...} }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_QUERIES = 100;

interface TestQuery {
  id: string;
  query: string;
  expected_doc_path?: string;
  expected_area?: string;
  expected_keywords?: string[];
  expected_areas_multiple?: string[];
  expected_doc_paths_top3?: string[];
  expected_min_similarity_max?: number;
  category?: string;
}

async function embed(apiKey: string, text: string): Promise<number[]> {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  if (!r.ok) throw new Error(`embed ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).data[0].embedding;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const cors = getCorsHeaders(req);

  try {
    if (req.method !== "POST") return errorResponse("POST only", 405, cors);
    const auth = req.headers.get("Authorization");
    if (!auth) return errorResponse("Missing Authorization", 401, cors);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY")!;

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: auth } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return errorResponse("Invalid JWT", 401, cors);

    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const queries: TestQuery[] = body?.queries ?? [];
    const topK = body?.top_k ?? 5;
    if (!Array.isArray(queries) || queries.length === 0) return errorResponse("queries required", 400, cors);
    if (queries.length > MAX_QUERIES) return errorResponse(`max ${MAX_QUERIES} queries`, 400, cors);

    const results = [];
    let pass = 0, fail = 0, partial = 0;

    for (const q of queries) {
      try {
        const queryEmb = await embed(OPENAI_KEY, q.query);
        const { data: hits, error } = await adminClient.rpc("match_brain", {
          p_company_id: null,
          p_query_embedding: `[${queryEmb.join(",")}]`,
          p_match_count: topK,
          p_min_similarity: 0.20,
          p_source_types: ["kb_universal"],
          p_include_universal: true,
          p_universal_categories: null,
        });
        if (error) throw error;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hitArr = (hits as any[]) ?? [];

        // Compute pass/fail
        let result: "pass" | "fail" | "partial" = "fail";
        const notes: string[] = [];

        if (q.expected_doc_path) {
          const top3 = hitArr.slice(0, 3);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const matchTop1 = top3[0]?.metadata?.doc_path === q.expected_doc_path;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const matchTop3 = top3.some((h: any) => h?.metadata?.doc_path === q.expected_doc_path);
          if (matchTop1) { result = "pass"; notes.push("top-1 hit"); }
          else if (matchTop3) { result = "partial"; notes.push("top-3 hit"); }
          else notes.push("no doc_path match in top-3");
        } else if (q.expected_areas_multiple) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const top3Areas = new Set(hitArr.slice(0, 3).map((h: any) => h.category));
          const overlap = q.expected_areas_multiple.filter((a) => top3Areas.has(a));
          if (overlap.length > 0) { result = "pass"; notes.push(`area match: ${overlap.join(",")}`); }
        } else if (q.expected_min_similarity_max !== undefined) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const maxSim = hitArr.length > 0 ? Number(hitArr[0].similarity) : 0;
          if (maxSim <= q.expected_min_similarity_max) { result = "pass"; notes.push(`max sim ${maxSim.toFixed(3)} <= ${q.expected_min_similarity_max}`); }
          else notes.push(`sim too high: ${maxSim.toFixed(3)}`);
        }

        if (result === "pass") pass++;
        else if (result === "partial") partial++;
        else fail++;

        results.push({
          id: q.id,
          query: q.query,
          result,
          notes: notes.join(" | "),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          top_3: hitArr.slice(0, 3).map((h: any) => ({
            doc_path: h.metadata?.doc_path,
            section: h.metadata?.section_title,
            category: h.category,
            similarity: Number(h.similarity).toFixed(3),
          })),
        });
      } catch (e) {
        fail++;
        results.push({ id: q.id, query: q.query, result: "fail", error: e instanceof Error ? e.message : String(e), top_3: [] });
      }
    }

    return jsonResponse({
      success: true,
      summary: {
        total: queries.length,
        pass, partial, fail,
        pass_rate: `${Math.round(100 * (pass + partial * 0.5) / queries.length)}%`,
        pass_rate_strict: `${Math.round(100 * pass / queries.length)}%`,
      },
      results,
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(err instanceof Error ? err.message : String(err), 500, getCorsHeaders(req));
  }
});
