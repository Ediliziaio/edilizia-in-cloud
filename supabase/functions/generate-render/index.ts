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

// ── v8.6.21 — Reference images cache module-scope ────────────────────────────
// Le reference images sono statiche (mazzetta colori, maniglie, profili) e
// sono identiche tra tutti i render. Cache-arle nell'isolate Deno (vive
// fino a 5-30 min in prod) elimina il fetch dal CDN Cloudflare Pages (+ il
// timeout 8s in caso di cache miss) e la conversione base64 (~50-150ms per
// file). Risparmio per render: 1.5-3s in average a regime caldo, +5s nei
// primi 1-2 render dopo cold-start dell'isolate.
//
// Eviction: nessuna (le ref images del catalogo sono <100 file totali,
// ~300KB ciascuna in base64 → <30MB totali ben sotto al cap memoria isolate).
const REFERENCE_IMAGE_CACHE = new Map<string, { label: string; dataUrl: string }>();
const REFERENCE_IMAGE_CACHE_NEGATIVE = new Map<string, number>(); // url -> timestamp last failure
const REFERENCE_NEGATIVE_TTL_MS = 60_000; // 60s before retrying a failed fetch

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

// v8.3.7 — QA Vision MULTI-CRITERION
// Categorie controllate (corrispondono ai 7 CARDINAL FAILURE MODES + cinghia):
const QA_CATEGORIES = [
  "recolor_instead_of_replace",
  "old_handle_kept",
  "lateral_stiles_old_color",
  "manual_shutter_control_visible",
  "residual_sash_subdivisions",
  "cassonetto_recolored_not_replaced",
  "objects_invented",
  "swatch_pasted_in_scene",
  "cassonetto_window_discontinuity",
  // v8.6.5 — Composition change ignorata (sash count mismatch)
  "sash_count_mismatch",
] as const;
type QaCategory = (typeof QA_CATEGORIES)[number];

interface QaIssue {
  category: QaCategory;
  detail: string;
}

interface MultiQaResult {
  pass: boolean;
  issues: QaIssue[];
}

