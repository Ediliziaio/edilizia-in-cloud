// generate-render — Edge Function EiC (REFACTORED 2026-05-14)
// Render Infissi AI — pipeline unificata via _shared/ai-provider/
//
// Cambiamenti rispetto alla versione precedente:
//   ✓ Eliminata la vecchia fallback chain image legacy
//   ✓ Eliminato resolveRenderSize duplicato (ora in image.ts)
//   ✓ Eliminato l'helper legacy di fallback OpenAI (chain ora gestita in image.ts)
//   ✓ Eliminate fetch dirette a OpenAI/Gemini (tutto via _shared/ai-provider/)
//   ✓ Validation prima del deduct credito (no più refund inutili)
//   ✓ Idempotency key (no doppia generazione su doppio click)
//   ✓ Refund log esplicito (no più catch silenzioso)
//   ✓ Prompt original salvato separato dal retry
//   ✓ Logging strutturato JSON
//   ✓ provider_chain_used tracking
//
// Routing:
//   image edit  → Gemini diretto → OpenRouter Gemini
//   QA vision   → Gemini Flash → Claude Haiku → GPT-4o mini
//
// NON modifica la pipeline di prompt engineering in shared/render-window/.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { captureRealCost } from "../_shared/renderCost.ts";
import { prepareInputImage } from "../_shared/renderImage.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import {
  deductRenderCreditSafe,
  refundRenderCreditSafe,
} from "../_shared/renderCreditDeduct.ts";
import {
  editImage,
  type ImageProviderAttempt,
} from "../_shared/ai-provider/image.ts";
import { callVisionQa } from "../_shared/ai-provider/visionQa.ts";
import { buildWindowPrompt } from "../../../shared/render-window/windowPromptBuilder.ts";
import type { WindowRenderConfig } from "../../../shared/render-window/types.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Helpers logging strutturato ──────────────────────────────────────────────
function logInfo(args: Record<string, unknown>) {
  console.log(JSON.stringify({ lvl: "info", fn: "generate-render", ...args }));
}
function logWarn(args: Record<string, unknown>) {
  console.warn(JSON.stringify({ lvl: "warn", fn: "generate-render", ...args }));
}
function logError(args: Record<string, unknown>) {
  console.error(
    JSON.stringify({ lvl: "error", fn: "generate-render", ...args }),
  );
}

function uint8ToBase64(uint8: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < uint8.length; i += chunkSize) {
    binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// ── Idempotency key ──────────────────────────────────────────────────────────
function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableJsonValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableJsonValue(item)]),
    );
  }
  return value;
}

async function computeIdempotencyKey(
  sessionId: string,
  config: unknown,
): Promise<string> {
  const data = new TextEncoder().encode(
    `${sessionId}:${JSON.stringify(stableJsonValue(config))}`,
  );
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map((b) => b.toString(16).padStart(2, "0")).join("").substring(
    0,
    32,
  );
}

// ── QA helpers ───────────────────────────────────────────────────────────────
function getMotorizedManualCleanupTargets(config: WindowRenderConfig): Array<{
  openingId: string;
  openingLabel: string;
  placementNotes: string;
}> {
  return config.technical_specification.flatMap((spec) => {
    const opening = config.scene_analysis.openings.find((item) =>
      item.id === spec.openingId
    );
    if (
      !opening || !spec.shutter.isMotorized ||
      (!opening.hasBelt && !opening.hasBeltBox)
    ) return [];
    return [{
      openingId: opening.id,
      openingLabel: opening.label,
      placementNotes: opening.beltPlacementNotes ||
        "manual control visible near the opening side wall/reveal",
    }];
  });
}

function buildMotorizedQaPrompt(config: WindowRenderConfig): string {
  const targets = getMotorizedManualCleanupTargets(config);
  return `Compare TWO IMAGES.
Image 1 = SOURCE PHOTO.
Image 2 = CANDIDATE WINDOW RENDER.

We selected MOTORIZED roller shutters for these target openings:
${
    targets.map((t) => `- Opening ${t.openingLabel}: ${t.placementNotes}`).join(
      "\n",
    )
  }

Strict compliance rule:
- If a shutter is motorized, NO manual control can remain visible.
- Fail if you see any belt, cord, strap, wall winder, wall plate, belt slot, or leftover vertical manual-control trim near the target opening.
- A visible vertical manual-control assembly on the side wall/reveal means FAIL.
- Ignore the window hardware itself; evaluate only old shutter manual controls.

Return ONLY JSON:
{"pass": boolean, "issues": ["short issue 1", "short issue 2"]}`;
}

