/**
 * silvio-playbook-execute — Track 4 Playbook Orchestrator
 *
 * Riceve trigger → trova playbook match → data gathering (RPC paralleli) →
 * KB context (RAG) → AI generation strutturata → save in silvio_decision_log →
 * ritorna decision_id + proposal.
 *
 * Pipeline tipica: 3-9 secondi end-to-end.
 *
 * Input:
 *   {
 *     trigger_type: 'alert'|'rpc_threshold'|'user_request'|'scheduled'|'cron',
 *     trigger_source_type?: string,
 *     trigger_source_id?: string,  // uuid o text id
 *     alert_type?: string,
 *     company_id: string,
 *     persona_key?: string,        // default 'silvio'
 *     user_request_text?: string,
 *     override_playbook_id?: string,
 *   }
 *
 * Output:
 *   { success, decision_id, playbook_id, proposal: {...}, ai_meta: {...} }
 */

import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { buildSystemPrompt } from "../_shared/preambolo.ts";
import { chargeAndLogDirect, estimateEmbeddingUsage } from "../_shared/ai-provider/directApi.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

const EMBEDDING_MODEL = "text-embedding-3-small";

interface PlaybookRow {
  id: string;
  version: string;
  category: string;
  title: string;
  description: string | null;
  data_gathering: AnyObj[];
  diagnosis_questions: string[];
  options_template: AnyObj[];
  anti_patterns: AnyObj[];
  escalation: AnyObj;
  kpis_to_track: AnyObj[];
  kb_context_areas: string[];
  ai_prompt_template: string;
  ai_router_task_key: string;
  max_tokens_per_call: number;
  is_critical: boolean;
  tags: string[];
}