function buildMultiCriterionQaPrompt(config: WindowRenderConfig): string {
  const spec = config.technical_specification[0];
  const motorizedTargets = getMotorizedManualCleanupTargets(config);
  const motorizedSection = motorizedTargets.length > 0
    ? `\nMOTORIZATION TARGETS (manual control must DISAPPEAR):\n${
      motorizedTargets.map((t) => `- Opening ${t.openingLabel}: ${t.placementNotes}`).join("\n")
    }`
    : "";

  const cassonettoReplace = spec?.cassonetto.replace
    ? `\nCASSONETTO REPLACEMENT: yes — must be a NEW unit (different model from the old one), not just recolored.`
    : "";

  const frameFinish = spec
    ? `\nNEW FRAME FINISH SPECIFIED: ${spec.finish.name}${spec.finish.ral ? ` (RAL ${spec.finish.ral})` : ""} — every visible frame surface (front, lateral stiles left+right, top header, bottom sill, central mullion) must show this color.`
    : "";

  // v8.6.5 — Comunica esplicitamente al QA il sash count target se c'e' un
  // composition change attivo, cosi' puo' fare il check #10 con criterio.
  const sashCountChange = spec?.compositionChange
    ? `\nSASH COUNT CHANGE REQUESTED: source photo has ${spec.compositionChange.fromSashCount} sashes, the NEW window must have EXACTLY ${spec.compositionChange.toSashCount} sashes inside the same wall opening width.`
    : `\nSASH COUNT: source = NEW window = ${spec?.desiredSashCount ?? "?"} sashes (no composition change).`;

  return `You are a strict QC inspector for premium Italian window-replacement renders.
You receive TWO IMAGES:
- Image 1 = SOURCE PHOTO (old window installed)
- Image 2 = CANDIDATE RENDER (proposed new window in same room)

Your job: detect failures where the AI did NOT properly replace the old window.${frameFinish}${cassonettoReplace}${sashCountChange}${motorizedSection}

Check these ${QA_CATEGORIES.length} categories systematically. For EACH category, decide pass/fail:

1. [recolor_instead_of_replace] — Did the AI just recolor the old window, keeping identical geometry, mullion thickness, sash proportions? FAIL if the new window looks like the old one with a color filter applied.

2. [old_handle_kept] — Is the handle in Image 2 the SAME model/shape as the handle in Image 1, just repainted? FAIL if so. The handle must be visibly a different model.

3. [lateral_stiles_old_color] — Are the LEFT and RIGHT vertical frame edges (lateral stiles) still in the OLD color (typically white) while the front face is in the new color? FAIL if so. The entire frame perimeter must be in the new color.

4. [manual_shutter_control_visible] — If motorization was specified, do you see any vertical pull cord, belt strap, wall winder box, wall plate, exit slot, or vertical guide rod near the window in Image 2? FAIL if any of these are visible.

5. [residual_sash_subdivisions] — Do you see 4 dark rectangles or muntin segments in the upper portion of the new sashes (residuals of old georgian bars / transoms)? FAIL if so. New sashes are single uninterrupted glass panels.

6. [cassonetto_recolored_not_replaced] — If cassonetto replacement was specified, is the cassonetto in Image 2 visibly the SAME design as Image 1, just repainted? FAIL if so. The new cassonetto must be a clean modern flat PVC monoblock with smooth surface.

7. [objects_invented] — Do you see curtains, drapes, blinds, lamps, sensors, plants, picture frames, switches in Image 2 that are NOT present in Image 1? FAIL if any new objects appear in the room that were not in the source.

8. [swatch_pasted_in_scene] — Do you see a small rectangular color swatch, inset thumbnail of a handle, or any product-photo-like element pasted on the wall or floating in the scene? FAIL if so.

9. [cassonetto_window_discontinuity] — If cassonetto is replaced, is there a visible GAP, OFFSET, dark shadow seam, or color discontinuity between the bottom edge of the cassonetto and the top edge of the window frame? FAIL if they don't form a seamless continuous line (monoblocco standard).

10. [sash_count_mismatch] — Count the sashes (vertical glazed panels separated by mullions) in Image 2. If a SASH COUNT CHANGE was requested (see header above), does the candidate render match the target sash count? FAIL if the candidate keeps the source-photo sash count instead of applying the requested change (e.g. spec says 2→1 but render still shows 2 sashes with central mullion).

Return ONLY this JSON, no prose:
{
  "pass": boolean,
  "issues": [
    {"category": "<one of the ${QA_CATEGORIES.length} category keys>", "detail": "<short 1-line description of what you see>"}
  ]
}
Categories MUST be one of: ${QA_CATEGORIES.join(", ")}.
If all ${QA_CATEGORIES.length} categories pass, return {"pass": true, "issues": []}.
If even ONE fails, return pass=false plus the issue(s).`;
}

// Per ogni categoria di issue, costruisce un fragment correttivo mirato.
function buildCorrectiveFragmentForCategory(
  category: QaCategory,
  config: WindowRenderConfig,
): string {
  const motorizedTargets = getMotorizedManualCleanupTargets(config);
  switch (category) {
    case "recolor_instead_of_replace":
      return "ERASE the old window entirely. Draw a BRAND NEW physical window with the specified profile, sash composition, mullion thickness, hinge mode and handle model. Do NOT preserve the geometry of the old window — only the wall opening dimensions are kept.";
    case "old_handle_kept":
      return "Replace the handle with the new model specified (different shape, mounting plate, finish). The new handle MUST visibly differ from the old handle in Image 1 — different silhouette, different proportions.";
    case "lateral_stiles_old_color":
      return "Repaint ALL frame surfaces in the new specified color: left lateral stile, right lateral stile, top header, bottom sill, central mullion. No part of the frame may remain in the old white/original color.";
    case "manual_shutter_control_visible":
      return motorizedTargets.length > 0
        ? `For motorized openings (${motorizedTargets.map((t) => t.openingLabel).join(", ")}): ERASE every vertical cord, belt strap, wall winder box, wall plate, belt exit slot and vertical guide. Repair the wall seamlessly (matching plaster + paint). Install a new flush 80x80mm Vimar-style electric switch at ~110cm from floor.`
        : "Remove any remaining belt, cord, wall winder or vertical control trim near the window.";
    case "residual_sash_subdivisions":
      return "Remove ALL dark rectangles, muntin segments and georgian-bar residuals from the upper portion of the new sashes. Each sash is a SINGLE clear glazed panel from top to bottom.";
    case "cassonetto_recolored_not_replaced":
      return "ERASE the old cassonetto entirely. Draw a NEW modern flat slim PVC monoblock unit: smooth surface, integrated hatch, no old wood texture, no rustic plaster, no projecting cornice. Match the specified color exactly.";
    case "objects_invented":
      return "Remove ALL room objects that were not in Image 1: curtains, lamps, sensors, plants, frames, switches. The room outside the target opening must be IDENTICAL to Image 1 (same wall paint, same furniture, same accessories).";
    case "swatch_pasted_in_scene":
      return "Remove the swatch/product-photo rectangle from the scene. Reference images are invisible inputs — only the edited Image 1 should appear in the output.";
    case "cassonetto_window_discontinuity":
      return "Align the bottom edge of the new cassonetto PERFECTLY with the top edge of the new window frame: zero gap, zero shadow seam, zero offset. They form a single seamless monoblocco unit.";
    case "sash_count_mismatch": {
      const cc = config.technical_specification[0]?.compositionChange;
      if (cc) {
        if (cc.toSashCount < cc.fromSashCount) {
          return `REMOVE ${cc.fromSashCount - cc.toSashCount} central vertical mullion(s) from the new window. The new window must have EXACTLY ${cc.toSashCount} sashes (vertical glazed panels), NOT ${cc.fromSashCount}. The wall opening width stays IDENTICAL — only the internal subdivision changes. ${cc.toSashCount === 1 ? "Result: ONE single full-width glass panel filling the entire opening." : `Result: ${cc.toSashCount} equal-width glazed panels.`}`;
        }
        return `ADD ${cc.toSashCount - cc.fromSashCount} new vertical mullion(s) to the new window. The new window must have EXACTLY ${cc.toSashCount} sashes (vertical glazed panels), NOT ${cc.fromSashCount}. The wall opening width stays IDENTICAL — only the internal subdivision changes.`;
      }
      return "Match the sash count exactly to the specification. Do not keep the source-photo sash count.";
    }
    default:
      return "";
  }
}

