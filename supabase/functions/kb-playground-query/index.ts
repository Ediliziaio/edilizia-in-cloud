/**
 * kb-playground-query — Embedding + vector search della KB.
 * Usato dal tab Playground del SuperAdmin per testare cosa recupera l'AI.
 *
 * Body: { query: string, top_k?: number, min_similarity?: number,
 *         category_path?: string, company_id?: uuid, include_expired?: boolean }
 *
 * Auth: solo super_admin.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateEmbedding } from "../_shared/brainEmbed.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const userRes = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    const userId = userRes.data?.user?.id;
    if (!userId) return jsonRes({ error: "Unauthorized" }, 401);

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!roleData) return jsonRes({ error: "Permesso negato: solo super_admin" }, 403);

    const body = await req.json().catch(() => ({}));
    const query: string = body.query ?? "";
    if (query.trim().length < 3) {
      return jsonRes({ error: "Query troppo corta (min 3 char)" }, 400);
    }

    // 1. Embed query
    const t0 = Date.now();
    const embedding = await generateEmbedding(query);
    const embedMs = Date.now() - t0;

    // 2. Vector search
    const { data: results, error } = await supabase.rpc("kb_test_query", {
      p_query: query,
      p_query_embedding: embedding,
      p_top_k: Math.min(Math.max(body.top_k ?? 5, 1), 20),
      p_min_similarity: body.min_similarity ?? 0.20,
      p_category_path: body.category_path ?? null,
      p_company_id: body.company_id ?? null,
      p_include_expired: body.include_expired ?? false,
    });

    if (error) return jsonRes({ error: error.message }, 500);

    return jsonRes({
      results: results ?? [],
      meta: {
        query,
        embed_ms: embedMs,
        total_ms: Date.now() - t0,
        embedding_dim: embedding.length,
      },
    });
  } catch (e) {
    console.error("kb-playground-query error:", e);
    return jsonRes({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
