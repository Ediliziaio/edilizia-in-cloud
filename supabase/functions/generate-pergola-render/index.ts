// generate-pergola-render — Edge Function EiC
// Render Pergole AI — Provider unificato OpenRouter + fallback
// Prompt Engine v1.0 — surgical outdoor pergola installation visualization

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rewriteDomainPrompt } from "../_shared/ai-provider/domainRewriter.ts";
import { PERGOLA_REWRITER_PROFILE } from "../_shared/ai-provider/pergolaRewriterProfile.ts";
import {
  describeFormatMismatch,
  detectImageDimensions,
} from "../_shared/imageDimensions.ts";
import { requireAuth } from "../_shared/auth.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { deductRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";
import { captureRealCost } from "../_shared/renderCost.ts";
import { prepareInputImage } from "../_shared/renderImage.ts";
import { bytesToBase64 } from "../_shared/base64.ts";
import { editImage } from "../_shared/ai-provider/image.ts";
import type { ImageReferenceInput } from "../_shared/ai-provider/image.ts";
import { buildSharedReferenceLegend, fetchSharedReferenceImages } from "../_shared/renderReferenceFetch.ts";
import {
  collectPergolaReferenceImages,
  type PergolaReferenceInput,
} from "../../../shared/render-references/pergolaReferences.ts";
import { callVisionQa, QA_BLOCCO_RICOMPOSIZIONE } from "../_shared/ai-provider/visionQa.ts";
import { asRecord, buildPergolaEdgePrompt } from "../../../shared/render-pergole/pergolaEdgePrompt.ts";

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