function buildRetryPrompt(
  basePrompt: string,
  config: WindowRenderConfig,
  issues: QaIssue[],
): string {
  if (issues.length === 0) {
    return basePrompt; // no issues → no retry payload needed
  }
  const correctiveLines = issues.map(
    (i) =>
      `[${i.category}] ${i.detail}\n  → CORRECTION: ${buildCorrectiveFragmentForCategory(i.category, config)}`,
  );

  return `${basePrompt}

[CRITICAL CORRECTIVE RETRY — PREVIOUS RENDER FAILED QA]
The previous attempt is NON-COMPLIANT in the following ways. You MUST fix each one. Keep the same exact room, geometry, crop, lighting and image dimensions. Only correct the listed failures.

${correctiveLines.join("\n\n")}

Re-render the new window with all corrections applied. The output must pass all ${QA_CATEGORIES.length} QC categories.`;
}

// ── Main handler ─────────────────────────────────────────────────────────────
// v8.5.4 — Budget tempo totale edge function (Supabase Edge cap = 150s free).
// Riserviamo 140s al lavoro, 10s di margine per upload + DB updates.
// Aumentato da 130s grazie al background pattern v8.5 (il client non aspetta).
const TOTAL_BUDGET_MS = 140_000;
// Se elapsed > QA_RETRY_BUDGET_MS, saltiamo il retry corrective (consegniamo
// il primo render anche se imperfetto). L'utente può rigenerare se vuole.
// Aumentato 90s → 100s: lascia spazio al retry se OpenAI primo tentativo
// e' veloce (~30-40s).
const QA_RETRY_BUDGET_MS = 100_000;

