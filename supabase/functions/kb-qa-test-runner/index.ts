/**
 * kb-qa-test-runner — Esegue Q&A regression test con embedding REALE.
 *
 * Differenza dal RPC kb_run_qa_tests (full-text fallback):
 *   1. Embedda la question via OpenAI text-embedding-3-small
 *   2. Chiama kb_test_query con il vector → vector search reale
 *   3. Verifica che almeno uno dei must_cite_doc_ids sia nei top-k
 *   4. Verifica che il content dei chunks NON contenga forbidden_phrases
 *   5. Aggiorna last_status + last_run_details su ai_kb_qa_pairs
 *
 * Body:
 *   { qa_pair_id?: uuid, run_all?: boolean, top_k?: number }
 *
 * Auth: super_admin only (verificato via service role check su user_roles)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateEmbedding } from "../_shared/brainEmbed.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface QaPair {
  id: string;
  question: string;
  expected_answer: string;
  must_cite_doc_ids: string[];
  forbidden_phrases: string[];
  min_similarity: number;
}

interface RunResult {
  qa_pair_id: string;
  question: string;
  status: "ok" | "ko" | "error";
  matched_doc_ids: string[];
  expected_doc_ids: string[];
  forbidden_phrases_hit: string[];
  top_similarity: number | null;
  duration_ms: number;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    // Auth: estraiamo l'utente dal JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const userRes = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    const userId = userRes.data?.user?.id;
    if (!userId) {
      return jsonRes({ error: "Unauthorized" }, 401);
    }

    // Verifica super_admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleData) {
      return jsonRes({ error: "Permesso negato: solo super_admin" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const qaPairId: string | undefined = body.qa_pair_id;
    const topK: number = Math.min(Math.max(body.top_k ?? 5, 1), 20);

    // Carica Q&A pairs da testare
    const { data: pairs, error: pairsErr } = await supabase
      .from("ai_kb_qa_pairs")
      .select("id, question, expected_answer, must_cite_doc_ids, forbidden_phrases, min_similarity")
      .eq("enabled", true)
      .match(qaPairId ? { id: qaPairId } : {});

    if (pairsErr) {
      return jsonRes({ error: pairsErr.message }, 500);
    }

    if (!pairs || pairs.length === 0) {
      return jsonRes({
        results: [],
        summary: { total: 0, ok: 0, ko: 0, error: 0 },
        message: "Nessun Q&A pair attivo da testare",
      });
    }

    const results: RunResult[] = [];

    // Esegui test sequenziali (embedding API rate limits)
    for (const pair of pairs as QaPair[]) {
      const t0 = Date.now();
      try {
        // 1. Embed query
        const embedding = await generateEmbedding(pair.question);

        // 2. Vector search via RPC
        const { data: matches, error: matchErr } = await supabase.rpc("kb_test_query", {
          p_query: pair.question,
          p_query_embedding: embedding,
          p_top_k: topK,
          p_min_similarity: pair.min_similarity ?? 0.20,
        });

        if (matchErr) throw new Error(`RPC kb_test_query: ${matchErr.message}`);

        const matched = (matches ?? []) as Array<{
          doc_id: string;
          content_preview: string;
          similarity: number;
        }>;
        const matchedDocIds = matched.map((m) => m.doc_id);
        const topSim = matched[0]?.similarity ?? null;

        // 3. Forbidden phrases check sul content recuperato
        const concatContent = matched.map((m) => m.content_preview).join(" ").toLowerCase();
        const forbiddenHit = (pair.forbidden_phrases ?? []).filter((p) =>
          concatContent.includes(p.toLowerCase())
        );

        // 4. Verdict
        const expectedIds = pair.must_cite_doc_ids ?? [];
        const mustCiteSatisfied =
          expectedIds.length === 0 || matchedDocIds.some((id) => expectedIds.includes(id));
        const noForbidden = forbiddenHit.length === 0;
        const verdict: "ok" | "ko" = mustCiteSatisfied && noForbidden ? "ok" : "ko";

        const result: RunResult = {
          qa_pair_id: pair.id,
          question: pair.question,
          status: verdict,
          matched_doc_ids: matchedDocIds,
          expected_doc_ids: expectedIds,
          forbidden_phrases_hit: forbiddenHit,
          top_similarity: topSim ? Number(topSim) : null,
          duration_ms: Date.now() - t0,
        };

        // 5. Persist last_run su ai_kb_qa_pairs
        await supabase
          .from("ai_kb_qa_pairs")
          .update({
            last_status: verdict,
            last_run_at: new Date().toISOString(),
            last_run_details: {
              matched_doc_ids: matchedDocIds,
              expected_doc_ids: expectedIds,
              forbidden_phrases_hit: forbiddenHit,
              top_similarity: topSim,
              method: "real_embedding",
              duration_ms: result.duration_ms,
            },
          })
          .eq("id", pair.id);

        results.push(result);
      } catch (e) {
        results.push({
          qa_pair_id: pair.id,
          question: pair.question,
          status: "error",
          matched_doc_ids: [],
          expected_doc_ids: pair.must_cite_doc_ids ?? [],
          forbidden_phrases_hit: [],
          top_similarity: null,
          duration_ms: Date.now() - t0,
          error: e instanceof Error ? e.message : String(e),
        });

        await supabase
          .from("ai_kb_qa_pairs")
          .update({
            last_status: "error",
            last_run_at: new Date().toISOString(),
            last_run_details: {
              error: e instanceof Error ? e.message : String(e),
            },
          })
          .eq("id", pair.id);
      }
    }

    const summary = {
      total: results.length,
      ok: results.filter((r) => r.status === "ok").length,
      ko: results.filter((r) => r.status === "ko").length,
      error: results.filter((r) => r.status === "error").length,
      pass_rate: results.length > 0
        ? Math.round((results.filter((r) => r.status === "ok").length / results.length) * 100)
        : 0,
    };

    return jsonRes({ results, summary });
  } catch (e) {
    console.error("kb-qa-test-runner error:", e);
    return jsonRes(
      { error: e instanceof Error ? e.message : String(e) },
      500
    );
  }
});

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
