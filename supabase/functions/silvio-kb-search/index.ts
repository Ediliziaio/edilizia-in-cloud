/**
 * silvio-kb-search — Search semantica nella KB di Silvio Admin.
 *
 * Body: { query: string, persona_key?: string, kb_sections?: string[], top_k?: number }
 *
 * Flusso:
 *   1. Embedda la query via OpenAI text-embedding-3-small
 *   2. Chiama RPC search_silvio_knowledge(embedding, persona, sezioni)
 *   3. Ritorna chunks + similarity + chunk_id (per citazione fonti)
 *   4. Track usage (hits_count++) async
 *
 * Auth: super_admin O service_role (chiamato da silvio-admin-chat).
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
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Auth: super_admin via JWT, oppure service_role via internal secret
    const authHeader = req.headers.get("Authorization") ?? "";
    const internalSecret = req.headers.get("x-internal-secret");
    const isInternalCall = internalSecret === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!isInternalCall) {
      const userRes = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      const userId = userRes.data?.user?.id;
      if (!userId) return jsonRes({ error: "Unauthorized" }, 401);

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "super_admin")
        .maybeSingle();
      if (!roleData) return jsonRes({ error: "Permesso negato" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const query: string = body.query ?? "";
    const personaKey: string | null = body.persona_key ?? null;
    const kbSections: string[] | null = body.kb_sections ?? null;
    const topK: number = Math.min(Math.max(body.top_k ?? 6, 1), 12);
    const minSimilarity: number = body.min_similarity ?? 0.30;

    if (query.trim().length < 3) {
      return jsonRes({ error: "Query troppo corta (min 3 char)" }, 400);
    }

    // 1. Embed
    const t0 = Date.now();
    const embedding = await generateEmbedding(query);
    const embedMs = Date.now() - t0;

    // 2. Vector search
    const { data: results, error } = await supabase.rpc("search_silvio_knowledge", {
      p_query_embedding: embedding,
      p_top_k: topK,
      p_min_similarity: minSimilarity,
      p_persona_key: personaKey,
      p_kb_sections: kbSections,
    });

    if (error) {
      return jsonRes({ error: error.message }, 500);
    }

    const chunks = (results ?? []) as Array<{
      doc_id: string;
      chunk_id: string;
      title: string;
      content: string;
      kb_section: string;
      kb_subsection: string;
      persona_keys: string[];
      similarity: number;
    }>;

    // 3. Track citation (fire-and-forget)
    if (chunks.length > 0) {
      const docIds = chunks.map((c) => c.doc_id);
      void supabase.rpc("silvio_kb_track_citation", { p_doc_ids: docIds });
    }

    return jsonRes({
      ok: true,
      query,
      persona_key: personaKey,
      kb_sections: kbSections,
      embed_ms: embedMs,
      total_ms: Date.now() - t0,
      results: chunks.map((c) => ({
        doc_id: c.doc_id,
        chunk_id: c.chunk_id,
        title: c.title,
        // Limit content excerpt to 800 char per chunk per non saturare il prompt
        content: c.content.slice(0, 800),
        kb_section: c.kb_section,
        kb_subsection: c.kb_subsection,
        persona_keys: c.persona_keys,
        similarity: Number(c.similarity),
        citation: `[fonte: §${c.kb_section}.${c.kb_subsection} — ${c.title}]`,
      })),
    });
  } catch (e) {
    console.error("[silvio-kb-search] error:", e);
    return jsonRes({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