Deno.serve(async (req) => {
  const requestStartMs = Date.now();
  const elapsed = () => Date.now() - requestStartMs;

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
      referenceImages: referenceImageDescriptors,
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

    // ── v8.6.23 — In-flight lock check (race condition guard) ────────────
    // Se l'utente fa doppio click su "Genera" o se due tab parallele
    // invocano la stessa session_id, vogliamo evitare:
    //  - doppio deduct credito (anche se deduct_render_credit_v3 ha FOR
    //    UPDATE, il refund è gestito su catena diversa)
    //  - doppio background work che genera 2 PNG e race su result_urls
    //  - doppio costo provider AI
    //
    // Logica: se la sessione è già in stato "processing" e processing_started_at
    // è recente (< 170s, stessa soglia dead-detection client), rifiutiamo
    // questa invocation con 409 Conflict. Il client può continuare a fare
    // polling/realtime sulla sessione esistente.
    // Soglia 170s = se più vecchia, è dead (edge function killata) e
    // l'utente può ri-tentare legittimamente.
    if (session.status === "processing" && session.processing_started_at) {
      const ageSec = (Date.now() - new Date(session.processing_started_at as string).getTime()) / 1000;
      if (ageSec < 170) {
        logInfo({
          session_id,
          msg: "render_already_in_flight",
          age_sec: Math.round(ageSec),
        });
        return new Response(
          JSON.stringify({
            error: "already_in_flight",
            message: `Render già in corso per questa sessione (avviato ${Math.round(ageSec)}s fa). Attendere il risultato o riprovare tra qualche secondo.`,
            session_id,
            status: "processing",
          }),
          {
            status: 409,
            headers: { ...CORS, "Content-Type": "application/json" },
          },
        );
      }
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

    // ─────────────────────────────────────────────────────────────────────
    // v8.5 — BACKGROUND WORK PATTERN
    // Da qui in poi tutto il lavoro long-running (fetch reference images,
    // image generation, QA Vision, upload Storage, DB update finale) gira
    // in background via EdgeRuntime.waitUntil(). La function risponde 202
    // Accepted SUBITO al client (~2-3s totali) col session_id. Il frontend
    // userà SOLO polling su render_sessions per il risultato finale.
    //
    // Vantaggi:
    //   - Elimina il timeout 90s client / 150s server: il browser non
    //     aspetta piu' la fine del render
    //   - "Failed to send a request" non puo' piu' verificarsi per timeout
    //   - Se l'utente chiude il browser, il render continua e quando torna
    //     il polling lo trova fatto
    //
    // Trade-off: gli errori del background work non possono fare throw
    // (la response e' gia' partita). Vanno salvati in render_sessions con
    // status="failed" + error_message + refund credito.
    // ─────────────────────────────────────────────────────────────────────

    const backgroundWork = async (): Promise<void> => {
      try {
        await processRenderBackground({
          supabase,
          session,
          session_id: session_id!,
          user,
          normalizedConfig,
          blocks,
          promptVersion,
          composedPrompt: originalPrompt,
          systemPrompt,
          userPrompt,
          negativePrompt,
          referenceImageDescriptors: referenceImageDescriptors ?? [],
          target_width,
          target_height,
          revenueEur,
          purchaseId,
          requestStartMs,
        });
      } catch (bgErr) {
        const msg = bgErr instanceof Error ? bgErr.message : String(bgErr);
        logError({
          session_id,
          msg: "background_render_failed",
          error: msg,
        });
        // Refund credito + marca session failed (in DB, niente response)
        if (refundableCompanyId && refundableSessionId) {
          try {
            await refundRenderCreditSafe(supabase, {
              companyId: refundableCompanyId,
              sessionId: refundableSessionId,
              userId: user.id,
              reasonMeta: {
                vertical: "infissi",
                edge_fn: "generate-render",
                error: msg.substring(0, 500),
                background_failure: true,
              },
              logTag: "generate-render-bg",
            });
          } catch (refundErr) {
            logError({
              session_id,
              msg: "refund_failed_background",
              error: String(refundErr),
            });
          }
        }
        try {
          await supabase
            .from("render_sessions")
            .update({
              status: "failed",
              error_message: msg.substring(0, 500),
              processing_completed_at: new Date().toISOString(),
            })
            .eq("id", session_id!);
        } catch (updateErr) {
          logError({
            session_id,
            msg: "background_failed_session_update_error",
            error: String(updateErr),
          });
        }
      }
    };

    // Spawn background work. EdgeRuntime.waitUntil tiene la function viva
    // fino al completamento (o al cap 150s del runtime) senza bloccare la
    // response al client.
    // deno-lint-ignore no-explicit-any
    const edgeRuntime = (globalThis as any).EdgeRuntime;
    if (edgeRuntime && typeof edgeRuntime.waitUntil === "function") {
      edgeRuntime.waitUntil(backgroundWork());
    } else {
      // Fallback: se EdgeRuntime non disponibile (dev locale Deno standalone)
      // lo lanciamo fire-and-forget. In produzione Supabase usa il primo path.
      void backgroundWork();
    }

    logInfo({
      session_id,
      msg: "background_render_spawned",
      elapsed_sync_ms: elapsed(),
    });

    return new Response(
      JSON.stringify({
        success: true,
        session_id,
        status: "processing",
        prompt_version: promptVersion,
        message: "Render in elaborazione. Usa il polling su render_sessions per il risultato.",
      }),
      {
        status: 202,
        headers: { ...CORS, "Content-Type": "application/json" },
      },
    );
  } catch (err: unknown) {
    return handleSyncError({
      err,
      supabase,
      user,
      refundableSessionId,
      refundableCompanyId,
      creditDeducted,
      providerChain,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// v8.5 — Background render work (originalmente inline nell'handler).
// Tutto qui dentro gira in EdgeRuntime.waitUntil quindi NON tira eccezioni
// al client. Errori salvati in render_sessions.
// ─────────────────────────────────────────────────────────────────────────────

interface BackgroundRenderArgs {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  // deno-lint-ignore no-explicit-any
  session: any;
  session_id: string;
  user: { id: string };
  normalizedConfig: WindowRenderConfig;
  blocks: Record<string, string>;
  promptVersion: string;
  composedPrompt: string;
  systemPrompt: string;
  userPrompt: string;
  negativePrompt: string;
  // deno-lint-ignore no-explicit-any
  referenceImageDescriptors: any[];
  target_width?: number;
  target_height?: number;
  revenueEur: number;
  purchaseId: string | null | undefined;
  requestStartMs: number;
}

async function processRenderBackground(args: BackgroundRenderArgs): Promise<void> {
  const {
    supabase,
    session,
    session_id,
    user,
    normalizedConfig,
    blocks,
    promptVersion,
    target_width,
    target_height,
    revenueEur,
    purchaseId,
    requestStartMs,
  } = args;
  let composedPrompt = args.composedPrompt;
  const { negativePrompt, referenceImageDescriptors } = args;

  const elapsed = () => Date.now() - requestStartMs;

  const providerChain: Array<Record<string, unknown>> = [];

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

    // ── v8.3.3 — Fetch reference photos (mazzetta, maniglia, profilo) ────
    // Le passiamo INSIEME alla sorgente al modello multi-image così l'AI
    // ha ancore visive forti sul colore/modello target. Fetch in parallelo
    // con timeout 8s ciascuna: se una fallisce, la skipiamo silenziosamente.
    // v8.6.22 — Telemetry HIT/MISS per validare in prod il guadagno reale
    // della cache module-scope vs cold-start dell'isolate Deno.
    let cacheHits = 0;
    let cacheMisses = 0;
    let cacheNegativeHits = 0;
    const fetchReferenceImage = async (
      ref: { url: string; label: string; filename: string },
    ): Promise<{ label: string; dataUrl: string } | null> => {
      // v8.6.21 — cache lookup: stesso URL = stesso content (file statici CDN).
      // Su cache HIT salta fetch + base64 conversion (~1-3s).
      const cached = REFERENCE_IMAGE_CACHE.get(ref.url);
      if (cached) {
        cacheHits += 1;
        return { label: ref.label, dataUrl: cached.dataUrl };
      }
      cacheMisses += 1;
      // Se questo URL è recentemente fallito, evita di ribloccarci per altri 8s
      const lastFailureAt = REFERENCE_IMAGE_CACHE_NEGATIVE.get(ref.url);
      if (lastFailureAt && Date.now() - lastFailureAt < REFERENCE_NEGATIVE_TTL_MS) {
        cacheNegativeHits += 1;
        return null;
      }
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const resp = await fetch(ref.url, { signal: ctrl.signal });
        clearTimeout(t);
        if (!resp.ok) {
          logWarn({
            session_id,
            msg: "reference_image_fetch_failed",
            url: ref.url,
            status: resp.status,
          });
          REFERENCE_IMAGE_CACHE_NEGATIVE.set(ref.url, Date.now());
          return null;
        }
        const blob = await resp.blob();
        const mime = blob.type || "image/webp";
        // v8.6.3 — Skip mimetype NON supportati da OpenAI/OpenRouter.
        // OpenAI Images API accetta SOLO image/jpeg, image/png, image/webp.
        // AVIF, HEIC, TIFF etc. causano 400 "unsupported_file_mimetype"
        // su image[N] → fallimento intera catena render.
        const SUPPORTED_MIMETYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
        if (!SUPPORTED_MIMETYPES.includes(mime.toLowerCase())) {
          logWarn({
            session_id,
            msg: "reference_image_skipped_unsupported_mimetype",
            url: ref.url,
            mime,
            label: ref.label,
          });
          REFERENCE_IMAGE_CACHE_NEGATIVE.set(ref.url, Date.now());
          return null;
        }
        const buf = await blob.arrayBuffer();
        const b64 = uint8ToBase64(new Uint8Array(buf));
        const result = { label: ref.label, dataUrl: `data:${mime};base64,${b64}` };
        // Cache positive: label è specifico del render, dataUrl è il contenuto
        // riusabile. Salviamo dataUrl + label originale del primo fetch (il
        // label specifico dell'invocation viene ricostruito sopra).
        REFERENCE_IMAGE_CACHE.set(ref.url, result);
        return result;
      } catch (e) {
        logWarn({
          session_id,
          msg: "reference_image_fetch_error",
          url: ref.url,
          error: (e as Error).message?.substring(0, 200),
        });
        REFERENCE_IMAGE_CACHE_NEGATIVE.set(ref.url, Date.now());
        return null;
      }
    };

    const referenceImagesFetched: Array<{ label: string; dataUrl: string }> =
      referenceImageDescriptors && referenceImageDescriptors.length > 0
        ? (await Promise.all(
          referenceImageDescriptors.map(fetchReferenceImage),
        )).filter(
          (x): x is { label: string; dataUrl: string } => x !== null,
        )
        : [];

    logInfo({
      session_id,
      msg: "reference_images_ready",
      requested: referenceImageDescriptors?.length ?? 0,
      fetched: referenceImagesFetched.length,
      labels: referenceImagesFetched.map((r) => r.label.substring(0, 80)),
      // v8.6.22 — cache telemetry per misurare ROI in produzione
      cache_hits: cacheHits,
      cache_misses: cacheMisses,
      cache_negative_hits: cacheNegativeHits,
      cache_size: REFERENCE_IMAGE_CACHE.size,
    });

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
          referenceImages: referenceImagesFetched.length > 0
            ? referenceImagesFetched
            : undefined,
          effectiveWidth: prepared.effective_width ?? undefined,
          effectiveHeight: prepared.effective_height ?? undefined,
          negativePrompt,
          // v8.5.4 — Timeout per-provider 75s → 90s.
          // OpenAI direct (gpt-image-1, quality medium) impiega legittimamente
          // 60-80s per render complessi con 4-6 reference images. 75s era
          // troppo stretto: tagliava render in corso. Con 90s OpenAI ha
          // margine + fallback rapido a Tier 2 se davvero blocca.
          // Compatibile con budget edge function 150s grazie a background work.
          timeoutMs: 90_000,
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

    // v8.5 — composedPrompt e' gia' inizializzato dall'argomento all'inizio
    // di processRenderBackground (let composedPrompt = args.composedPrompt).
    let candidate = await generateCandidate(composedPrompt);
    let generationAttempts = 1;

    // v8.6.22 — Cache lazy della base64 della source image.
    // sourceBlob viene convertito in base64 sia per la chiamata QA (riga ~927)
    // sia per il retry corrective (dentro editImage → ensureSourceDataUrl).
    // Calcoliamo una sola volta e riusiamo. Risparmio: -300/800ms per blob
    // 1-3MB su render con QA attiva (60% dei render) + retry (~25% dei QA).
    let cachedSourceDataUrl: string | null = null;
    const getSourceDataUrl = async (): Promise<string> => {
      if (cachedSourceDataUrl) return cachedSourceDataUrl;
      const buf = await sourceBlob.arrayBuffer();
      const b64 = uint8ToBase64(new Uint8Array(buf));
      const mime = sourceBlob.type || "image/jpeg";
      cachedSourceDataUrl = `data:${mime};base64,${b64}`;
      return cachedSourceDataUrl;
    };

    // ── v8.3.7 — QA Vision MULTI-CRITERION ──────────────────────────────
    // Esegue su 10 categorie quando ci sono fattori di rischio attivi.
    // Se anche una categoria fallisce → retry mirato con istruzioni
    // correttive specifiche per ogni issue.
    // Graceful: se il vision provider fa errore, il render originale passa
    // comunque (callVisionQa ritorna {checked: false}).
    //
    // v8.6.21 — SKIP QA condizionale per render "facili":
    // se la config non ha trasformazioni rischiose (compositionChange,
    // cassonetto.replace, shutter motorizzata, nodo asimmetrico/maniglia
    // centrale, traverso da rimuovere), il render è solo frame+colore →
    // QA storicamente al 95%+ pass al primo tentativo. Skip = ~6s
    // salvati per render. Env RENDER_QA_FORCE_ON=1 per forzare debug.
    let qaIssuesForLog: QaIssue[] = [];
    let qaModelUsed: string | null = null;
    const qaForceOn = Deno.env.get("RENDER_QA_FORCE_ON") === "1";
    const riskFactors = normalizedConfig.technical_specification.some((s) => {
      const transomRequiresRemoval = typeof s.transomRule === "string" &&
        s.transomRule.toUpperCase().includes("REMOVE");
      return Boolean(
        s.compositionChange ||
          s.shutter.isMotorized ||
          s.cassonetto.replace ||
          s.centralHandle ||
          s.reducedNode ||
          transomRequiresRemoval,
      );
    });
    const shouldRunQa = qaForceOn || riskFactors;
    if (!shouldRunQa) {
      logInfo({
        session_id,
        msg: "qa_skipped_easy_render",
        reason: "no risk factors: frame change only",
        elapsed_ms: elapsed(),
      });
    }
    if (shouldRunQa) {
      // v8.6.22 — usa la helper cached invece di riconvertire sourceBlob
      const sourceDataUrl = await getSourceDataUrl();
      const qaResult = await callVisionQa({
        sourceImageDataUrl: sourceDataUrl,
        candidateImageDataUrl: candidate.imageDataUrl,
        qaPrompt: buildMultiCriterionQaPrompt(normalizedConfig),
        metadata: {
          task_kind: "render_image_qa",
          company_id: session.company_id as string,
          session_id,
        },
      });

      qaModelUsed = qaResult.modelUsed ?? null;

      // Parse strutturato delle issues: ogni issue deve avere {category, detail}
      // ma il vision provider potrebbe ritornare stringhe legacy o variazioni.
      const parsedIssues: QaIssue[] = [];
      for (const raw of qaResult.issues) {
        if (typeof raw === "string") {
          // Stringa legacy → tenta best-effort detection categoria
          const lower = raw.toLowerCase();
          let cat: QaCategory = "recolor_instead_of_replace";
          if (lower.includes("belt") || lower.includes("cord") || lower.includes("cinghia")) {
            cat = "manual_shutter_control_visible";
          } else if (lower.includes("handle") || lower.includes("maniglia")) {
            cat = "old_handle_kept";
          } else if (lower.includes("cassonetto")) {
            cat = "cassonetto_recolored_not_replaced";
          } else if (lower.includes("curtain") || lower.includes("lamp") || lower.includes("plant")) {
            cat = "objects_invented";
          } else if (lower.includes("swatch")) {
            cat = "swatch_pasted_in_scene";
          } else if (lower.includes("muntin") || lower.includes("rectangle")) {
            cat = "residual_sash_subdivisions";
          } else if (lower.includes("stile") || lower.includes("lateral")) {
            cat = "lateral_stiles_old_color";
          } else if (lower.includes("sash count") || lower.includes("mullion") || lower.includes("composition")) {
            cat = "sash_count_mismatch";
          }
          parsedIssues.push({ category: cat, detail: raw });
        } else if (raw && typeof raw === "object") {
          const r = raw as { category?: string; detail?: string };
          const cat = (QA_CATEGORIES as readonly string[]).includes(r.category ?? "")
            ? (r.category as QaCategory)
            : "recolor_instead_of_replace";
          parsedIssues.push({
            category: cat,
            detail: r.detail ?? "(no detail)",
          });
        }
      }
      qaIssuesForLog = parsedIssues;

      // v8.4.3 — Budget time-aware: il retry corrective consuma altri 30-60s.
      // Se siamo gia' oltre QA_RETRY_BUDGET_MS (90s), saltiamo il retry e
      // consegniamo il primo render anche se imperfetto. Evita il kill a 150s.
      const elapsedNow = elapsed();
      const canRetry = elapsedNow < QA_RETRY_BUDGET_MS;

      if (qaResult.checked && !qaResult.pass && parsedIssues.length > 0 && canRetry) {
        logInfo({
          session_id,
          msg: "qa_failed_retry_corrective",
          qa_model: qaResult.modelUsed,
          issue_categories: parsedIssues.map((i) => i.category),
          issues_count: parsedIssues.length,
          elapsed_ms: elapsedNow,
        });
        composedPrompt = buildRetryPrompt(
          composedPrompt,
          normalizedConfig,
          parsedIssues,
        );
        candidate = await generateCandidate(composedPrompt);
        generationAttempts = 2;
      } else if (qaResult.checked && !qaResult.pass && parsedIssues.length > 0 && !canRetry) {
        // QA fail ma siamo a corto di tempo. Logging speciale: consegniamo
        // primo render con issue note per audit, ma non rilanciamo.
        logWarn({
          session_id,
          msg: "qa_failed_retry_skipped_budget_exhausted",
          qa_model: qaResult.modelUsed,
          issue_categories: parsedIssues.map((i) => i.category),
          elapsed_ms: elapsedNow,
          budget_ms: QA_RETRY_BUDGET_MS,
        });
      } else if (qaResult.checked && qaResult.pass) {
        logInfo({
          session_id,
          msg: "qa_passed_first_attempt",
          qa_model: qaResult.modelUsed,
        });
      } else if (!qaResult.checked) {
        logWarn({
          session_id,
          msg: "qa_skipped_provider_unavailable",
        });
      }
    }

    // ── Upload risultato su Storage ──────────────────────────────────────
    // v8.6.2 — RIMOSSO imagescript resize post-process introdotto in v8.5.6.
    // Causa probabile del blocco "Elaborazione AI 15% per 5 minuti": l'import
    // dinamico da deno.land/x può avere cold-start fino a 30-60s su Supabase
    // Edge runtime, oppure il WASM init pianta silenziosamente la function.
    // Il problema "render tagliato rispetto a source" e' meglio risolto lato
    // CLIENT (CSS object-fit nel BeforeAfterSlider) che lato server.
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
        // v8.3.6 — Observability multi-image pipeline:
        // requested = quante reference dovevamo passare al modello
        // fetched  = quante sono state effettivamente scaricate da Cloudflare
        // labels   = label semantiche delle reference inviate (debug)
        reference_images_requested: referenceImageDescriptors?.length ?? 0,
        reference_images_fetched: referenceImagesFetched.length,
        reference_images_labels: referenceImagesFetched.map((r) =>
          r.label.substring(0, 100)
        ),
        // v8.3.7 — Observability QA Vision multi-criterion:
        // model     = quale provider vision ha risposto (Gemini Flash/Claude/GPT-4o-mini)
        // categories = categorie di failure rilevate al primo tentativo (vuoto = pass)
        // count     = totale issue rilevate (utile per dashboard %)
        // retried   = true se generationAttempts > 1 (QA ha forzato retry)
        qa_vision_model: qaModelUsed,
        qa_issue_categories: qaIssuesForLog.map((i) => i.category),
        qa_issues_count: qaIssuesForLog.length,
        qa_retried: generationAttempts > 1,
        // v8.4.3 — Tempo totale processing (server-side) per audit budget
        total_processing_ms: elapsed(),
        budget_ms: TOTAL_BUDGET_MS,
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

    // v8.5 — Background work: niente piu' return Response qui.
    // Il risultato e' gia' salvato in render_sessions; il client lo prende
    // via polling. Logging finale per audit.
    logInfo({
      session_id,
      msg: "background_render_completed",
      provider: candidate.providerUsed,
      model: candidate.modelUsed,
      attempts: generationAttempts,
      total_ms: elapsed(),
    });
  // Chiusura processRenderBackground (refactor v8.5)
}

// ─────────────────────────────────────────────────────────────────────────────
// v8.5 — Handler errori sync (auth, validation, deduct, idempotency).
// Solo gli errori che bloccano l'avvio del background work arrivano qui.
// Gli errori del background work sono gestiti dentro processRenderBackground
// e salvati direttamente in render_sessions.
// ─────────────────────────────────────────────────────────────────────────────

interface SyncErrorArgs {
  err: unknown;
  // deno-lint-ignore no-explicit-any
  supabase: any;
  user: { id: string };
  refundableSessionId: string | null;
  refundableCompanyId: string | null;
  creditDeducted: boolean;
  providerChain: Array<Record<string, unknown>>;
}

async function handleSyncError(args: SyncErrorArgs): Promise<Response> {
  const { err, supabase, user, refundableSessionId, refundableCompanyId, creditDeducted, providerChain } = args;
  if (err instanceof Response) return err;
  const msg = err instanceof Error ? err.message : String(err);
  logError({
    session_id: refundableSessionId,
    msg: "render_sync_failed",
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
