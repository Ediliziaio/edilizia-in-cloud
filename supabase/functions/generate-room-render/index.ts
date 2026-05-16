// generate-room-render — Edge Function EiC
// Render Stanza (Room/Interiors) AI — Provider unificato OpenRouter + fallback
// Prompt Engine stanza-v1.0.0

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import {
  deductRenderCreditSafe,
  refundRenderCreditSafe,
} from "../_shared/renderCreditDeduct.ts";
import { captureRealCost } from "../_shared/renderCost.ts";
import { prepareInputImage } from "../_shared/renderImage.ts";
import { editImage } from "../_shared/ai-provider/image.ts";
import { buildRoomPrompt } from "../../../shared/render-room/stanzaPromptBuilder.ts";
import type { RoomPhotoMeta } from "../../../shared/render-room/types.ts";

// ── CORS ─────────────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

declare const EdgeRuntime:
  | { waitUntil?: (promise: Promise<unknown>) => void }
  | undefined;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function acceptedRenderResponse(sessionId: string) {
  return jsonResponse({
    success: true,
    accepted: true,
    session_id: sessionId,
    status: "processing",
  }, 202);
}

function runInBackground(promise: Promise<unknown>) {
  if (
    typeof EdgeRuntime !== "undefined" &&
    typeof EdgeRuntime?.waitUntil === "function"
  ) {
    EdgeRuntime.waitUntil(promise);
    return;
  }

  promise.catch((err) => {
    console.error("[generate-room-render] background fallback error:", err);
  });
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 120_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function dataUrlToBytes(
  dataUrl: string,
): { bytes: Uint8Array; mimeType: string; extension: string } {
  const match = dataUrl.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/,
  );
  if (!match) {
    throw new Error("Formato immagine provider non valido");
  }

  const mimeType = match[1];
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const extension = mimeType.includes("png")
    ? "png"
    : mimeType.includes("webp")
    ? "webp"
    : mimeType.includes("jpeg") || mimeType.includes("jpg")
    ? "jpg"
    : "png";

  return { bytes, mimeType, extension };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let refundableSessionId: string | null = null;
  let refundableCompanyId: string | null = null;
  let refundableUserId: string | null = null;
  let creditDeducted = false;

  try {
    const auth = await requireAuth(req, corsHeaders);
    const supabase = auth.supabaseAdmin;
    const user = { id: auth.userId };
    refundableUserId = user.id;

    const body = await req.json();
    const { session_id, config, target_width, target_height } = body;
    if (!session_id) throw new Error("session_id required");
    refundableSessionId = session_id;

    // Get session
    const { data: session, error: sessErr } = await supabase
      .from("render_stanza_sessions")
      .select("*")
      .eq("id", session_id)
      .single();
    if (sessErr || !session) throw new Error("Session not found");

    const companyId = session.company_id;
    refundableCompanyId = companyId as string;

    // FIX P1.3: ownership check impersonation-aware. In precedenza il file
    // assumeva che chiunque con il session_id potesse avviare il render: una
    // vulnerabilità tenant. Ora controlliamo esplicitamente tramite helper
    // che rispetta super_admin + active_impersonations + profiles.company_id.
    const allowed = await canAccessCompany(
      supabase,
      user.id,
      companyId as string,
    );
    if (!allowed) {
      throw new Error("forbidden: accesso negato alla sessione render stanza");
    }

    const existingResults = Array.isArray(session.result_urls)
      ? session.result_urls
      : [];
    if (session.status === "completed" && existingResults.length) {
      return jsonResponse({
        success: true,
        session_id,
        result_url: existingResults[0],
        result_urls: existingResults,
        already_completed: true,
      });
    }
    if (session.status === "processing") {
      return acceptedRenderResponse(session_id);
    }

    // FIX P2.1 + P3.1: credito deduct atomico PRE-flight con audit ledger.
    // Prima il codice faceva SELECT balance (non atomico) e poi
    // decrement_render_credits a render completato → race condition +
    // impossibile tracciare in ledger la sessione consumatrice.
    const deductResult = await deductRenderCreditSafe(supabase, {
      companyId: companyId as string,
      sessionId: session_id,
      userId: user.id,
      reasonMeta: { vertical: "stanza", edge_fn: "generate-room-render" },
      logTag: "generate-room-render",
    });
    if (deductResult.status === "insufficient") {
      throw new Error("insufficient_credits");
    }
    creditDeducted = true;

    // Update session status
    await supabase
      .from("render_stanza_sessions")
      .update({
        status: "processing",
        processing_started_at: new Date().toISOString(),
      })
      .eq("id", session_id);

    const renderJob = (async () => {
      const prepared = await prepareInputImage({
        supabase,
        bucket: "stanza-originals",
        originalPath: session.original_photo_url,
        hintWidth: target_width,
        hintHeight: target_height,
      });
      const imageUrl = prepared.url;
      if (!imageUrl) {
        throw new Error("Cannot get signed URL for original photo");
      }

      // Build prompt with the production room prompt engine. This replaces the
      // old flat descriptive prompt with a scene inventory + replacement manifest,
      // and reuses the floor rules when room-floor replacement is active.
      const cfg = config || session.config;
      const photoMeta: RoomPhotoMeta = {
        width: prepared.effective_width ?? target_width ?? null,
        height: prepared.effective_height ?? target_height ?? null,
        orientation: (prepared.effective_width && prepared.effective_height)
          ? prepared.effective_width > prepared.effective_height
            ? "landscape"
            : prepared.effective_width < prepared.effective_height
            ? "portrait"
            : "square"
          : null,
      };
      const {
        systemPrompt,
        userPrompt,
        promptVersion,
        blocks,
        normalizedConfig,
        validation,
      } = buildRoomPrompt(cfg, session.config_snapshot, photoMeta);
      const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

      // Store prompt
      await supabase
        .from("render_stanza_sessions")
        .update({
          prompt_used: fullPrompt,
          prompt_version: promptVersion,
          prompt_char_count: fullPrompt.length,
          prompt_blocks: blocks,
          config_snapshot: {
            ...normalizedConfig,
            prompt_validation: validation,
            input_image_meta: prepared.meta,
          },
        })
        .eq("id", session_id);

      // ── Call provider unificato ──────────────────────────────────────────────
      const imgResp = await fetchWithTimeout(imageUrl, {}, 30_000);
      if (!imgResp.ok) {
        throw new Error(
          `Impossibile leggere la foto originale (${imgResp.status})`,
        );
      }
      const imgBlob = await imgResp.blob();
      const providerResult = await editImage({
        prompt: fullPrompt,
        sourceImageBlob: imgBlob,
        effectiveWidth: prepared.effective_width ?? target_width ?? undefined,
        effectiveHeight: prepared.effective_height ?? target_height ??
          undefined,
        openaiQuality: "medium",
        timeoutMs: 180_000,
        metadata: {
          task_kind: "render_image_edit",
          company_id: companyId as string,
          session_id,
        },
      });
      const providerKey = providerResult.providerUsed === "openrouter"
        ? "openrouter_image"
        : "openai";
      const modelUsed = providerResult.modelUsed;
      const providerRawResponse = {
        ...providerResult.rawResponse,
        _provider_used: providerResult.providerUsed,
        _model_used: modelUsed,
        _cost_usd: providerResult.costUsd ?? null,
        _cost_is_estimated: providerResult.costIsEstimated,
        _latency_ms: providerResult.latencyMs,
      };
      const uploadPayload = dataUrlToBytes(providerResult.imageDataUrl);
      const resultPath =
        `${companyId}/${session_id}_result.${uploadPayload.extension}`;
      const { error: uploadErr } = await supabase.storage
        .from("stanza-results")
        .upload(resultPath, uploadPayload.bytes, {
          contentType: uploadPayload.mimeType,
          upsert: true,
        });
      if (uploadErr) {
        throw new Error(`Upload result failed: ${uploadErr.message}`);
      }

      const { data: publicUrl } = supabase.storage
        .from("stanza-results")
        .getPublicUrl(resultPath);
      const resultImageUrl = publicUrl.publicUrl;
      const capture = await captureRealCost({
        supabase,
        providerKey,
        model: modelUsed,
        rawResponse: providerRawResponse,
        legacyFallbackEur: Number(providerRawResponse._cost_usd ?? 0) > 0
          ? Number(providerRawResponse._cost_usd) * 0.92
          : 0.039,
      });
      const { data: providerConfig } = await supabase
        .from("render_provider_config")
        .select("id, cost_billed_per_render, renders_generated")
        .eq("provider_key", providerKey)
        .maybeSingle();
      const costReal = capture.cost_eur;
      const costBilled = Number(providerConfig?.cost_billed_per_render ?? 0.10);

      // ── Update session as completed ──────────────────────────────────────────
      await supabase
        .from("render_stanza_sessions")
        .update({
          status: "completed",
          result_urls: [resultImageUrl],
          processing_completed_at: new Date().toISOString(),
          provider_key: providerKey,
          cost_real: costReal,
          cost_billed: costBilled,
          config_snapshot: {
            ...normalizedConfig,
            prompt_validation: validation,
            input_image_meta: prepared.meta,
            provider_model_used: modelUsed,
            provider_attempts: providerResult.attempts,
          },
        })
        .eq("id", session_id);

      // Credit già dedotto pre-flight via deductRenderCreditSafe (atomico + audit).
      // NON chiamare decrement_render_credits qui: causerebbe doppio addebito.

      // Update provider stats
      if (providerConfig?.id) {
        await supabase
          .from("render_provider_config")
          .update({
            renders_generated: Number(providerConfig.renders_generated ?? 0) +
              1,
          })
          .eq("id", providerConfig.id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          session_id,
          result_url: resultImageUrl,
          result_urls: [resultImageUrl],
          provider: providerKey,
          model: modelUsed,
          attempts: providerResult.attempts,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    })().catch(async (jobErr: unknown) => {
      const message = jobErr instanceof Error ? jobErr.message : String(jobErr);
      console.error("generate-room-render background error:", message);
      await refundRenderCreditSafe(supabase, {
        companyId: companyId as string,
        sessionId: session_id,
        userId: user.id,
        reasonMeta: {
          vertical: "stanza",
          edge_fn: "generate-room-render",
          error: message.substring(0, 500),
        },
        logTag: "generate-room-render",
      });
      await supabase
        .from("render_stanza_sessions")
        .update({
          status: "failed",
          error_message: message,
          processing_completed_at: new Date().toISOString(),
        })
        .eq("id", session_id);
    });

    runInBackground(renderJob);
    return acceptedRenderResponse(session_id);
  } catch (err: unknown) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : String(err);
    console.error("generate-room-render error:", message);

    // Try to mark session as failed
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceKey);
      const body = await req.clone().json().catch(() => ({}));
      if (body.session_id) {
        if (creditDeducted && refundableCompanyId && refundableSessionId) {
          await refundRenderCreditSafe(supabase, {
            companyId: refundableCompanyId,
            sessionId: refundableSessionId,
            userId: refundableUserId,
            reasonMeta: {
              vertical: "stanza",
              edge_fn: "generate-room-render",
              error: message.substring(0, 500),
            },
            logTag: "generate-room-render",
          });
        }
        await supabase
          .from("render_stanza_sessions")
          .update({
            status: "failed",
            error_message: message,
            processing_completed_at: new Date().toISOString(),
          })
          .eq("id", body.session_id);
      }
    } catch { /* best effort */ }

    return new Response(
      JSON.stringify({ error: message }),
      {
        status: message.includes("insufficient_credits") ? 402 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
