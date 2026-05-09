/**
 * silvio-self-improvement — Self-improvement loop settimanale
 *
 * Triggered:
 *   • pg_cron 'silvio-self-improvement-weekly' (Domenica 03:00)
 *   • Manuale dal Silvio Hub (button "Esegui ora")
 *
 * Flow:
 *   1. RPC silvio_self_improvement_aggregate(7) → top_rated[] + bottom_rated[]
 *   2. Per ogni top_rated → embed risposta + insert ai_brain_documents come
 *      kb_section='gold_standard' (positive example da imitare)
 *   3. Per ogni bottom_rated → idem ma kb_section='avoid_pattern'
 *   4. RPC silvio_self_improvement_promote() → pattern usati >=5x salgono
 *      in silvio_persona_memory
 *   5. Insert silvio_self_improvement_log con counters
 *
 * Auth: service_role (cron) o super_admin (manuale).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateEmbedding, contentHash } from "../_shared/brainEmbed.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RatedRun {
  run_id: string;
  model_id: string | null;
  feature: string;
  user_rating: number;
  created_at: string;
  persona_key: string | null;
  response_excerpt: string;
  prompt_excerpt: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const t0 = Date.now();
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let body: { source?: string; days?: number } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const days = Math.min(Math.max(body.days ?? 7, 1), 30);

  // 1) Aggrega dataset
  const { data: agg, error: aggErr } = await supabase.rpc(
    "silvio_self_improvement_aggregate",
    { p_days: days },
  );
  if (aggErr) {
    console.error("[self-improvement] aggregate error:", aggErr);
    return new Response(JSON.stringify({ ok: false, error: aggErr.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const topRated: RatedRun[] = (agg?.top_rated ?? []) as RatedRun[];
  const bottomRated: RatedRun[] = (agg?.bottom_rated ?? []) as RatedRun[];
  const totalAnalyzed = agg?.total_rated_runs ?? 0;
  const periodStart = agg?.period_start;
  const periodEnd = agg?.period_end;

  let goldAdded = 0;
  let avoidAdded = 0;
  const errors: Array<{ run_id: string; error: string }> = [];

  // 2) Process gold standards
  for (const run of topRated) {
    if (!run.response_excerpt || run.response_excerpt.length < 60) continue;
    try {
      const fullText = `PROMPT: ${run.prompt_excerpt}\n\nRISPOSTA OTTIMA: ${run.response_excerpt}`;
      const hash = await contentHash(fullText);

      // Skip se già presente
      const { data: existing } = await supabase
        .from("ai_brain_documents")
        .select("id")
        .eq("source_hash", hash)
        .eq("scope", "silvio_admin")
        .maybeSingle();
      if (existing) continue;

      const embedding = await generateEmbedding(fullText);
      const personas = run.persona_key ? [run.persona_key] : [];

      const { error: insErr } = await supabase.from("ai_brain_documents").insert({
        scope: "silvio_admin",
        kb_section: "gold_standard",
        kb_subsection: "feedback_loop",
        title: `✅ Pattern vincente — ${run.persona_key ?? "general"} — ${run.run_id.slice(0, 8)}`,
        content: fullText,
        source_path: `feedback_loop:run/${run.run_id}`,
        source_hash: hash,
        embedding,
        persona_keys: personas,
        metadata: {
          source: "feedback_loop",
          source_run_id: run.run_id,
          model_id: run.model_id,
          rating: 5,
          hits_count: 0,
          created_via: body.source ?? "manual",
        },
      });
      if (insErr) {
        errors.push({ run_id: run.run_id, error: insErr.message });
      } else {
        goldAdded++;
      }
    } catch (e) {
      errors.push({ run_id: run.run_id, error: String(e) });
    }
  }

  // 3) Process avoid patterns
  for (const run of bottomRated) {
    if (!run.response_excerpt || run.response_excerpt.length < 60) continue;
    try {
      const fullText = `PROMPT: ${run.prompt_excerpt}\n\nRISPOSTA DA EVITARE: ${run.response_excerpt}\n\n(Florin ha votato 👎 — non replicare questo stile/contenuto)`;
      const hash = await contentHash(fullText);

      const { data: existing } = await supabase
        .from("ai_brain_documents")
        .select("id")
        .eq("source_hash", hash)
        .eq("scope", "silvio_admin")
        .maybeSingle();
      if (existing) continue;

      const embedding = await generateEmbedding(fullText);
      const personas = run.persona_key ? [run.persona_key] : [];

      const { error: insErr } = await supabase.from("ai_brain_documents").insert({
        scope: "silvio_admin",
        kb_section: "avoid_pattern",
        kb_subsection: "feedback_loop",
        title: `❌ Da evitare — ${run.persona_key ?? "general"} — ${run.run_id.slice(0, 8)}`,
        content: fullText,
        source_path: `feedback_loop:run/${run.run_id}`,
        source_hash: hash,
        embedding,
        persona_keys: personas,
        metadata: {
          source: "feedback_loop",
          source_run_id: run.run_id,
          model_id: run.model_id,
          rating: 1,
          hits_count: 0,
          created_via: body.source ?? "manual",
        },
      });
      if (insErr) {
        errors.push({ run_id: run.run_id, error: insErr.message });
      } else {
        avoidAdded++;
      }
    } catch (e) {
      errors.push({ run_id: run.run_id, error: String(e) });
    }
  }

  // 4) Promote frequently-cited patterns to persona memory
  let promoted = 0;
  try {
    const { data: prom, error: promErr } = await supabase.rpc(
      "silvio_self_improvement_promote",
    );
    if (promErr) {
      errors.push({ run_id: "_promote", error: promErr.message });
    } else {
      promoted = typeof prom === "number" ? prom : 0;
    }
  } catch (e) {
    errors.push({ run_id: "_promote", error: String(e) });
  }

  const durationMs = Date.now() - t0;

  // 5) Log run
  await supabase.from("silvio_self_improvement_log").insert({
    period_start: periodStart,
    period_end: periodEnd,
    runs_analyzed: totalAnalyzed,
    gold_added: goldAdded,
    avoid_added: avoidAdded,
    promoted_to_memory: promoted,
    gold_samples: topRated.slice(0, 5),
    avoid_samples: bottomRated.slice(0, 5),
    errors: errors.length > 0 ? errors : null,
    duration_ms: durationMs,
    ok: errors.length === 0,
  });

  return new Response(
    JSON.stringify({
      ok: true,
      period_days: days,
      runs_analyzed: totalAnalyzed,
      gold_added: goldAdded,
      avoid_added: avoidAdded,
      promoted_to_memory: promoted,
      errors_count: errors.length,
      duration_ms: durationMs,
    }),
    { headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