function buildRetryPrompt(
  basePrompt: string,
  config: WindowRenderConfig,
  issues: string[],
): string {
  const targets = getMotorizedManualCleanupTargets(config);
  const targetLines = targets.map(
    (t) =>
      `- Opening ${t.openingLabel}: remove the entire old manual shutter-control assembly exactly where it appears (${t.placementNotes}).`,
  );
  const issueLines = issues.length > 0 ? issues.map((i) => `- ${i}`) : [
    "- The previous render still showed a legacy manual shutter-control element even though motorization was selected.",
  ];

  return `${basePrompt}

[CRITICAL CORRECTIVE RETRY – MANUAL SHUTTER CONTROL MUST DISAPPEAR]
The previous attempt is NON-COMPLIANT because a legacy manual shutter-control element is still visible.

Observed issues:
${issueLines.join("\n")}

Mandatory correction:
${targetLines.join("\n")}
- Remove any remaining belt, cord, strap, wall winder, wall plate, belt slot or leftover vertical manual-control trim.
- Repair the adjacent wall/tile finish seamlessly so the old manual system leaves ZERO visible trace.
- Keep the same exact room, geometry, crop, lighting and window proportions. Only fix the leftover manual-control artifact.`;
}

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  let supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  let user = { id: "" };
  let refundableSessionId: string | null = null;
  let refundableCompanyId: string | null = null;
  let creditDeducted = false;
  const providerChain: Array<{
    model: string;
    attempt: number;
    ok: boolean;
    latency_ms?: number;
    error?: string;
    provider?: string;
    provider_attempts?: number;
    tier?: number;
    code?: string;
    status?: number;
  }> = [];

  try {
    const auth = await requireAuth(req, CORS);
    supabase = auth.supabaseAdmin;
    user = { id: auth.userId };

    // ── Parse request ─────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { session_id, config, target_width, target_height } = body as {
      session_id?: string;
      config?: Record<string, unknown>;
      target_width?: number;
      target_height?: number;
    };

    if (!session_id) {
      return new Response(
        JSON.stringify({
          error: "validation_error",
          message: "session_id is required",
        }),
        {
          status: 400,
          headers: { ...CORS, "Content-Type": "application/json" },
        },
      );
    }
    refundableSessionId = session_id;

    const { data: session, error: sessionErr } = await supabase
      .from("render_sessions")
      .select("*")
      .eq("id", session_id)
      .single();

    if (sessionErr || !session) {
      return new Response(
        JSON.stringify({ error: "not_found", message: "Sessione non trovata" }),
        {
          status: 404,
          headers: { ...CORS, "Content-Type": "application/json" },
        },
      );
    }
    refundableCompanyId = session.company_id as string;

    const allowed = await canAccessCompany(
      supabase,
      user.id,
      session.company_id as string,
    );
    if (!allowed) {
      return new Response(
        JSON.stringify({
          error: "forbidden",
          message: "Accesso negato alla sessione render",
        }),
        {
          status: 403,
          headers: { ...CORS, "Content-Type": "application/json" },
        },
      );
    }

    // ── Build prompt + validate PRIMA del deduct credito ──────────────────
    const rawConfig =
      (config || (session.config as Record<string, unknown>) || {}) as Record<
        string,
        unknown
      >;
    const {
      systemPrompt,
      userPrompt,
      negativePrompt,
      promptVersion,
      blocks,
      validation,
      normalizedConfig,
    } = buildWindowPrompt(
      rawConfig,
      (session as Record<string, unknown>).foto_analisi || {},
    );

    if (!validation.isValid) {
      logWarn({
        session_id,
        msg: "prompt_validation_failed_pre_deduct",
        missing_sections: validation.missingSections,
        missing_rules: validation.missingBusinessRules,
      });
      return new Response(
        JSON.stringify({
          error: "validation_error",
          message: `Configurazione render incompleta: ${
            validation.missingSections.join(", ") || "regole business mancanti"
          }`,
        }),
        {
          status: 400,
          headers: { ...CORS, "Content-Type": "application/json" },
        },
      );
    }

    // ── Idempotency check ─────────────────────────────────────────────────
    const idempotencyKey = await computeIdempotencyKey(session_id, rawConfig);
    if (
      session.idempotency_key === idempotencyKey &&
      session.status === "completed" &&
      Array.isArray(session.result_urls) &&
      session.result_urls.length > 0
    ) {
      logInfo({
        session_id,
        msg: "idempotent_cached_result",
        idempotency_key: idempotencyKey,
      });
      return new Response(
        JSON.stringify({
          success: true,
          session_id,
          result_url: session.result_urls[0],
          cached: true,
          prompt_version: session.prompt_version ?? promptVersion,
        }),
        {
          status: 200,
          headers: { ...CORS, "Content-Type": "application/json" },
        },
      );
    }

    // ── Deduct crediti ────────────────────────────────────────────────────
    const deductResult = await deductRenderCreditSafe(supabase, {
      companyId: session.company_id as string,
      sessionId: session_id,
      userId: user.id,
      reasonMeta: { vertical: "infissi", edge_fn: "generate-render" },
      logTag: "generate-render",
    });

    if (deductResult.status === "insufficient") {
      return new Response(
        JSON.stringify({
          error: "insufficient_credits",
          message: "Crediti render insufficienti",
        }),
        {
          status: 402,
          headers: { ...CORS, "Content-Type": "application/json" },
        },
      );
    }
    creditDeducted = true;
    const revenueEur = deductResult.revenue_eur;
    const purchaseId = deductResult.purchase_id;

    // ── Marca sessione processing + idempotency ──────────────────────────
    const originalPrompt = [
      systemPrompt,
      userPrompt,
      `[NEGATIVE CONSTRAINTS]\n${negativePrompt}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const processingUpdate = await supabase
      .from("render_sessions")
      .update({
        status: "processing",
        processing_started_at: new Date().toISOString(),
        idempotency_key: idempotencyKey,
        prompt_original: originalPrompt,
        prompt_version: promptVersion,
      })
      .eq("id", session_id);
    if (processingUpdate.error) {
      logWarn({
        session_id,
        msg: "processing_update_extended_columns_failed_fallback",
        error: processingUpdate.error.message,
      });
      await supabase
        .from("render_sessions")
        .update({
          status: "processing",
          processing_started_at: new Date().toISOString(),
          prompt_version: promptVersion,
        })
        .eq("id", session_id);
    }

    // ── Prepara immagine input ───────────────────────────────────────────
    const originalPath = session.original_photo_url as string;
    const prepared = await prepareInputImage({
      supabase,
      bucket: "render-originals",
      originalPath,
      hintWidth: target_width,
      hintHeight: target_height,
    });
    const imageUrl = prepared.url;

    // Scarica blob foto sorgente per passarlo al provider
    const imgResp = await fetch(imageUrl, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!imgResp.ok) {
      throw new Error(`Impossibile scaricare foto sorgente: ${imgResp.status}`);
    }
    const sourceBlob = await imgResp.blob();

    // ── Genera candidate render ──────────────────────────────────────────
    const appendProviderAttempts = (
      attempts: ImageProviderAttempt[],
      providerAttempts: number,
    ) => {
      attempts.forEach((attempt) => {
        providerChain.push({
          model: attempt.model,
          attempt: providerChain.length + 1,
          ok: attempt.ok,
          latency_ms: attempt.latencyMs,
          error: attempt.error,
          provider: attempt.provider,
          provider_attempts: providerAttempts,
          tier: attempt.tier,
          code: attempt.code,
          status: attempt.status,
        });
      });
    };

    const generateCandidate = async (promptText: string) => {
      try {
        const result = await editImage({
          prompt: promptText,
          sourceImageBlob: sourceBlob,
          effectiveWidth: prepared.effective_width ?? undefined,
          effectiveHeight: prepared.effective_height ?? undefined,
          negativePrompt,
          timeoutMs: 180_000,
          metadata: {
            task_kind: "render_image_edit",
            company_id: session.company_id as string,
            session_id,
          },
        });
        const attempts = result.attemptHistory?.length
          ? result.attemptHistory
          : [{
            model: result.modelUsed,
            provider: result.providerUsed,
            ok: true,
            tier: result.attempts,
            latencyMs: result.latencyMs,
          }];
        appendProviderAttempts(attempts, result.attempts);
        return result;
      } catch (err) {
        const attempts = (err as { attemptHistory?: ImageProviderAttempt[] })
          .attemptHistory;
        if (attempts?.length) {
          appendProviderAttempts(attempts, attempts.length);
        }
        throw err;
      }
    };

    let composedPrompt = originalPrompt;
    let candidate = await generateCandidate(composedPrompt);
    let generationAttempts = 1;

    // ── QA Vision: shutter motorizzata → verifica rimozione cinghia ─────
    const motorizedTargets = getMotorizedManualCleanupTargets(normalizedConfig);
    if (motorizedTargets.length > 0) {
      // Costruisci data URL della foto sorgente per il QA
      const sourceBuf = await sourceBlob.arrayBuffer();
      const sourceB64 = uint8ToBase64(new Uint8Array(sourceBuf));
      const sourceMime = sourceBlob.type || "image/jpeg";

      const qaResult = await callVisionQa({
        sourceImageDataUrl: `data:${sourceMime};base64,${sourceB64}`,
        candidateImageDataUrl: candidate.imageDataUrl,
        qaPrompt: buildMotorizedQaPrompt(normalizedConfig),
        metadata: {
          task_kind: "render_image_qa",
          company_id: session.company_id as string,
          session_id,
        },
      });

      if (qaResult.checked && !qaResult.pass) {
        logInfo({
          session_id,
          msg: "qa_failed_retry_corrective",
          issues: qaResult.issues,
        });
        composedPrompt = buildRetryPrompt(
          composedPrompt,
          normalizedConfig,
          qaResult.issues,
        );
        candidate = await generateCandidate(composedPrompt);
        generationAttempts = 2;
      }
    }

    // ── Upload risultato su Storage ──────────────────────────────────────
    const base64Data = candidate.imageDataUrl.replace(
      /^data:image\/\w+;base64,/,
      "",
    );
    const uint8 = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const resultPath =
      `${session.company_id}/${session_id}/render_${Date.now()}.png`;

    const { error: uploadErr } = await supabase.storage
      .from("render-results")
      .upload(resultPath, uint8, { contentType: "image/png", upsert: true });

    if (uploadErr) {
      throw new Error(`Errore upload risultato: ${uploadErr.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from("render-results")
      .getPublicUrl(resultPath);
    const resultUrl = publicUrlData.publicUrl;

    // ── Capture costo reale ──────────────────────────────────────────────
    const providerKey = candidate.providerUsed === "gemini_direct"
      ? "gemini"
      : candidate.providerUsed === "openrouter"
      ? "openrouter_image"
      : "openai";
    const providerRawResponse = {
      ...candidate.rawResponse,
      _provider_used: candidate.providerUsed,
      _model_used: candidate.modelUsed,
      _cost_usd: candidate.costUsd ?? null,
      _cost_is_estimated: candidate.costIsEstimated,
      _latency_ms: candidate.latencyMs,
    };
    const capture = await captureRealCost({
      supabase,
      providerKey,
      model: candidate.modelUsed,
      rawResponse: providerRawResponse,
      legacyFallbackEur: candidate.costUsd
        ? candidate.costUsd * 0.92 // USD→EUR approx
        : 0.039,
    });

    const costReal = capture.cost_eur * generationAttempts;
    const { data: providerConfig } = await supabase
      .from("render_provider_config")
      .select("id, cost_billed_per_render, renders_generated")
      .eq("provider_key", providerKey)
      .maybeSingle();
    const costBilled = Number(providerConfig?.cost_billed_per_render ?? 0.156);

    // ── Aggiorna render_sessions: completed ──────────────────────────────
    const activeConfig = normalizedConfig as unknown as Record<string, unknown>;
    const ni = (activeConfig?.nuovo_infisso as Record<string, unknown>) || {};

    const baseCompletedUpdate = {
      status: "completed",
      result_urls: [resultUrl],
      prompt_used: composedPrompt,
      prompt_blocks: blocks,
      prompt_version: promptVersion,
      prompt_char_count: composedPrompt.length,
      provider_key: providerKey,
      cost_real: costReal,
      cost_billed: costBilled,
      config_snapshot: activeConfig,
      processing_completed_at: new Date().toISOString(),
    };

    const extendedCompletedUpdate = {
      ...baseCompletedUpdate,
      prompt_retried: generationAttempts > 1,
      provider_chain_used: providerChain,
    };

    const economicsUpdate = {
      cost_real_api: costReal,
      revenue_eur: revenueEur,
      provider_usage: capture.usage,
      provider_model: candidate.modelUsed,
      provider_request_id: capture.request_id,
      vertical: "infissi",
      meta: {
        purchase_id: purchaseId,
        input_image: prepared.meta,
        generation_attempts: generationAttempts,
        provider_used: candidate.providerUsed,
        provider_key: providerKey,
      },
    };

    const fullUpdate = await supabase
      .from("render_sessions")
      .update({ ...extendedCompletedUpdate, ...economicsUpdate })
      .eq("id", session_id);

    if (fullUpdate.error) {
      logWarn({
        session_id,
        msg: "economics_columns_missing_fallback_legacy",
        error: fullUpdate.error.message,
      });
      await supabase.from("render_sessions").update(baseCompletedUpdate).eq(
        "id",
        session_id,
      );
    }

    if (providerConfig?.id) {
      await supabase
        .from("render_provider_config")
        .update({
          renders_generated: Number(providerConfig.renders_generated ?? 0) + 1,
        })
        .eq("id", providerConfig.id);
    }

    // ── Inserisce in render_gallery ──────────────────────────────────────
    const tagMat = (ni.materiale as string) || null;
    const tagCol = ((ni.colore as Record<string, string>)?.nome) || null;
    await supabase.from("render_gallery").insert({
      company_id: session.company_id,
      session_id,
      created_by: user.id,
      title: `Render ${new Date().toLocaleDateString("it-IT")}`,
      original_url: session.original_photo_url,
      render_url: resultUrl,
      tags: [tagMat, tagCol].filter(Boolean),
    });

    logInfo({
      session_id,
      msg: "render_completed",
      provider: candidate.providerUsed,
      provider_key: providerKey,
      model: candidate.modelUsed,
      attempts: generationAttempts,
      cost_real_eur: costReal,
    });

    return new Response(
      JSON.stringify({
        success: true,
        session_id,
        result_url: resultUrl,
        provider: candidate.providerUsed,
        model: candidate.modelUsed,
        attempts: generationAttempts,
        cost_billed: costBilled,
        prompt_version: promptVersion,
        prompt_char_count: composedPrompt.length,
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    logError({
      session_id: refundableSessionId,
      msg: "render_failed",
      error: msg,
    });

    if (creditDeducted && refundableCompanyId && refundableSessionId) {
      try {
        await refundRenderCreditSafe(supabase, {
          companyId: refundableCompanyId,
          sessionId: refundableSessionId,
          userId: user.id,
          reasonMeta: {
            vertical: "infissi",
            edge_fn: "generate-render",
            error: msg.substring(0, 500),
          },
          logTag: "generate-render",
        });
        logInfo({ session_id: refundableSessionId, msg: "credit_refunded_ok" });
      } catch (refundErr) {
        logError({
          session_id: refundableSessionId,
          msg: "refund_failed",
          error: String(refundErr),
        });
      }
    }

    if (refundableSessionId) {
      try {
        const failedUpdate = await supabase
          .from("render_sessions")
          .update({
            status: "failed",
            error_message: msg,
            provider_chain_used: providerChain,
          })
          .eq("id", refundableSessionId);
        if (failedUpdate.error) {
          logWarn({
            session_id: refundableSessionId,
            msg: "failed_update_extended_columns_failed_fallback",
            error: failedUpdate.error.message,
          });
          await supabase
            .from("render_sessions")
            .update({
              status: "failed",
              error_message: msg,
            })
            .eq("id", refundableSessionId);
        }
      } catch (updateErr) {
        logError({
          session_id: refundableSessionId,
          msg: "session_update_failed",
          error: String(updateErr),
        });
      }
    }

    return new Response(
      JSON.stringify({ error: "render_failed", message: msg }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
