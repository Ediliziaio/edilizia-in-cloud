// generate-room-render — Edge Function EiC
// Render Stanza (Room/Interiors) AI — Multi-Provider (OpenAI / Gemini)
// Prompt Engine stanza-v1.0.0

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { deductRenderCreditSafe, refundRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";
import { pickProviderSize, prepareInputImage } from "../_shared/renderImage.ts";
import { bytesToBase64 } from "../_shared/base64.ts";
import { runOpenAIImageEditWithFallback } from "../_shared/openaiImageEdit.ts";
import { buildRoomPrompt } from "../../../shared/render-room/stanzaPromptBuilder.ts";
import type { RoomPhotoMeta } from "../../../shared/render-room/types.ts";

// ── fetchWithRetry ──────────────────────────────────────────────────────────
async function fetchWithRetry(url: string, options: RequestInit, retries = 2, delayMs = 2000): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || i === retries) return res;
      // Non-ok but retryable (5xx)
      if (res.status < 500) return res;
    } catch (err) {
      if (i === retries) throw err;
    }
    await new Promise(r => setTimeout(r, delayMs * (i + 1)));
  }
  throw new Error("fetchWithRetry: all retries exhausted");
}

// ── CORS ─────────────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

declare const EdgeRuntime: { waitUntil?: (promise: Promise<unknown>) => void } | undefined;

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
  if (typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime?.waitUntil === "function") {
    EdgeRuntime.waitUntil(promise);
    return;
  }

  promise.catch((err) => {
    console.error("[generate-room-render] background fallback error:", err);
  });
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

    const existingResults = Array.isArray(session.result_urls) ? session.result_urls : [];
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
      companyId:  companyId as string,
      sessionId:  session_id,
      userId:     user.id,
      reasonMeta: { vertical: "stanza", edge_fn: "generate-room-render" },
      logTag:     "generate-room-render",
    });
    if (deductResult.status === "insufficient") {
      throw new Error("insufficient_credits");
    }
    creditDeducted = true;

    // Get default provider
    const { data: provider } = await supabase
      .from("render_provider_config")
      .select("*")
      .eq("is_active", true)
      .eq("is_default", true)
      .single();
    if (!provider) throw new Error("No active render provider configured");

    // Get API key from platform_settings (schema: key TEXT PK, value TEXT NOT NULL)
    // Fallback chain: DB → Supabase edge secret (OPENAI_API_KEY / GEMINI_API_KEY).
    const platformKeyName = `render_${provider.provider_key}_api_key`;
    const { data: keyRow } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", platformKeyName)
      .maybeSingle();
    const envName = `${provider.provider_key.toUpperCase()}_API_KEY`;
    const apiKey =
      (keyRow as { value: string } | null)?.value?.trim() ||
      Deno.env.get(envName)?.trim() ||
      "";
    if (!apiKey) throw new Error(`API key not configured for ${provider.provider_key}. Configurarla in Admin > Impostazioni AI > Render o come Supabase secret ${envName}.`);

    // Update session status
    await supabase
      .from("render_stanza_sessions")
      .update({
        status: "processing",
        processing_started_at: new Date().toISOString(),
        provider_key: provider.provider_key,
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
    if (!imageUrl) throw new Error("Cannot get signed URL for original photo");

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

    // ── Call provider ────────────────────────────────────────────────────────
    let resultImageUrl: string | null = null;
    let modelUsed = provider.model || "";

    if (provider.provider_key === "openai") {
      const imgResp = await fetch(imageUrl);
      if (!imgResp.ok) throw new Error(`Impossibile leggere la foto originale (${imgResp.status})`);
      const imgBlob = await imgResp.blob();
      const size = pickProviderSize(prepared.effective_width, prepared.effective_height, "openai") ?? "1024x1024";
      const openaiResult = await runOpenAIImageEditWithFallback({
        apiKey,
        prompt: fullPrompt,
        image: imgBlob,
        filename: "room.png",
        size,
        quality: provider.quality || "high",
        configuredModel: provider.model || "gpt-image-1",
        fetcher: fetchWithRetry,
      });
      modelUsed = openaiResult.modelUsed;
      if (openaiResult.fallbackErrors.length > 0) {
        console.warn("generate-room-render OpenAI model fallback:", openaiResult.fallbackErrors.join(" | "));
      }
      const openaiData = openaiResult.data as { data?: Array<{ b64_json?: string; url?: string }> };

      // Handle both b64_json and url response formats
      if (openaiData.data?.[0]?.b64_json) {
        // Upload base64 to storage
        const b64 = openaiData.data[0].b64_json;
        const binaryStr = atob(b64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const resultPath = `${companyId}/${session_id}_result.png`;
        const { error: uploadErr } = await supabase.storage
          .from("stanza-results")
          .upload(resultPath, bytes, { contentType: "image/png", upsert: true });
        if (uploadErr) throw new Error(`Upload result failed: ${uploadErr.message}`);

        const { data: publicUrl } = supabase.storage
          .from("stanza-results")
          .getPublicUrl(resultPath);
        resultImageUrl = publicUrl.publicUrl;
      } else if (openaiData.data?.[0]?.url) {
        // Download and re-upload
        const dlResp = await fetch(openaiData.data[0].url);
        const dlBlob = await dlResp.blob();
        const resultPath = `${companyId}/${session_id}_result.png`;
        const { error: uploadErr } = await supabase.storage
          .from("stanza-results")
          .upload(resultPath, dlBlob, { contentType: "image/png", upsert: true });
        if (uploadErr) throw new Error(`Upload result failed: ${uploadErr.message}`);

        const { data: publicUrl } = supabase.storage
          .from("stanza-results")
          .getPublicUrl(resultPath);
        resultImageUrl = publicUrl.publicUrl;
      }
    } else if (provider.provider_key === "gemini") {
      // Google Gemini Imagen
      const imgResp = await fetch(imageUrl);
      const imgBlob = await imgResp.blob();
      const imgArrayBuffer = await imgBlob.arrayBuffer();
      const imgBase64 = bytesToBase64(imgArrayBuffer);

      const geminiResp = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/${provider.model || "gemini-2.0-flash-exp"}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: fullPrompt },
                {
                  inlineData: {
                    mimeType: imgBlob.type || "image/jpeg",
                    data: imgBase64,
                  },
                },
              ],
            }],
            generationConfig: {
              responseModalities: ["IMAGE", "TEXT"],
              temperature: 0.35,
            },
          }),
        }
      );

      if (!geminiResp.ok) {
        const errBody = await geminiResp.text();
        throw new Error(`Gemini API error: ${geminiResp.status} ${errBody}`);
      }

      const geminiData = await geminiResp.json();
      const parts = geminiData.candidates?.[0]?.content?.parts ?? [];
      const imagePart = parts.find((p: { inlineData?: { mimeType: string; data: string } }) => p.inlineData?.mimeType?.startsWith("image/"));

      if (imagePart?.inlineData?.data) {
        const b64 = imagePart.inlineData.data;
        const binaryStr = atob(b64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const mimeType = imagePart.inlineData.mimeType || "image/png";
        const ext = mimeType.includes("jpeg") ? "jpg" : "png";
        const resultPath = `${companyId}/${session_id}_result.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("stanza-results")
          .upload(resultPath, bytes, { contentType: mimeType, upsert: true });
        if (uploadErr) throw new Error(`Upload result failed: ${uploadErr.message}`);

        const { data: publicUrl } = supabase.storage
          .from("stanza-results")
          .getPublicUrl(resultPath);
        resultImageUrl = publicUrl.publicUrl;
      }
    }

    if (!resultImageUrl) {
      throw new Error("No image generated by provider");
    }

    // ── Update session as completed ──────────────────────────────────────────
    await supabase
      .from("render_stanza_sessions")
      .update({
        status: "completed",
        result_urls: [resultImageUrl],
        processing_completed_at: new Date().toISOString(),
        cost_real: provider.cost_real_per_render,
        cost_billed: provider.cost_billed_per_render,
        config_snapshot: {
          ...(session.config_snapshot || {}),
          provider_model_used: modelUsed,
        },
      })
      .eq("id", session_id);

    // Credit già dedotto pre-flight via deductRenderCreditSafe (atomico + audit).
    // NON chiamare decrement_render_credits qui: causerebbe doppio addebito.

    // Update provider stats
    await supabase
      .from("render_provider_config")
      .update({ renders_generated: (provider.renders_generated || 0) + 1 })
      .eq("id", provider.id);

    return new Response(
      JSON.stringify({
        success: true,
        session_id,
        result_url: resultImageUrl,
        result_urls: [resultImageUrl],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    })().catch(async (jobErr: unknown) => {
      const message = jobErr instanceof Error ? jobErr.message : String(jobErr);
      console.error("generate-room-render background error:", message);
      await refundRenderCreditSafe(supabase, {
        companyId: companyId as string,
        sessionId: session_id,
        userId: user.id,
        reasonMeta: { vertical: "stanza", edge_fn: "generate-room-render", error: message.substring(0, 500) },
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
            reasonMeta: { vertical: "stanza", edge_fn: "generate-room-render", error: message.substring(0, 500) },
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
      }
    );
  }
});
