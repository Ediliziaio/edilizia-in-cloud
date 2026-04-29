// generate-render — Edge Function EiC
// Render Infissi AI — Multi-Provider (OpenAI / Gemini)
// NO Lovable Gateway — API keys da platform_settings
// Prompt Engine v6 completo (ported from Edile Genius)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { captureRealCost } from "../_shared/renderCost.ts";
import { prepareInputImage, pickProviderSize } from "../_shared/renderImage.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { deductRenderCreditSafe, refundRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";
import { shouldFallbackOpenAIImageEdit } from "../_shared/openaiImageEdit.ts";
import { buildWindowPrompt } from "../../../shared/render-window/windowPromptBuilder.ts";
import type { WindowRenderConfig } from "../../../shared/render-window/types.ts";

// ── resolveRenderSize ─────────────────────────────────────────────────────────
// OpenAI gpt-image-1 / dall-e-2 supportano: 256x256, 512x512, 1024x1024, 1792x1024, 1024x1792
function resolveRenderSize(w?: number, h?: number): string {
  if (!w || !h) return "1024x1024";
  const ratio = w / h;
  // Landscape (>1.4): 1792x1024
  if (ratio > 1.4) return "1792x1024";
  // Portrait (<0.7): 1024x1792
  if (ratio < 0.7) return "1024x1792";
  // Square-ish: 1024x1024
  return "1024x1024";
}

// ── fetchWithTimeout ──────────────────────────────────────────────────────────
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 120_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ── fetchWithRetry ───────────────────────────────────────────────────────────
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

function uint8ToBase64(uint8: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < uint8.length; i += chunkSize) {
    binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error("Formato data URL render non valido");
  return { mimeType: match[1], data: match[2] };
}

async function fetchInlineImageData(url: string): Promise<{ mimeType: string; data: string }> {
  const resp = await fetchWithTimeout(url, {}, 30_000);
  if (!resp.ok) throw new Error(`Impossibile leggere immagine per QA: ${resp.status}`);
  const mimeType = resp.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  const buffer = await resp.arrayBuffer();
  return { mimeType, data: uint8ToBase64(new Uint8Array(buffer)) };
}

async function getGeminiQaApiKey(supabase: ReturnType<typeof createClient>): Promise<string> {
  const envKey = Deno.env.get("GEMINI_API_KEY")?.trim();
  if (envKey) return envKey;

  const { data: setting } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "render_gemini_api_key")
    .maybeSingle();

  return typeof setting?.value === "string" ? setting.value.trim() : "";
}

function getMotorizedManualCleanupTargets(config: WindowRenderConfig): Array<{
  openingId: string;
  openingLabel: string;
  placementNotes: string;
}> {
  return config.technical_specification.flatMap((spec) => {
    const opening = config.scene_analysis.openings.find((item) => item.id === spec.openingId);
    if (!opening || !spec.shutter.isMotorized || (!opening.hasBelt && !opening.hasBeltBox)) return [];
    return [{
      openingId: opening.id,
      openingLabel: opening.label,
      placementNotes: opening.beltPlacementNotes || "manual control visible near the opening side wall/reveal",
    }];
  });
}

