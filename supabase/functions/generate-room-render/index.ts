// generate-room-render — Edge Function EiC
// Render Stanza (Room/Interiors) AI — Provider unificato OpenRouter + fallback
// Prompt Engine stanza-v1.0.0

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { deductRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";
import { captureRealCost } from "../_shared/renderCost.ts";
import { prepareInputImage } from "../_shared/renderImage.ts";
import { detectImageDimensions } from "../_shared/imageDimensions.ts";
import { editImage } from "../_shared/ai-provider/image.ts";
import { callVisionQa } from "../_shared/ai-provider/visionQa.ts";
import { buildRoomPrompt } from "../../../shared/render-room/stanzaPromptBuilder.ts";
import { rewriteDomainPrompt } from "../_shared/ai-provider/domainRewriter.ts";
import { ROOM_REWRITER_PROFILE } from "../_shared/ai-provider/roomRewriterProfile.ts";
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

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
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
    // ── F1-parity (audit 16/07) — CLAIM ATOMICO prima del deduct ─────────
    // Il guard read-then-act ("status === processing → accepted") lasciava
    // passare due invocation simultanee → doppio addebito. Il claim generico
    // (whitelist tabelle verticali) serializza con FOR UPDATE.
    const { data: claimRaw, error: claimErr } = await supabase.rpc(
      "claim_render_vertical_session",
      {
        _table: "render_stanza_sessions",
        _session_id: session_id,
        _stale_seconds: 170,
      },
    );
    if (claimErr) {
      throw new Error(`claim_render_vertical_session failed: ${claimErr.message}`);
    }
    const claim = claimRaw as {
      claimed: boolean;
      reason?: string;
      stale_takeover?: boolean;
    };
    if (!claim?.claimed) {
      return acceptedRenderResponse(session_id);
    }
    if (claim.stale_takeover) {
      // Tentativo morto: rimborsa il consume orfano PRIMA del nuovo deduct.
      await supabase.rpc("refund_render_credit_all", {
        _company_id: companyId,
        _session_id: session_id,
        _reason_meta: { source: "stale_takeover", edge_fn: "generate-room-render" },
      });
    }

    const deductResult = await deductRenderCreditSafe(supabase, {
      companyId: companyId as string,
      sessionId: session_id,
      userId: user.id,
      reasonMeta: { vertical: "stanza", edge_fn: "generate-room-render" },
      logTag: "generate-room-render",
    });
    if (deductResult.status === "insufficient") {
      await supabase.rpc("release_render_vertical_session", {
        _table: "render_stanza_sessions",
        _session_id: session_id,
      });
      throw new Error("insufficient_credits");
    }
    creditDeducted = true;

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
      let fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

      // META-PROMPT REWRITER (stesso path di qualita' degli infissi): un LLM
      // testuale riscrive il config in prosa breve, che i modelli immagine
      // rendono meglio dei blocchi di regole. Fallback silenzioso al prompt a
      // blocchi qui sopra se fallisce. Applicato PRIMA dello store, cosi'
      // prompt_used riflette cio' che e' stato davvero mandato al modello.
      try {
        const meta = await rewriteDomainPrompt(
          {
            config: { config: cfg, analisi: session.config_snapshot ?? {} },
            metadata: {
              task_kind: "render_prompt_rewrite",
              company_id: companyId as string,
              session_id,
            },
          },
          ROOM_REWRITER_PROFILE,
        );
        if (meta) {
          fullPrompt = [
            "You are an expert photorealistic Italian interior-restyling render artist. Edit the source photo as instructed below. Output a clean photograph-quality result.",
            meta.userPrompt,
            "Avoid: cartoon, painterly, fake CGI, dollhouse view, warped geometry, invented windows/doors, floating catalog objects.",
          ].join("\n\n");
          console.log(JSON.stringify({
            lvl: "info", fn: "generate-room-render", session_id,
            msg: "meta_prompt_active", rewriter_model: meta.modelUsed,
            rewriter_latency_ms: meta.latencyMs, prose_length: meta.userPrompt.length,
          }));
        } else {
          console.warn(JSON.stringify({
            lvl: "warn", fn: "generate-room-render", session_id,
            msg: "meta_prompt_fallback_to_blocks",
          }));
        }
      } catch (e) {
        console.warn(JSON.stringify({
          lvl: "warn", fn: "generate-room-render", session_id,
          msg: "meta_prompt_rewriter_threw", error: String((e as Error)?.message ?? e),
        }));
      }

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

      // RETE DI SICUREZZA SUL FORMATO. Le dimensioni della sorgente arrivano
      // solo da target_width/target_height nel body: il frontend le calcola da
      // img.naturalWidth, ma le invia solo se l'immagine si e' caricata. Se
      // mancano, pickOpenAISize non ha nulla su cui decidere e produce un
      // 1024x1024 quadrato da una foto landscape — il modello ricompone la
      // scena per riempire il quadrato e perde soffitto, aperture e
      // inquadratura. Qui le ricaviamo dai byte, come fa gia' il render bagno.
      let srcW = prepared.effective_width ?? target_width ?? undefined;
      let srcH = prepared.effective_height ?? target_height ?? undefined;
      if (!srcW || !srcH) {
        try {
          const probe = new Uint8Array(await imgBlob.slice(0, 65536).arrayBuffer());
          const dim = detectImageDimensions(probe);
          if (dim) {
            srcW = dim.width;
            srcH = dim.height;
            console.log(JSON.stringify({
              lvl: "info", fn: "generate-room-render", session_id,
              msg: "source_dimensions_detected_from_bytes", width: srcW, height: srcH,
            }));
          }
        } catch (_e) { /* niente: si resta sul default */ }
      }

      // F1-parity (audit 16/07) — Budget deadline-aware: il timeout fisso
      // 180s (con retry interni) superava il cap 150s dell'isolate →
      // sessione zombie + credito perso. 1 tentativo per tier, timeout
      // dal budget residuo.
      const STANZA_BUDGET_MS = 140_000;
      const jobStartMs = Date.now();
      const jobElapsed = () => Date.now() - jobStartMs;
      const generateCandidate = (prompt: string, soloProviderDiretto = false) => {
        const remaining = STANZA_BUDGET_MS - jobElapsed() - 20_000;
        const perAttemptTimeout = Math.max(
          30_000,
          Math.min(75_000, Math.floor(remaining / (soloProviderDiretto ? 1 : 2))),
        );
        return editImage({
          prompt,
          sourceImageBlob: imgBlob,
          effectiveWidth: srcW,
          effectiveHeight: srcH,
          openaiQuality: "medium",
          timeoutMs: perAttemptTimeout,
          directProviderOnly: soloProviderDiretto,
          maxRetries: 0,
          metadata: {
            task_kind: "render_image_edit",
            company_id: companyId as string,
            session_id,
          },
        });
      };

            // Il primo tentativo va SOLO sul provider diretto, con tutto il budget.
      //
      // Dividere il tempo a meta' per finanziare il secondo tier sembra
      // prudente, ma il secondo tier e' OpenRouter — che riceve la size come
      // semplice testo nel prompt e la ignora, restituendo un 1024x1024. Da una
      // foto verticale il quadrato costringe il modello a inventare scena ai
      // lati: allarga il soggetto e ridisegna quello che ha intorno. Si stava
      // quindi togliendo tempo al provider buono per pagare un ripiego che
      // rovina il render.
      // Misurato su infissi (sessione d655a562): diretto abortito a 53s quando
      // ne servivano ~60, quadrato consegnato con QA a zero segnalazioni.
      // Col diretto a budget pieno: 146s -> 58s e formato corretto.
      let providerResult: Awaited<ReturnType<typeof generateCandidate>>;
      try {
        providerResult = await generateCandidate(fullPrompt, true);
      } catch (primoErr) {
        console.warn(JSON.stringify({
          lvl: "warn", fn: "generate-room-render", session_id,
          msg: "provider_diretto_fallito_si_passa_alla_catena",
          error: String((primoErr as Error)?.message ?? primoErr).substring(0, 200),
          nota: "il formato potrebbe non essere rispettato dal fallback",
        }));
        providerResult = await generateCandidate(fullPrompt, false);
      }
      let generationAttempts = 1;

      // ── QA VISION stanza (audit 16/07) ──────────────────────────────────
      // I difetti tipici del restyling stanza: mobili DUPLICATI (due divani,
      // due letti nella stessa camera), porte/finestre inventate o sparite,
      // prospettiva cambiata. Check ~€0.002, 1 retry correttivo budget-gated.
      // Graceful: se il vision provider fallisce, il render passa comunque.
      try {
        const qaPrompt = [
          "You are a LENIENT quality inspector for an interior room restyling render.",
          "Image 1 = SOURCE photo of the real room. Image 2 = CANDIDATE render (same room, new finishes/furniture per brief).",
          'Answer STRICT JSON only: {"pass": boolean, "issues": [{"category": string, "detail": string}]}.',
          "Fail ONLY on clear, unambiguous violations:",
          "- duplicated_furniture: the candidate shows TWO of a fixture that exists once (two beds in one bedroom, two identical sofas, two dining tables).",
          "- invented_openings: windows or doors added, removed or relocated compared to the source walls.",
          "- geometry_change: camera angle, perspective or crop clearly different from the source.",
          "- unrealistic_scale: furniture rendered at impossible size for the room.",
          "When in doubt, PASS. Style and furniture CHANGES are expected and fine — only duplications, invented openings and geometry breaks fail.",
        ].join("\n");

        const sourceBytes = new Uint8Array(await imgBlob.arrayBuffer());
        const sourceDataUrl = `data:${
          imgBlob.type || "image/jpeg"
        };base64,${bytesToBase64(sourceBytes)}`;

        const qaResult = await callVisionQa({
          sourceImageDataUrl: sourceDataUrl,
          candidateImageDataUrl: providerResult.imageDataUrl,
          qaPrompt,
          metadata: {
            task_kind: "render_image_qa",
            company_id: companyId as string,
            session_id,
          },
        });

        const qaIssues = (qaResult.issues ?? []).map((raw) => {
          if (typeof raw === "string") return { category: "unspecified", detail: raw };
          const r = raw as { category?: string; detail?: string };
          return { category: r.category ?? "unspecified", detail: r.detail ?? "" };
        });

        if (qaResult.checked && !qaResult.pass && qaIssues.length > 0 && jobElapsed() < 95_000) {
          console.log(JSON.stringify({
            fn: "generate-room-render",
            msg: "qa_failed_retry_corrective",
            session_id,
            qa_model: qaResult.modelUsed,
            issues: qaIssues.map((i) => i.category),
          }));
          const correctedPrompt = `${fullPrompt}

[QC FAILURE — MANDATORY CORRECTIONS]
The previous attempt failed quality control with these violations:
${qaIssues.map((i) => `- ${i.category}: ${i.detail}`).join("\n")}
Regenerate applying the FULL brief. ABSOLUTE rules: never duplicate furniture (one bed, one sofa, one table unless the source shows more), never add/remove/move windows or doors, keep the exact source camera and crop. Fix every violation listed above.`;
          providerResult = await generateCandidate(correctedPrompt);
          generationAttempts += 1;
        } else if (qaResult.checked && !qaResult.pass) {
          console.warn(JSON.stringify({
            fn: "generate-room-render",
            msg: "qa_failed_retry_skipped_budget",
            session_id,
            issues: qaIssues.map((i) => i.category),
            elapsed_ms: jobElapsed(),
          }));
        }
      } catch (qaErr) {
        console.warn(
          "[generate-room-render] QA vision error (ignored):",
          qaErr instanceof Error ? qaErr.message : String(qaErr),
        );
      }
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
            generation_attempts: generationAttempts,
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
      // F1-parity — refund_all: rimborsa TUTTI i consume scoperti (v1 si
      // bloccava se esisteva già un refund di un ciclo precedente).
      await supabase.rpc("refund_render_credit_all", {
        _company_id: companyId,
        _session_id: session_id,
        _reason_meta: {
          vertical: "stanza",
          edge_fn: "generate-room-render",
          error: message.substring(0, 500),
          background_failure: true,
        },
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
          await supabase.rpc("refund_render_credit_all", {
            _company_id: refundableCompanyId,
            _session_id: refundableSessionId,
            _reason_meta: {
              vertical: "stanza",
              edge_fn: "generate-room-render",
              error: message.substring(0, 500),
            },
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