async function generateQueryEmbedding(apiKey: string, text: string): Promise<{ embedding: number[]; tokens: number }> {
  const r = await fetchWithTimeout("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
    timeoutMs: 60_000,
  });
  if (!r.ok) throw new Error(`embed ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return {
    embedding: data.data[0].embedding,
    tokens: Number(data.usage?.total_tokens ?? 0),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const cors = getCorsHeaders(req);

  try {
    if (req.method !== "POST") return errorResponse("POST only", 405, cors);

    const { userId, supabaseAdmin } = await requireAuth(req, cors);

    const body = await req.json().catch(() => ({}));
    const {
      trigger_type,
      trigger_source_type,
      trigger_source_id,
      alert_type,
      company_id,
      persona_key = "silvio",
      user_request_text,
      override_playbook_id,
    } = body as {
      trigger_type?: string;
      trigger_source_type?: string;
      trigger_source_id?: string;
      alert_type?: string;
      company_id?: string;
      persona_key?: string;
      user_request_text?: string;
      override_playbook_id?: string;
    };

    if (!company_id) return errorResponse("company_id required", 400, cors);
    if (!trigger_type && !override_playbook_id) {
      return errorResponse("trigger_type o override_playbook_id required", 400, cors);
    }

    await requireCompanyAccess(supabaseAdmin, userId, company_id, cors);

    // ── 1. Match / load playbook ──────────────────────────────────────────
    let playbook: PlaybookRow | null = null;
    if (override_playbook_id) {
      const { data, error } = await supabaseAdmin
        .from("silvio_playbook_definitions")
        .select("*")
        .eq("id", override_playbook_id)
        .eq("enabled", true)
        .maybeSingle();
      if (error) return errorResponse(`load override: ${error.message}`, 500, cors);
      playbook = data as PlaybookRow | null;
    } else {
      const { data, error } = await supabaseAdmin.rpc("silvio_playbook_match", {
        p_trigger_type: trigger_type,
        p_trigger_source_type: trigger_source_type ?? null,
        p_alert_type: alert_type ?? null,
      });
      if (error) return errorResponse(`match: ${error.message}`, 500, cors);
      const arr = (data ?? []) as PlaybookRow[];
      playbook = arr[0] ?? null;
    }

    if (!playbook) {
      return errorResponse(`no playbook matches trigger=${trigger_type} source=${trigger_source_type} alert=${alert_type}`, 404, cors);
    }

    // ── 2. Load persona ──────────────────────────────────────────────────
    const { data: personaPermission, error: personaPermissionError } = await supabaseAdmin.rpc("can_user_use_persona", {
      p_user_id: userId,
      p_persona_key: persona_key,
    });
    if (personaPermissionError) {
      return errorResponse(`persona permission: ${personaPermissionError.message}`, 500, cors);
    }
    if (!personaPermission?.allowed) {
      return errorResponse(`persona ${persona_key} non autorizzata: ${personaPermission?.reason ?? "rbac_denied"}`, 403, cors);
    }

    const { data: persona } = await supabaseAdmin
      .from("ai_personas")
      .select("system_prompt, kb_areas_filter")
      .eq("persona_key", persona_key)
      .maybeSingle();
    if (!persona) return errorResponse(`persona ${persona_key} not found`, 404, cors);

    // ── 3. Data gathering parallelo ──────────────────────────────────────
    const gathered: AnyObj = {};
    const gatherStart = Date.now();
    const promises = playbook.data_gathering.map(async (step: AnyObj) => {
      const params: AnyObj = { p_company_id: company_id, ...(step.params ?? {}) };
      try {
        const { data, error } = await supabaseAdmin.rpc(step.rpc as string, params);
        if (error) return [step.step, { error: error.message, rpc: step.rpc }];
        return [step.step, data];
      } catch (e) {
        return [step.step, { error: e instanceof Error ? e.message : String(e), rpc: step.rpc }];
      }
    });
    const results = await Promise.all(promises);
    for (const [k, v] of results) gathered[k as string] = v;
    const gatherDurationMs = Date.now() - gatherStart;

    // ── 4. KB context (RAG) ──────────────────────────────────────────────
    let kbContext = "";
    if (playbook.kb_context_areas && playbook.kb_context_areas.length > 0) {
      try {
          const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");
        if (OPENAI_KEY) {
          const queryText = user_request_text ?? `${playbook.title} ${playbook.description ?? ""}`;
          const { embedding, tokens: providerTokens } = await generateQueryEmbedding(OPENAI_KEY, queryText);
          const embeddingUsage = estimateEmbeddingUsage(queryText);
          const tokensIn = providerTokens || embeddingUsage.tokens;
          const costUsd = providerTokens
            ? Math.max(0.000001, (tokensIn / 1_000_000) * Number(Deno.env.get("AI_EMBEDDING_3_SMALL_USD_PER_1M_TOKENS") ?? "0.02"))
            : embeddingUsage.costUsd;
          await chargeAndLogDirect({
            supabase: supabaseAdmin,
            company_id,
            task_kind: "chat_routine",
            model_used: `openai/${EMBEDDING_MODEL}`,
            cost_usd_real: costUsd,
            cost_is_estimated: !providerTokens,
            tokens_prompt: tokensIn,
            metadata: {
              user_id: userId,
              playbook_id: playbook.id,
              trigger_type: trigger_type ?? null,
              persona_key,
              stage: "playbook_rag_embedding",
            },
          });
          const { data: chunks } = await supabaseAdmin.rpc("match_brain", {
            p_company_id: company_id,
            p_query_embedding: `[${embedding.join(",")}]`,
            p_match_count: 5,
            p_min_similarity: 0.72,
            p_source_types: ["kb_universal"],
            p_include_universal: true,
            p_universal_categories: playbook.kb_context_areas,
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          kbContext = ((chunks ?? []) as any[]).map((c) => `### ${c.title}\n${c.content}`).join("\n\n");
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes("AI ledger charge failed")) {
          return errorResponse(`KB RAG ledger: ${message}`, 502, cors);
        }
        console.warn(`[playbook-execute] KB RAG skipped: ${message}`);
      }
    }

    // ── 5. Build prompt ───────────────────────────────────────────────────
    const userPrompt = playbook.ai_prompt_template
      .replace("{data_gathered}", JSON.stringify(gathered, null, 2))
      .replace("{kb_context}", kbContext || "(nessun chunk rilevante trovato)")
      .replace("{diagnosis_questions}", "- " + (playbook.diagnosis_questions ?? []).join("\n- "))
      .replace("{anti_patterns}", JSON.stringify(playbook.anti_patterns ?? []))
      .replace("{escalation}", JSON.stringify(playbook.escalation ?? {}))
      + (user_request_text ? `\n\nDOMANDA UTENTE: ${user_request_text}` : "");

    const { prompt: systemPromptComplete } = await buildSystemPrompt(supabaseAdmin, persona.system_prompt);

    // ── 6. AI call via aiRouter ───────────────────────────────────────────
    let aiResult;
    try {
      const idempotencyKey = await buildStableAiIdempotencyKey("playbook_execute", [
        company_id,
        userId,
        persona_key,
        playbook.id,
        playbook.version,
        trigger_type ?? null,
        trigger_source_type ?? null,
        trigger_source_id ?? null,
        alert_type ?? null,
        user_request_text ?? null,
        gathered,
      ]);
      aiResult = await aiRouterComplete({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabaseAdmin as any,
        taskKey: playbook.ai_router_task_key,
        messages: [
          { role: "system", content: systemPromptComplete },
          { role: "user", content: userPrompt },
        ],
        params: { temperature: 0.2, max_tokens: playbook.max_tokens_per_call },
        responseFormat: { type: "json_object" },
        companyId: company_id,
        userId,
        idempotencyKey,
      });
    } catch (e) {
      return errorResponse(`AI router: ${e instanceof Error ? e.message : String(e)}`, 502, cors);
    }

    // ── 7. Parse JSON output (robusto: strip markdown + estrazione { ... }) ────
    let parsed: AnyObj;
    let rawContent = aiResult.content.trim();
    // Strip ```json ... ``` o ``` ... ``` (anche solo apertura, casi truncati)
    rawContent = rawContent.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    // Estrai dalla prima { all'ultima } per gestire chunk extra
    const firstBrace = rawContent.indexOf("{");
    const lastBrace = rawContent.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      rawContent = rawContent.substring(firstBrace, lastBrace + 1);
    }
    try {
      parsed = JSON.parse(rawContent);
    } catch (e) {
      return errorResponse(
        `AI returned invalid JSON (parse: ${e instanceof Error ? e.message : "?"}): ${rawContent.slice(0, 400)}`,
        502, cors,
      );
    }

    // Validation minima
    if (!parsed.situation || !Array.isArray(parsed.options) || parsed.options.length === 0) {
      return errorResponse("AI proposal missing required fields (situation, options[])", 502, cors);
    }

    // ── 8. Save to silvio_decision_log ───────────────────────────────────
    let decisionId: string | null = null;
    try {
      const { data: dlData, error: dlErr } = await supabaseAdmin.rpc("silvio_decision_log_propose", {
        p_company_id: company_id,
        p_persona_key: persona_key,
        p_trigger_type: "playbook_orchestrator",
        p_trigger_source_type: "silvio_playbook_definitions",
        p_trigger_source_id: trigger_source_id ?? null,
        p_situation: String(parsed.situation).slice(0, 1000),
        p_diagnosis: String(parsed.diagnosis ?? "").slice(0, 2000),
        p_diagnosis_data: gathered,
        p_options: parsed.options,
        p_recommended: parsed.recommended_option_id ?? null,
        p_confidence: parsed.confidence ?? "medium",
        p_kpis_to_track: playbook.kpis_to_track,
        p_is_critical: playbook.is_critical,
        p_tags: playbook.tags ?? [],
        p_ai_model: aiResult.modelUsed,
        p_ai_tokens: aiResult.totalTokens,
        p_ai_cost_eur: aiResult.costRealEur,
        p_playbook_id: playbook.id,  // FIX bug audit: link diretto al playbook (text)
        p_trigger_metadata: {
          playbook_id: playbook.id,
          playbook_version: playbook.version,
          playbook_category: playbook.category,
          gathered_steps_count: Object.keys(gathered).length,
        },
      });
      if (dlErr) console.error("[playbook-execute] decision_log save:", dlErr.message);
      else decisionId = dlData as string;
    } catch (e) {
      console.error("[playbook-execute] decision_log exception:", e);
    }

    // ── 9. Return ─────────────────────────────────────────────────────────
    return jsonResponse({
      success: true,
      decision_id: decisionId,
      playbook_id: playbook.id,
      playbook_title: playbook.title,
      proposal: parsed,
      gathered_summary: Object.fromEntries(Object.entries(gathered).map(([k, v]) => [k, typeof v === "object" ? "ok" : v])),
      ai_meta: {
        model_used: aiResult.modelUsed,
        tokens: aiResult.totalTokens,
        cost_eur: aiResult.costRealEur,
        cost_billed_eur: aiResult.costBilledEur,
        gather_duration_ms: gatherDurationMs,
      },
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(err instanceof Error ? err.message : String(err), 500, getCorsHeaders(req));
  }
});