async function runMotorizedManualCleanupQa(args: {
  supabase: ReturnType<typeof createClient>;
  sourceImageUrl: string;
  candidateImageData: string;
  normalizedConfig: WindowRenderConfig;
}): Promise<{
  checked: boolean;
  pass: boolean;
  issues: string[];
}> {
  const targets = getMotorizedManualCleanupTargets(args.normalizedConfig);
  if (targets.length === 0) return { checked: false, pass: true, issues: [] };

  const geminiApiKey = await getGeminiQaApiKey(args.supabase);
  if (!geminiApiKey) {
    console.warn("[generate-render] QA skipped: missing GEMINI_API_KEY / render_gemini_api_key");
    return { checked: false, pass: true, issues: [] };
  }

  const [sourceImage, candidateImage] = await Promise.all([
    fetchInlineImageData(args.sourceImageUrl),
    Promise.resolve(parseDataUrl(args.candidateImageData)),
  ]);

  const qaPrompt = `Compare TWO IMAGES.
Image 1 = SOURCE PHOTO.
Image 2 = CANDIDATE WINDOW RENDER.

We selected MOTORIZED roller shutters for these target openings:
${targets.map((target) => `- Opening ${target.openingLabel}: ${target.placementNotes}`).join("\n")}

Strict compliance rule:
- If a shutter is motorized, NO manual control can remain visible.
- Fail if you see any belt, cord, strap, wall winder, wall plate, belt slot, or leftover vertical manual-control trim near the target opening.
- A visible vertical manual-control assembly on the side wall/reveal means FAIL.
- Ignore the window hardware itself; evaluate only old shutter manual controls.

Return ONLY JSON:
{
  "pass": boolean,
  "issues": ["short issue 1", "short issue 2"]
}`;

  const qaResp = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: qaPrompt },
            { inline_data: { mime_type: sourceImage.mimeType, data: sourceImage.data } },
            { inline_data: { mime_type: candidateImage.mimeType, data: candidateImage.data } },
          ],
        }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!qaResp.ok) {
    const err = await qaResp.text();
    console.warn("[generate-render] QA skipped: Gemini response error", qaResp.status, err.substring(0, 300));
    return { checked: false, pass: true, issues: [] };
  }

  const qaData = await qaResp.json().catch(() => ({}));
  const qaText = String(qaData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
  if (!qaText) {
    console.warn("[generate-render] QA skipped: empty Gemini QA text");
    return { checked: false, pass: true, issues: [] };
  }

  try {
    const parsed = JSON.parse(qaText) as { pass?: boolean; issues?: unknown };
    const issues = Array.isArray(parsed.issues)
      ? parsed.issues.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    return {
      checked: true,
      pass: parsed.pass !== false,
      issues,
    };
  } catch (error) {
    console.warn("[generate-render] QA skipped: invalid Gemini QA JSON", error, qaText.substring(0, 300));
    return { checked: false, pass: true, issues: [] };
  }
}

