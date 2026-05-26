/**
 * silvio-kb-search — Search semantica nella KB di Silvio Admin.
 *
 * Body: {
 *   query: string,
 *   persona_key?: string,
 *   kb_sections?: string[],
 *   top_k?: number,
 *   company_id?: string,   // se passato → applica override aziendali (search_v2)
 *   session_id?: string,   // per audit log citation
 * }
 *
 * Flusso:
 *   1. Embedda la query via OpenAI text-embedding-3-small
 *   2. Vector search via `search_silvio_knowledge_v2` (con override azienda
 *      se company_id presente) o fallback `search_silvio_knowledge` (v1)
 *   3. [opzionale] Rerank via Cohere → riordina per relevanza semantica
 *   4. Ritorna top_k chunks (SENZA citation visibile — Decisione 2)
 *   5. `log_kb_citation` → audit interno chunk + override usati
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
    const companyId: string | null = body.company_id ?? null;
    const sessionId: string | null = body.session_id ?? null;

    // OTTIMIZZAZIONE adaptive rerank:
    //  - default ON solo se la query "sembra strategica" (lunga + parole chiave)
    //  - skip rerank per query operative corte → -300ms per messaggio
    //  - override esplicito via body.rerank (true|false) ha precedenza
    const STRATEGIC_RX =
      /\b(strategi[ao]|analisi|valutar?e?|conviene|meglio|rischio|decisione|framework|priorit[aà]|investimento|trade.?off|scegliere|confronto|benchmark|metric[ae])\b/i;
    const looksStrategic = query.length > 40 || STRATEGIC_RX.test(query);
    const useRerank: boolean =
      typeof body.rerank === "boolean" ? body.rerank : looksStrategic;

    if (query.trim().length < 3) {
      return jsonRes({ error: "Query troppo corta (min 3 char)" }, 400);
    }

    // 1. Embed
    const t0 = Date.now();
    const embedding = await generateEmbedding(query);
    const embedMs = Date.now() - t0;

    // 2. Vector search — fetch più candidati di topK per dare materiale al rerank
    const cohereKey = Deno.env.get("COHERE_API_KEY");
    const willRerank = useRerank && !!cohereKey;
    const candidatePool = willRerank ? Math.min(topK * 3, 30) : topK;

    // V2 se presente (supporta override aziendali + kb_priority filter)
    // V1 come fallback se v2 non disponibile (deploy graduale)
    const tVec = Date.now();
    let { data: results, error } = await supabase.rpc("search_silvio_knowledge_v2", {
      p_query_embedding: embedding,
      p_top_k: candidatePool,
      p_min_similarity: minSimilarity,
      p_persona_key: personaKey,
      p_kb_sections: kbSections,
      p_company_id: companyId,
    });

    // Fallback v1 se v2 non esiste
    if (error && /function .* does not exist/i.test(error.message ?? "")) {
      console.warn("[silvio-kb-search] v2 unavailable, falling back to v1");
      const v1 = await supabase.rpc("search_silvio_knowledge", {
        p_query_embedding: embedding,
        p_top_k: candidatePool,
        p_min_similarity: minSimilarity,
        p_persona_key: personaKey,
        p_kb_sections: kbSections,
      });
      results = v1.data;
      error = v1.error;
    }
    const vectorMs = Date.now() - tVec;

    if (error) {
      return jsonRes({ error: error.message }, 500);
    }

    let chunks = (results ?? []) as Array<{
      result_type?: string;
      doc_id: string;
      chunk_id: string;
      title: string;
      content: string;
      kb_section: string;
      kb_subsection: string;
      kb_priority?: string;
      kb_source_book?: string;
      persona_keys: string[];
      similarity: number;
      override_id?: string;
      override_rationale?: string;
      rerank_score?: number;
    }>;

    // 3. Cohere rerank (opzionale, se key presente e abbastanza candidati)
    let rerankMs = 0;
    let rerankUsed = false;
    if (willRerank && chunks.length > topK) {
      try {
        const tRerank = Date.now();
        const reranked = await cohereRerank(cohereKey!, query, chunks, topK);
        if (reranked && reranked.length > 0) {
          chunks = reranked;
          rerankUsed = true;
        }
        rerankMs = Date.now() - tRerank;
      } catch (rerankErr) {
        console.warn("[silvio-kb-search] rerank failed, falling back to vector:", rerankErr);
        chunks = chunks.slice(0, topK);
      }
    } else {
      chunks = chunks.slice(0, topK);
    }

    // 4. Audit log (fire-and-forget) — Decisione 2: niente citation visibile,
    //    ma tracciamo internamente cosa ha alimentato la risposta.
    if (chunks.length > 0) {
      const docIds = chunks
        .filter((c) => c.result_type !== "company_override")
        .map((c) => c.doc_id)
        .filter(Boolean);
      const overrideIds = chunks
        .filter((c) => c.result_type === "company_override" && c.override_id)
        .map((c) => c.override_id!)
        .filter(Boolean);
      const sims = chunks.map((c) => Number(c.similarity) || 0);

      // Nuovo: log_kb_citation (v2) con audit completo
      void supabase
        .rpc("log_kb_citation", {
          p_session_id: sessionId,
          p_persona_key: personaKey,
          p_company_id: companyId,
          p_user_query: query.slice(0, 500),
          p_doc_ids: docIds,
          p_override_ids: overrideIds,
          p_similarity_scores: sims,
          p_used_in_response: true,
        })
        .then((res) => {
          // Fallback al tracker v1 se la nuova RPC non esiste
          if (res.error && /function .* does not exist/i.test(res.error.message ?? "")) {
            void supabase.rpc("silvio_kb_track_citation", { p_doc_ids: docIds });
          }
        });
    }

    return jsonRes({
      ok: true,
      query,
      persona_key: personaKey,
      kb_sections: kbSections,
      company_id: companyId,
      embed_ms: embedMs,
      vector_ms: vectorMs,
      rerank_ms: rerankMs,
      rerank_used: rerankUsed,
      candidates_fetched: results?.length ?? 0,
      total_ms: Date.now() - t0,
      results: chunks.map((c) => ({
        result_type: c.result_type ?? "kb_chunk",
        doc_id: c.doc_id,
        chunk_id: c.chunk_id,
        title: c.title,
        // Limit content excerpt to 800 char per chunk per non saturare il prompt
        content: c.content.slice(0, 800),
        kb_section: c.kb_section,
        kb_subsection: c.kb_subsection,
        kb_priority: c.kb_priority,
        kb_source_book: c.kb_source_book,
        persona_keys: c.persona_keys,
        similarity: Number(c.similarity),
        rerank_score: c.rerank_score,
        // ⚠️ DECISIONE 2: nessuna `citation` field nel response payload.
        // Silvio integra il contenuto nella sua voce nativa senza citare.
        override_rationale: c.override_rationale,
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

// ─── Cohere rerank-3.5 ─────────────────────────────────────────────────────
// Docs: https://docs.cohere.com/reference/rerank
// Modello: rerank-multilingual-v3.0 (italiano supportato out-of-the-box)
// Costo: ~$1 / 1k searches → trascurabile
//
// Riordina top-K candidati per relevanza vs query, ritorna top-N richiesti.
async function cohereRerank<T extends { content: string; title: string; kb_section: string; kb_subsection: string }>(
  apiKey: string,
  query: string,
  candidates: T[],
  topN: number,
): Promise<Array<T & { rerank_score: number }> | null> {
  // Build documents: title + sezione + content (max 2000 char per doc)
  const documents = candidates.map((c) => {
    const header = `§${c.kb_section}.${c.kb_subsection} — ${c.title}`;
    const body = c.content.slice(0, 2000);
    return `${header}\n${body}`;
  });

  const res = await fetch("https://api.cohere.com/v2/rerank", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "rerank-multilingual-v3.0",
      query,
      documents,
      top_n: Math.min(topN, candidates.length),
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Cohere rerank ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json() as {
    results: Array<{ index: number; relevance_score: number }>;
  };

  if (!Array.isArray(data?.results) || data.results.length === 0) {
    return null;
  }

  return data.results.map((r) => ({
    ...candidates[r.index],
    rerank_score: r.relevance_score,
  }));
}