const CORS = {
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
    headers: { ...CORS, "Content-Type": "application/json" },
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
  promise.catch((err) =>
    console.error("[generate-pergola-render] background fallback error:", err)
  );
}

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

  try {
    const auth = await requireAuth(req, CORS);
    supabase = auth.supabaseAdmin;
    user = { id: auth.userId };

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
      .from("render_pergole_sessions")
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
          message: "Accesso negato alla sessione render pergola",
        }),
        {
          status: 403,
          headers: { ...CORS, "Content-Type": "application/json" },
        },
      );
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
    const { data: claimRaw, error: claimErr } = await supabase.rpc(
      "claim_render_vertical_session",
      {
        _table: "render_pergole_sessions",
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
      await supabase.rpc("refund_render_credit_all", {
        _company_id: session.company_id,
        _session_id: session_id,
        _reason_meta: { source: "stale_takeover", edge_fn: "generate-pergola-render" },
      });
    }

    const deductResult = await deductRenderCreditSafe(supabase, {
      companyId: session.company_id as string,
      sessionId: session_id,
      userId: user.id,
      reasonMeta: { vertical: "pergole", edge_fn: "generate-pergola-render" },
      logTag: "generate-pergola-render",
    });

    if (deductResult.status === "insufficient") {
      await supabase.rpc("release_render_vertical_session", {
        _table: "render_pergole_sessions",
        _session_id: session_id,
      });
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

    const renderJob = (async () => {
      const originalPath = session.original_photo_url as string;
      let imageUrl = originalPath;
      let effectiveWidth = target_width ?? undefined;
      let effectiveHeight = target_height ?? undefined;
      if (originalPath && !originalPath.startsWith("http")) {
        const prepared = await prepareInputImage({
          supabase,
          bucket: "pergole-originals",
          originalPath,
          hintWidth: target_width ?? null,
          hintHeight: target_height ?? null,
        });
        imageUrl = prepared.url;
        effectiveWidth = prepared.effective_width ?? effectiveWidth;
        effectiveHeight = prepared.effective_height ?? effectiveHeight;
      }

      const rawConfig =
        (config || (session.config as Record<string, unknown>) || {}) as Record<
          string,
          unknown
        >;
      const { systemPrompt, userPrompt, promptVersion, promptPayload, configCoerente } =
        buildPergolaEdgePrompt(rawConfig);
      let finalProviderPrompt = `${systemPrompt}\n\n${userPrompt}`;

      // META-PROMPT REWRITER: prosa di 300-450 parole al posto dei blocchi
      // grezzi. Il compattatore legge lo stesso schema della libreria
      // condivisa: legacy_config = config della pagina, piu' il payload del
      // builder (mappa target, envelope, manifest, specifica).
      try {
        const meta = await rewriteDomainPrompt(
          {
            // la configurazione resa coerente (tipologia, copertura, stato, montanti): su
            // una già coerente è identica a quella salvata
            config: { legacy_config: configCoerente, ...promptPayload },
            metadata: { task_kind: "render_prompt_rewrite", company_id: session.company_id as string, session_id },
          },
          PERGOLA_REWRITER_PROFILE,
        );
        if (meta) {
          finalProviderPrompt = [
            "You are an expert photorealistic Italian pergola-installation render artist. Edit the source photo as instructed below. Output a clean photograph-quality result.",
            meta.userPrompt,
            // la lista del cliente arriva al modello anche se la prosa la perde
            (() => {
              const raw = asRecord(session.config).elementi_da_preservare;
              const lista = Array.isArray(raw)
                ? (raw as unknown[]).map((v) => String(v).trim()).filter(Boolean)
                : String(raw ?? "").split(/[,;\n]/).map((v) => v.trim()).filter(Boolean);
              return lista.length > 0 ? `Preserve EXACTLY as photographed, as listed by the customer: ${lista.join("; ")}.` : "";
            })(),
            "Avoid: cartoon, painterly, fake CGI, a second structure, floating posts, blocked doors or windows, changed facade or paving, swatch rectangles, invented objects.",
          ].filter(Boolean).join("\n\n");
          console.log(JSON.stringify({ lvl: "info", fn: "generate-pergola-render", session_id, msg: "meta_prompt_active", rewriter_model: meta.modelUsed, rewriter_latency_ms: meta.latencyMs, prose_length: meta.userPrompt.length }));
        } else {
          console.warn(JSON.stringify({ lvl: "warn", fn: "generate-pergola-render", session_id, msg: "meta_prompt_fallback_to_blocks" }));
        }
      } catch (e) {
        console.warn(JSON.stringify({ lvl: "warn", fn: "generate-pergola-render", session_id, msg: "meta_prompt_rewriter_threw", error: String((e as Error)?.message ?? e) }));
      }

      const imgResp = await fetchWithTimeout(imageUrl, {}, 30_000);
      if (!imgResp.ok) {
        throw new Error(
          `Impossibile leggere la foto originale (${imgResp.status})`,
        );
      }
      const imgBlob = await imgResp.blob();
      // Rete di sicurezza sul formato: se il client non manda larghezza e altezza
      // e prepareInputImage non le ricava, il selettore della size non ha su cosa
      // decidere e ripiega sul quadrato 1024x1024 — che costringe il modello a
      // ricomporre la scena per riempirlo. Le dimensioni vere si leggono dai primi
      // byte del file, senza decodificare l'immagine.
      if (!effectiveWidth || !effectiveHeight) {
        try {
          const probe = new Uint8Array(await imgBlob.slice(0, 65536).arrayBuffer());
          const dim = detectImageDimensions(probe);
          if (dim) {
            effectiveWidth = dim.width;
            effectiveHeight = dim.height;
            console.log(JSON.stringify({
              lvl: "info", fn: "generate-pergola-render", session_id,
              msg: "source_dimensions_detected_from_bytes",
              width: dim.width, height: dim.height,
            }));
          }
        } catch (_e) { /* formato non riconosciuto: si prosegue col default */ }
      }

      // F1-parity (audit 16/07) — budget deadline-aware, 1 tentativo per tier.
      const PERGOLE_BUDGET_MS = 140_000;
      const jobStartMs = Date.now();
      const jobElapsed = () => Date.now() - jobStartMs;
      let sharedReferences: ImageReferenceInput[] = [];
      const generateCandidate = (prompt: string, soloProviderDiretto = false) => {
        const remaining = PERGOLE_BUDGET_MS - jobElapsed() - 20_000;
        const perAttemptTimeout = Math.max(
          30_000,
          Math.min(75_000, Math.floor(remaining / (soloProviderDiretto ? 1 : 2))),
        );
        return editImage({
          prompt,
          sourceImageBlob: imgBlob,
          effectiveWidth,
          effectiveHeight,
          openaiQuality: "medium",
          timeoutMs: perAttemptTimeout,
          directProviderOnly: soloProviderDiretto,
          maxRetries: 0,
          referenceImages: sharedReferences.length > 0 ? sharedReferences : undefined,
          metadata: {
            task_kind: "render_image_edit",
            company_id: session.company_id as string,
            session_id,
          },
        });
      };

      // Il primo tentativo va SOLO sul provider diretto, con tutto il budget.
      // Il secondo tier e' OpenRouter, che riceve la size come semplice testo nel
      // prompt e la ignora: da una foto verticale restituisce un 1024x1024, e per
      // riempire il quadrato il modello inventa scena ai lati — allarga il soggetto
      // e ridisegna quello che ha intorno. Dividere il budget a meta' per tenerlo
      // pronto affamava il provider buono e faceva consegnare proprio quei quadrati.
      // Misurato su infissi (sessione d655a562): diretto abortito a 53s quando ne
      // servivano ~60. Col diretto a budget pieno: 146s -> 58s e formato corretto.
      // RIFERIMENTI CONDIVISI — una foto per ogni elemento che l'operazione cambia
      // (struttura, copertura, chiusure, materiale, luci, piede del montante:
      // shared/render-references/
      // pergolaReferences.ts), con legenda DOPO la prosa; nessun catalogo prima,
      // quindi la numerazione parte da Image 2.
      try {
        // La stessa configurazione da cui nasce il prompt (non session.config:
        // in pratica coincidono, ma la foto deve seguire il testo che il modello legge).
        const refsCondivise = collectPergolaReferenceImages(rawConfig as PergolaReferenceInput);
        if (refsCondivise.length > 0) {
          const fetched = await fetchSharedReferenceImages(refsCondivise, (entry) => console.log(JSON.stringify({ fn: "generate-pergola-render", session_id, ...entry })));
          if (fetched.references.length > 0) {
            sharedReferences = fetched.references;
            finalProviderPrompt = `${finalProviderPrompt}\n\n${buildSharedReferenceLegend(fetched.references)}`;
          }
        }
      } catch (refErr) {
        console.warn(JSON.stringify({ lvl: "warn", fn: "generate-pergola-render", session_id, msg: "shared_references_threw", error: String((refErr as Error)?.message ?? refErr) }));
      }

      let providerResult: Awaited<ReturnType<typeof generateCandidate>>;
      try {
        providerResult = await generateCandidate(finalProviderPrompt, true);
      } catch (primoErr) {
        console.warn(JSON.stringify({
          lvl: "warn", fn: "generate-pergola-render", session_id,
          msg: "provider_diretto_fallito_si_passa_alla_catena",
          error: String((primoErr as Error)?.message ?? primoErr).substring(0, 200),
          nota: "il formato potrebbe non essere rispettato dal fallback",
        }));
        providerResult = await generateCandidate(finalProviderPrompt, false);
      }

      // ── QA VISION pergole (audit 16/07) ────────────────────────────────
      // Difetti tipici: DUE pergole invece di una, struttura "galleggiante"
      // senza ancoraggio a terra/parete, casa o giardino ridisegnati oltre
      // l'area pergola, prospettiva cambiata. 1 retry budget-gated.
      try {
        const qaPrompt = [
          "You are a LENIENT quality inspector for a pergola installation render.",
          "Image 1 = SOURCE photo of the real outdoor space. Image 2 = CANDIDATE render (same space with the new pergola installed per brief).",
          'Answer STRICT JSON only: {"pass": boolean, "issues": [{"category": string, "detail": string}]}.',
          "Fail ONLY on clear, unambiguous violations:",
          "- duplicated_pergola: TWO or more pergola structures when the brief asks for one.",
          "- floating_structure: the pergola posts do not reach the ground or the structure is visibly detached/unanchored from wall or floor.",
          "- non_target_change: the house facade, windows or garden clearly redesigned beyond the pergola installation area.",
          "- geometry_change: camera angle, perspective or crop clearly different from the source.",
          "- invented_objects: furniture, people or structures in neither the source nor the brief.",
          ...QA_BLOCCO_RICOMPOSIZIONE,
          "When in doubt, PASS. The NEW pergola itself is expected — only duplications, physics breaks and non-target changes fail.",
        ].join("\n");

        const sourceDataUrl = `data:${
          imgBlob.type || "image/jpeg"
        };base64,${bytesToBase64(new Uint8Array(await imgBlob.arrayBuffer()))}`;

        const qaResult = await callVisionQa({
          sourceImageDataUrl: sourceDataUrl,
          candidateImageDataUrl: providerResult.imageDataUrl,
          qaPrompt,
          metadata: {
            task_kind: "render_image_qa",
            company_id: session.company_id as string,
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
            fn: "generate-pergola-render",
            msg: "qa_failed_retry_corrective",
            session_id,
            issues: qaIssues.map((i) => i.category),
          }));
          const primoTentativo = providerResult;
          // Il retry va anch'esso sul solo provider diretto. Se finisse su OpenRouter
          // tornerebbe un quadrato, e un retry che rompe il formato consegna un render
          // peggiore di quello che stava correggendo — pagandolo. Se il diretto non ce
          // la fa, si tiene il primo tentativo senza spendere altro.
          //
          // Vincolare il provider non basta pero' a garantire il formato: il
          // diretto puo' rispondere senza errore e ignorare comunque la size, e
          // un `catch` non intercetta una risposta riuscita ma quadrata. Si
          // misura quindi il formato delle due immagini e si scarta il retry se
          // rompe un formato che il primo tentativo aveva azzeccato.
          const formatoAtteso = effectiveWidth && effectiveHeight
            ? { width: effectiveWidth, height: effectiveHeight }
            : null;
          const primoDim = detectImageDimensions(
            dataUrlToBytes(primoTentativo.imageDataUrl).bytes,
          );
          const primoFormatoOk = !describeFormatMismatch(formatoAtteso, primoDim);
          try {
            const retryResult = await generateCandidate(`${finalProviderPrompt}

[QC FAILURE — MANDATORY CORRECTIONS]
The previous attempt failed quality control with these violations:
${qaIssues.map((i) => `- ${i.category}: ${i.detail}`).join("\n")}
Regenerate applying the FULL brief. ABSOLUTE rules: exactly ONE pergola, posts firmly anchored to the ground and structure attached as specified, house and garden untouched outside the installation area, same camera and crop.`, true);
            const retryDim = detectImageDimensions(
              dataUrlToBytes(retryResult.imageDataUrl).bytes,
            );
            const retryMismatch = describeFormatMismatch(formatoAtteso, retryDim);
            if (retryMismatch && primoFormatoOk) {
              console.warn(JSON.stringify({
                lvl: "warn", fn: "generate-pergola-render", session_id,
                msg: "qa_retry_scartato_formato_peggiore",
                motivo: retryMismatch,
                primo: primoDim ? `${primoDim.width}x${primoDim.height}` : null,
                retry: retryDim ? `${retryDim.width}x${retryDim.height}` : null,
              }));
              providerResult = primoTentativo;
            } else {
              providerResult = retryResult;
            }
          } catch (retryErr) {
            console.warn(JSON.stringify({
              lvl: "warn", fn: "generate-pergola-render", session_id,
              msg: "qa_retry_fallito_si_tiene_il_primo",
              error: String((retryErr as Error)?.message ?? retryErr).substring(0, 200),
            }));
            providerResult = primoTentativo;
          }
        } else if (qaResult.checked && qaResult.pass) {
          // Il QA promosso non lasciava traccia: si deduceva dall'ASSENZA della
          // riga di bocciatura. Silenzio = successo e' una pessima proprieta'.
          console.log(JSON.stringify({
            fn: "generate-pergola-render",
            msg: "qa_passed_first_attempt",
            session_id,
            qa_model: qaResult.modelUsed,
          }));
        } else if (qaResult.checked && !qaResult.pass) {
          console.warn(JSON.stringify({
            fn: "generate-pergola-render",
            msg: "qa_failed_retry_skipped_budget",
            session_id,
            issues: qaIssues.map((i) => i.category),
            elapsed_ms: jobElapsed(),
          }));
        }
      } catch (qaErr) {
        console.warn(
          "[generate-pergola-render] QA vision error (ignored):",
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
        `${session.company_id}/${session_id}/render_pergole_${Date.now()}.${uploadPayload.extension}`;
      const { error: uploadErr } = await supabase.storage.from(
        "pergole-results",
      ).upload(resultPath, uploadPayload.bytes, {
        contentType: uploadPayload.mimeType,
        upsert: true,
      });
      if (uploadErr) {
        throw new Error(`Errore upload risultato: ${uploadErr.message}`);
      }

      const { data: publicUrlData } = supabase.storage.from("pergole-results")
        .getPublicUrl(resultPath);
      const resultUrl = publicUrlData.publicUrl;
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

      await supabase
        .from("render_pergole_sessions")
        .update({
          status: "completed",
          result_urls: [resultUrl],
          prompt_used: finalProviderPrompt,
          prompt_version: promptVersion,
          prompt_char_count: finalProviderPrompt.length,
          provider_key: providerKey,
          cost_real: costReal,
          cost_billed: costBilled,
          config_snapshot: {
            ...rawConfig,
            pergole_render_payload: promptPayload,
            provider_model_used: modelUsed,
            provider_attempts: providerResult.attempts,
          },
          processing_completed_at: new Date().toISOString(),
        })
        .eq("id", session_id);

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
          result_url: resultUrl,
          provider: providerKey,
          model: modelUsed,
          attempts: providerResult.attempts,
          prompt_version: promptVersion,
          prompt_char_count: finalProviderPrompt.length,
        }),
        {
          status: 200,
          headers: { ...CORS, "Content-Type": "application/json" },
        },
      );
    })().catch(async (jobErr: unknown) => {
      const msg = jobErr instanceof Error ? jobErr.message : String(jobErr);
      console.error("[generate-pergola-render] background error:", msg);
      await supabase.rpc("refund_render_credit_all", {
        _company_id: session.company_id as string,
        _session_id: session_id,
        _reason_meta: {
          vertical: "pergole",
          edge_fn: "generate-pergola-render",
          error: msg.substring(0, 500),
        },
      });
      await supabase
        .from("render_pergole_sessions")
        .update({
          status: "failed",
          error_message: msg,
          processing_completed_at: new Date().toISOString(),
        })
        .eq("id", session_id);
    });

    runInBackground(renderJob);
    return acceptedRenderResponse(session_id);
  } catch (err: unknown) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate-pergola-render] error:", msg);
    try {
      const body2 = await req.clone().json().catch(() => ({}));
      const sid = (body2 as { session_id?: string }).session_id;
      if (sid) {
        if (creditDeducted && refundableCompanyId && refundableSessionId) {
          await supabase.rpc("refund_render_credit_all", {
        _company_id: refundableCompanyId,
        _session_id: refundableSessionId,
        _reason_meta: {
              vertical: "pergole",
              edge_fn: "generate-pergola-render",
              error: msg.substring(0, 500),
            },
      });
        }
        await supabase.from("render_pergole_sessions").update({
          status: "failed",
          error_message: msg,
        }).eq("id", sid);
      }
    } catch { /* ignore */ }

    return new Response(
      JSON.stringify({ error: "render_failed", message: msg }),
      {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      },
    );
  }
});