function buildMotorizedManualCleanupRetryPrompt(
  basePrompt: string,
  normalizedConfig: WindowRenderConfig,
  issues: string[],
): string {
  const targets = getMotorizedManualCleanupTargets(normalizedConfig);
  const targetLines = targets.map((target) =>
    `- Opening ${target.openingLabel}: remove the entire old manual shutter-control assembly exactly where it appears (${target.placementNotes}).`,
  );

  const issueLines = issues.length > 0
    ? issues.map((issue) => `- ${issue}`)
    : ["- The previous render still showed a legacy manual shutter-control element even though motorization was selected."];

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

// ── CORS ──────────────────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  let supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  let user = { id: "" };
  let refundableSessionId: string | null = null;
  let refundableCompanyId: string | null = null;
  let creditDeducted = false;

  try {
    const auth = await requireAuth(req, CORS);
    supabase = auth.supabaseAdmin;
    user = { id: auth.userId };

    // ── Parse request ───────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { session_id, config, target_width, target_height } = body as {
      session_id?: string;
      config?: Record<string, unknown>;
      target_width?: number;
      target_height?: number;
    };

    if (!session_id) {
      return new Response(
        JSON.stringify({ error: "validation_error", message: "session_id is required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }
    refundableSessionId = session_id;

    // ── Legge la sessione ───────────────────────────────────────────────────
    const { data: session, error: sessionErr } = await supabase
      .from("render_sessions")
      .select("*")
      .eq("id", session_id)
      .single();

    if (sessionErr || !session) {
      return new Response(
        JSON.stringify({ error: "not_found", message: "Sessione non trovata" }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }
    refundableCompanyId = session.company_id as string;

    // FIX P1.3: verifica tenant access tramite helper impersonation-aware.
    // L'helper considera: (a) super_admin → accesso globale, (b) impersonation
    // attiva in active_impersonations, (c) fallback profiles.company_id.
    // Il vecchio pattern basato solo su profiles.company_id bloccava i
    // superadmin che lavoravano in impersonazione.
    const allowed = await canAccessCompany(
      supabase,
      user.id,
      session.company_id as string,
    );
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "forbidden", message: "Accesso negato alla sessione render" }),
        { status: 403, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ── Controlla e deduce crediti (v3: audit ledger + FIFO revenue tracking) ──
    // Helper shared: prova v3 → v2 → v1 per backward-compat con ambienti
    // pre-migrazione. v3 scrive render_credit_ledger con session_id + user_id.
    const deductResult = await deductRenderCreditSafe(supabase, {
      companyId: session.company_id as string,
      sessionId: session_id,
      userId:    user.id,
      reasonMeta: { vertical: "infissi", edge_fn: "generate-render" },
      logTag:    "generate-render",
    });

    if (deductResult.status === "insufficient") {
      return new Response(
        JSON.stringify({ error: "insufficient_credits", message: "Crediti render insufficienti" }),
        { status: 402, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }
    creditDeducted = true;

    const revenueEur = deductResult.revenue_eur;
    const purchaseId = deductResult.purchase_id;

    // ── Aggiorna sessione: processing ───────────────────────────────────────
    await supabase
      .from("render_sessions")
      .update({ status: "processing", processing_started_at: new Date().toISOString() })
      .eq("id", session_id);

    // ── Prepara immagine input (resize server-side A4) ──────────────────────
    // target_width/target_height sono gli hint originali dal client (foto iPhone,
    // upload utente). Se > 1600 lato lungo, applichiamo Supabase transform per
    // ridurre input tokens e costo API (enorme risparmio).
    const originalPath = session.original_photo_url as string;
    const prepared = await prepareInputImage({
      supabase,
      bucket: "render-originals",
      originalPath,
      hintWidth: target_width,
      hintHeight: target_height,
    });
    const imageUrl = prepared.url;

    // ── Build prompt v7 ─────────────────────────────────────────────────────
    const rawConfig = (config || (session.config as Record<string, unknown>) || {}) as Record<string, unknown>;
    const {
      systemPrompt,
      userPrompt,
      negativePrompt,
      promptVersion,
      blocks,
      validation,
      normalizedConfig,
    } = buildWindowPrompt(rawConfig, (session as Record<string, unknown>).foto_analisi || {});
    let composedPrompt = [systemPrompt, userPrompt, `[NEGATIVE CONSTRAINTS]\n${negativePrompt}`]
      .filter(Boolean)
      .join("\n\n");

    if (!validation.isValid) {
      throw new Error(
        `Prompt render infissi non valido: sections=${validation.missingSections.join(", ") || "none"}; rules=${validation.missingBusinessRules.join(", ") || "none"}`,
      );
    }

    // ── Legge provider config e API key ─────────────────────────────────────
    const { data: providerConfig } = await supabase
      .from("render_provider_config")
      .select("*")
      .eq("is_default", true)
      .eq("is_active", true)
      .single();

    if (!providerConfig) {
      throw new Error("Nessun provider render attivo. Configurare in Admin > Impostazioni AI > Render.");
    }

    const platformKeyName = `render_${providerConfig.provider_key}_api_key`;
    const { data: keyRow } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", platformKeyName)
      .maybeSingle();

    // Fallback chain: DB platform_settings → Supabase edge function secret (env)
    // Env names:  OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY
    const envName = `${providerConfig.provider_key.toUpperCase()}_API_KEY`;
    const apiKey =
      (keyRow as { value: string } | null)?.value?.trim() ||
      Deno.env.get(envName)?.trim() ||
      "";
    if (!apiKey) {
      throw new Error(
        `API key mancante per provider '${providerConfig.provider_key}'.` +
        ` Configurarla in Admin > Impostazioni AI > Render o come Supabase secret ${envName}.`
      );
    }

    // ── Chiama il provider AI ───────────────────────────────────────────────
    const renderSize = pickProviderSize(
      prepared.effective_width,
      prepared.effective_height,
      "openai",
    ) ?? resolveRenderSize(target_width, target_height);

    const generateCandidate = async (promptText: string): Promise<{
      imageData: string;
      providerRawResponse: Record<string, unknown>;
    }> => {
      let imageData: string | null = null;
      let providerRawResponse: Record<string, unknown> = {};

      if (providerConfig.provider_key === "openai") {
        const imgResp = await fetchWithTimeout(imageUrl, {}, 30_000);
        const imgBlob = await imgResp.blob();

        const buildForm = (modelName: string) => {
          const form = new FormData();
          form.append("model", modelName);
          form.append("prompt", promptText);
          if (modelName === "dall-e-2") {
            form.append("image", imgBlob, "photo.png");
          } else {
            form.append("image[]", imgBlob, "photo.jpg");
          }
          form.append("n", "1");
          form.append("size", modelName === "dall-e-2" ? "1024x1024" : renderSize);
          if (modelName === "dall-e-2") {
            form.append("response_format", "b64_json");
          }
          return form;
        };

        const modelChain = [providerConfig.model || "gpt-image-1"];
        if (modelChain[0] !== "dall-e-2") modelChain.push("dall-e-2");

        let resp: Response | null = null;
        let lastErr = "";
        let modelUsed = providerConfig.model;
        for (const m of modelChain) {
          const r = await fetchWithRetry(
            "https://api.openai.com/v1/images/edits",
            {
              method: "POST",
              headers: { Authorization: `Bearer ${apiKey}` },
              body: buildForm(m),
            },
          );
          if (r.ok) {
            resp = r;
            modelUsed = m;
            break;
          }
          const txt = await r.text();
          lastErr = `OpenAI error ${r.status}: ${txt.substring(0, 300)}`;
          const isModelAccessIssue = shouldFallbackOpenAIImageEdit(r.status, txt);
          if (!isModelAccessIssue) throw new Error(lastErr);
        }
        if (!resp) throw new Error(lastErr || "OpenAI: tutti i model tentati sono falliti");

        const oaiData = await resp.json();
        providerRawResponse = { ...oaiData, _model_used: modelUsed } as Record<string, unknown>;
        const b64 = oaiData.data?.[0]?.b64_json;
        if (b64) imageData = `data:image/png;base64,${b64}`;
      } else if (providerConfig.provider_key === "gemini") {
        const imgResp = await fetchWithTimeout(imageUrl, {}, 30_000);
        const imgBuffer = await imgResp.arrayBuffer();
        const imgB64 = uint8ToBase64(new Uint8Array(imgBuffer));

        const geminiBody = {
          contents: [{
            parts: [
              { text: promptText },
              { inline_data: { mime_type: "image/jpeg", data: imgB64 } },
            ],
          }],
          generationConfig: {
            responseModalities: ["IMAGE", "TEXT"],
            temperature: 1,
          },
        };

        const geminiUrl = `${providerConfig.api_endpoint}/${providerConfig.model}:generateContent?key=${apiKey}`;
        const resp = await fetchWithRetry(
          geminiUrl,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(geminiBody),
          },
        );

        if (!resp.ok) {
          const err = await resp.text();
          throw new Error(`Gemini error ${resp.status}: ${err.substring(0, 300)}`);
        }

        const gemData = await resp.json();
        providerRawResponse = gemData as Record<string, unknown>;
        const parts = gemData.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          if (part.inlineData?.mimeType?.startsWith("image/")) {
            imageData = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            break;
          }
        }
      } else {
        throw new Error(
          `Provider '${providerConfig.provider_key}' non supportato. Selezionare OpenAI o Gemini.`
        );
      }

      if (!imageData) {
        throw new Error("Nessuna immagine ricevuta dal provider AI");
      }

      return { imageData, providerRawResponse };
    };

    let generationAttempts = 1;
    let { imageData, providerRawResponse } = await generateCandidate(composedPrompt);

    const qaResult = await runMotorizedManualCleanupQa({
      supabase,
      sourceImageUrl: imageUrl,
      candidateImageData: imageData,
      normalizedConfig,
    });

    if (qaResult.checked && !qaResult.pass) {
      generationAttempts += 1;
      composedPrompt = buildMotorizedManualCleanupRetryPrompt(
        composedPrompt,
        normalizedConfig,
        qaResult.issues,
      );
      const retried = await generateCandidate(composedPrompt);
      imageData = retried.imageData;
      providerRawResponse = retried.providerRawResponse;
    }

    // ── Upload risultato su Storage ─────────────────────────────────────────
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const uint8 = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const resultPath = `${session.company_id}/${session_id}/render_${Date.now()}.png`;

    const { error: uploadErr } = await supabase.storage
      .from("render-results")
      .upload(resultPath, uint8, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`Errore upload risultato: ${uploadErr.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from("render-results")
      .getPublicUrl(resultPath);

    const resultUrl = publicUrlData.publicUrl;

    // ── Capture costo reale API (B2) ────────────────────────────────────────
    // Provo a leggere il pricing da render_provider_pricing (migration B1).
    // Se fallisce (pricing non definito / parsing response errato), fallback
    // su legacy providerConfig.cost_real_per_render.
    const legacyCostReal = Number(providerConfig.cost_real_per_render ?? 0.04);
    const capture = await captureRealCost({
      supabase,
      providerKey: providerConfig.provider_key,
      model: providerConfig.model,
      rawResponse: providerRawResponse,
      legacyFallbackEur: legacyCostReal,
    });

    // ── Aggiorna render_sessions: completed ─────────────────────────────────
    const costReal = capture.cost_eur * generationAttempts;
    const costBilled = providerConfig.cost_billed_per_render ?? 0.10;
    const activeConfig = normalizedConfig as unknown as Record<string, unknown>;
    const ni = (activeConfig?.nuovo_infisso as Record<string, unknown>) || {};

    // Update in due fasi per essere robusto se migration economics non
    // ancora applicata (retrocompat deploy order-independent).
    const legacyUpdate = {
      status: "completed",
      result_urls: [resultUrl],
      prompt_used: composedPrompt,
      prompt_blocks: blocks,
      prompt_version: promptVersion,
      prompt_char_count: composedPrompt.length,
      provider_key: providerConfig.provider_key,
      cost_real: costReal,
      cost_billed: costBilled,
      config_snapshot: activeConfig,
      processing_completed_at: new Date().toISOString(),
    };

    const economicsUpdate = {
      cost_real_api: costReal,
      revenue_eur: revenueEur,
      provider_usage: capture.usage,
      provider_model: capture.model,
      provider_request_id: capture.request_id,
      vertical: "infissi",
      meta: {
        purchase_id: purchaseId,
        input_image: prepared.meta,
        generation_attempts: generationAttempts,
        provider_size_used: providerConfig.provider_key === "openai"
          ? (pickProviderSize(prepared.effective_width, prepared.effective_height, "openai") ?? null)
          : null,
      },
    };

    // Prova prima con tutti i campi. Se fallisce (migration non applicata),
    // retry solo legacy — l'update legacy è garantito dallo schema esistente.
    const fullUpdate = await supabase
      .from("render_sessions")
      .update({ ...legacyUpdate, ...economicsUpdate })
      .eq("id", session_id);

    if (fullUpdate.error) {
      console.warn(
        "[generate-render] economics columns missing, fallback to legacy update:",
        fullUpdate.error.message
      );
      await supabase
        .from("render_sessions")
        .update(legacyUpdate)
        .eq("id", session_id);
    }

    // ── Incrementa contatore provider ───────────────────────────────────────
    await supabase
      .from("render_provider_config")
      .update({ renders_generated: (providerConfig.renders_generated ?? 0) + 1 })
      .eq("id", providerConfig.id);

    // ── Inserisce in render_gallery ─────────────────────────────────────────
    const tagMat = (ni.materiale as string) || (activeConfig?.materiale as string) || null;
    const tagCol = ((ni.colore as Record<string, string>)?.nome) || (activeConfig?.colore as string) || null;
    await supabase.from("render_gallery").insert({
      company_id: session.company_id,
      session_id,
      created_by: user.id,
      title: `Render ${new Date().toLocaleDateString("it-IT")}`,
      original_url: session.original_photo_url,
      render_url: resultUrl,
      tags: [tagMat, tagCol].filter(Boolean),
    });

    return new Response(
      JSON.stringify({
        success: true,
        session_id,
        result_url: resultUrl,
        provider: providerConfig.provider_key,
        cost_billed: costBilled,
        prompt_version: promptVersion,
        prompt_char_count: composedPrompt.length,
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate-render] error:", msg);

    try {
      const body2 = await req.clone().json().catch(() => ({}));
      const sid = (body2 as { session_id?: string }).session_id;
      if (sid) {
        if (creditDeducted && refundableCompanyId && refundableSessionId) {
          await refundRenderCreditSafe(supabase, {
            companyId: refundableCompanyId,
            sessionId: refundableSessionId,
            userId: user.id,
            reasonMeta: { vertical: "infissi", edge_fn: "generate-render", error: msg.substring(0, 500) },
            logTag: "generate-render",
          });
        }
        await supabase
          .from("render_sessions")
          .update({ status: "failed", error_message: msg })
          .eq("id", sid);
      }
    } catch { /* ignore */ }

    return new Response(
      JSON.stringify({ error: "render_failed", message: msg }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
