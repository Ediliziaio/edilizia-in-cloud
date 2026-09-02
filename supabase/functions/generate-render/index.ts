// generate-render — Edge Function EiC
// Render Infissi AI — pipeline unificata via _shared/ai-provider/
//
// v8.6.32 — Gemini eliminato dal sistema. Stack attuale:
//   image edit  → OpenAI gpt-image-1 (direct) → OpenRouter gpt-5-image
//   prompt rewrite → OpenAI gpt-4o-mini → gpt-4o (via OpenRouter)
//   QA vision   → Claude Haiku → GPT-4o-mini → GPT-4o
//   scene analyze → OpenAI Vision (gpt-4o-mini)
//
// Pattern: meta-prompt rewriter come path UNICO; block-based prompt resta
// come safety net silent quando il rewriter LLM fallisce su tutta la chain.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { captureRealCost } from "../_shared/renderCost.ts";
import { prepareInputImage } from "../_shared/renderImage.ts";
import {
  describeFormatMismatch,
  detectImageDimensions,
  expectedOutputSize,
} from "../_shared/imageDimensions.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { checkPaymentMethod, PAYMENT_METHOD_REQUIRED_MESSAGE } from "../_shared/requirePaymentMethod.ts";
import { deductRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";
import {
  editImage,
  type ImageProviderAttempt,
} from "../_shared/ai-provider/image.ts";
import { callVisionQa } from "../_shared/ai-provider/visionQa.ts";
import { rewriteToMetaPrompt } from "../_shared/ai-provider/metaPromptRewriter.ts";
import { buildWindowPrompt } from "../../../shared/render-window/windowPromptBuilder.ts";
import type { WindowRenderConfig } from "../../../shared/render-window/types.ts";

/**
 * data:image/...;base64,XXX -> byte grezzi. Usata sia per misurare il formato
 * del render sia per l'upload finale su storage.
 */
function dataUrlBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

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

// v8.6.29 — QA Vision SEMPLIFICATA da 13 categorie a 3 holistic.
// Razionale: con meta-prompt rewriter come path unico, la maggior parte
// dei vecchi failure mode (recolor, old handle, stiles, transom, hinge
// count, cassonetto invention) sono catturati a monte dal prompt corretto.
// QA serve solo come safety net su 3 categorie macro che il modello
// image può ancora sbagliare:
//   - composition_mismatch: la finestra renderizzata non matcha la spec
//     (sash count, profilo, colore, cassonetto style, transom)
//   - scene_corruption: la scena fuori dalla finestra è stata modificata
//     (oggetti inventati, view alterata, parete ripinta, swatch pasted)
//   - residual_old_window: l'AI ha "recolorato" invece di sostituire
//     (mantenuta geometria vecchia + handle vecchio + cinghia visibile)
const QA_CATEGORIES = [
  "composition_mismatch",
  "scene_corruption",
  "residual_old_window",
  // Aggiunta dopo un controllo negativo sul QA: gli si e' dato in pasto un
  // render che allargava la finestra e ridipingeva le piastrelle intorno, e
  // l'ha PROMOSSO. Nessuna delle tre categorie precedenti chiede se
  // l'inquadratura sia rimasta la stessa, e l'istruzione finale "sii
  // indulgente" spingeva a passare. Era il difetto numero uno segnalato
  // dall'utente ("il sistema ha allargato la finestra e cambia lo sfondo").
  "framing_changed",
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
  const finish = spec
    ? `${spec.finish.name}${spec.finish.ral ? ` RAL ${spec.finish.ral}` : ""}`
    : "(unspecified)";
  const sashCount = spec?.compositionChange
    ? `${spec.compositionChange.toSashCount} (composition change from ${spec.compositionChange.fromSashCount})`
    : `${spec?.desiredSashCount ?? "?"}`;
  const transomMustBeRemoved = typeof spec?.transomRule === "string" &&
    spec.transomRule.toUpperCase().includes("REMOVE");
  const targetedOpening = spec
    ? config.scene_analysis.openings.find((o) => o.id === spec.openingId)
    : undefined;
  const cassStyle = targetedOpening?.cassonettoStyle ?? "unknown";

  // Elenco esplicito di cio' che l'utente HA CHIESTO di cambiare.
  // Senza questo elenco il criterio [scene_corruption] ("FAIL se qualcosa fuori
  // dal vano finestra e' stato modificato") boccia proprio le modifiche
  // richieste: il cassonetto sta SOPRA il vano, quindi sostituirlo — come da
  // configurazione — veniva segnalato come corruzione della scena.
  // Misurato sulla sessione 11a3ebc5: due segnalazioni su due erano di questo
  // tipo, e sono costate un retry (~0.08 EUR e 40s) su un render corretto.
  const modificheAutorizzate: string[] = [
    `the window/frame inside opening ${spec?.openingId ?? "?"}`,
  ];
  if (spec?.cassonetto.replace) {
    modificheAutorizzate.push(
      `the cassonetto / roller box above opening ${spec.openingId}: the user asked to REPLACE it, so a NEW box in the new finish${
        spec.cassonetto.colorLabel ? ` (${spec.cassonetto.colorLabel})` : ""
      } is the CORRECT result — do NOT report it as scene corruption or as an unrequested architectural change, even if the source box looked different (wooden, external, recessed)`,
    );
  }
  if (spec?.shutter.replace) {
    modificheAutorizzate.push(
      `the roller shutter of opening ${spec.openingId}: the user asked to replace it`,
    );
  }
  if (spec?.shutter.electricButton?.install) {
    modificheAutorizzate.push(
      `a NEW electric roller-shutter switch plate on the wall beside opening ${spec.openingId}: ` +
      `the shutter is motorized, so the old manual control is removed and this small switch takes ` +
      `its place. It is part of the ordered work — never report it as an invented object`,
    );
  }
  if (spec?.compositionChange) {
    modificheAutorizzate.push(
      `the internal subdivision of opening ${spec.openingId}: going from ${spec.compositionChange.fromSashCount} to ${spec.compositionChange.toSashCount} sashes is requested, so a different mullion layout is CORRECT`,
    );
  }

  return `You are a holistic QC inspector for Italian window-replacement renders.
You receive TWO IMAGES:
- Image 1 = SOURCE PHOTO (existing window)
- Image 2 = CANDIDATE RENDER (proposed new window in same room)

AUTHORISED CHANGES — these are the work the customer ordered. A difference here
is expected and must NEVER be reported as an issue:
${modificheAutorizzate.map((r) => `- ${r}`).join("\n")}

EXPECTED CHANGES (per user config):
- Target opening: ${spec?.openingId ?? "?"} (other openings unchanged)
- New frame: ${spec?.material ?? "?"} · ${finish}
- Sash count target: ${sashCount}
- Transom: ${transomMustBeRemoved ? "MUST be REMOVED (full-height glass)" : "preserve as source"}
- Cassonetto style in source: ${cassStyle}${spec?.cassonetto.replace ? " · user requested REPLACE" : " · preserve as source"}
- Shutter: ${spec?.shutter.replace ? `replace${spec.shutter.colorLabel ? ` (color: ${spec.shutter.colorLabel})` : ""}` : "preserve as source"}${spec?.shutter.isMotorized ? " · motorized (no manual belt should appear)" : ""}

Check ONLY these 3 holistic categories:

1. [composition_mismatch] — Does the rendered window match the spec? Verify: sash count, profile material/color, cassonetto style (no invented box if source had none / monoblocco preserved if source has recessed monoblocco), transom (removed if requested), hinge count reasonable for the profile, handle position. FAIL only on clear discrepancies, not minor finish variations.

2. [scene_corruption] — Are room/walls/floor/ceiling/outdoor-view/furniture in Image 2 identical to Image 1? Did the AI invent objects (curtains, lamps, plants, sensors), recolor walls, alter the outdoor view, or paste swatch rectangles/product thumbnails into the scene? FAIL if anything outside the AUTHORISED CHANGES listed above was modified. A difference that is listed under AUTHORISED CHANGES is the requested work, NOT a defect: never report it.

3. [framing_changed] — Has the SCENE been recomposed?

   FIRST, what is NOT a defect. The render is always produced at one of three fixed picture shapes, chosen as the closest to the source photo. So the two images will NEVER have exactly the same proportions, and Image 2 will normally show a slightly taller or slightly wider view than Image 1. That difference alone is EXPECTED — never report it.

   What IS a defect is the scene being REBUILT to fill the new shape. Judge by the physical objects, not by the picture proportions:
   - The opening must keep the same width RELATIVE TO ITS OWN WALL. Count the tiles, bricks or wall panels beside it: if the opening now covers noticeably more or fewer of them, FAIL.
   - Every object present in Image 1 must still be there, unchanged: shelves, decorative tile borders, radiators, sills, switches, furniture. If one disappeared, moved, or was re-drawn differently, FAIL.
   - No surface may be INVENTED to fill space: new wall, new tiles, new floor or new ceiling that Image 1 did not show. Simply seeing a little more of a surface that was already there is fine; seeing a surface that did not exist is not.

   A widened opening and re-drawn surroundings make the simulation show a room the customer does not own. Do NOT apply the leniency rule below to a scene that has been rebuilt — but do NOT fail a render merely because the picture shape differs.

4. [residual_old_window] — Did the AI just RECOLOR the old window keeping the same geometry, old handle, old mullion thickness, old hinges, or leave residual artifacts like dark rectangles from old transoms / manual belt straps when motorization specified? FAIL if the new window is recognizably the old one with a color filter.

Return ONLY this JSON, no prose:
{
  "pass": boolean,
  "issues": [
    {"category": "<one of the ${QA_CATEGORIES.length} keys>", "detail": "<1-line description>"}
  ]
}
Categories MUST be one of: ${QA_CATEGORIES.join(", ")}.
If all ${QA_CATEGORIES.length} categories pass, return {"pass": true, "issues": []}.
Be LENIENT on finish, colour and material nuances: this is a sanity check, not a pixel-perfect inspection. Pass if the render is broadly acceptable.
The leniency does NOT extend to a scene that has been REBUILT (see [framing_changed]): a widened opening or invented surroundings are always a failure, however pretty the result. A merely different picture shape is not.`;
}

// v8.6.29 — Corrective fragments semplificati: 3 categorie holistic.
function buildCorrectiveFragmentForCategory(
  category: QaCategory,
  _config: WindowRenderConfig,
): string {
  switch (category) {
    case "composition_mismatch":
      return "Re-render strictly following the original specification (sash count, profile, color, cassonetto style, transom, hinges, handle position). Do NOT deviate from the user's choices.";
    case "scene_corruption":
      return "Preserve the room, furniture, walls, ceiling, floor, and outdoor view IDENTICAL to the source photo. Do NOT invent objects (curtains, lamps, plants, sensors), do NOT recolor walls, do NOT alter the outdoor view, do NOT paste swatch rectangles or product thumbnails into the scene. The only changes allowed are inside the target window opening.";
    case "framing_changed":
      return "Keep the EXACT SAME camera framing as the source photo. The window opening must occupy the same fraction of the image width, with the same amount of wall, tiles, furniture, ceiling and floor visible around it. Do NOT widen or narrow the opening, do NOT zoom, do NOT recompose the scene, do NOT invent surrounding surfaces to fill space. The customer must recognise their own room.";
    case "residual_old_window":
      return "ERASE the old window entirely. Draw a BRAND NEW physical window: different geometry, different mullion thickness, new handle (different shape from the old one), new hinges, frame color in ALL surfaces (front + lateral stiles + top + bottom + mullion). Remove any residual muntin segments, georgian bars, or manual belt/cord/winder. This is a physical replacement, not a color filter.";
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
    const { session_id, config, target_width, target_height, refine } = body as {
      session_id?: string;
      config?: Record<string, unknown>;
      target_width?: number;
      target_height?: number;
      /** F4 — correzione mirata del risultato precedente (image-to-image). */
      refine?: boolean;
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

    // Gate "carta obbligatoria": il render documenti/infissi ha un costo (AI image).
    const pmCheck = await checkPaymentMethod(supabase, session.company_id as string);
    if (!pmCheck.allowed) {
      return new Response(
        JSON.stringify({ error: pmCheck.message ?? PAYMENT_METHOD_REQUIRED_MESSAGE, code: "payment_method_required" }),
        { status: 402, headers: { ...CORS, "Content-Type": "application/json" } },
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

    // ── F4 — Refinement mirato (correzione del risultato precedente) ─────
    // Valido solo su sessione COMPLETED con risultato: usiamo il render come
    // immagine sorgente e la nota utente come istruzione correttiva. Se le
    // condizioni non ci sono, degrada a generazione normale.
    let refineSourcePath: string | null = null;
    if (
      refine === true &&
      session.status === "completed" &&
      Array.isArray(session.result_urls) &&
      session.result_urls.length > 0
    ) {
      const match = String(session.result_urls[0]).match(/render-results\/(.+)$/);
      refineSourcePath = match ? decodeURIComponent(match[1]) : null;
    }
    const isRefine = refineSourcePath !== null;

    // ── Idempotency check ─────────────────────────────────────────────────
    // (saltato per i refine: la sessione è per definizione già completed con
    // lo stesso config — il refine DEVE rigenerare, non tornare la cache)
    const idempotencyKey = await computeIdempotencyKey(session_id, rawConfig);
    if (
      !isRefine &&
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

    // ── F1 (audit 16/07) — CLAIM ATOMICO prima del deduct ────────────────
    // Il vecchio guard leggeva status e poi (più avanti) lo aggiornava: due
    // invocation simultanee passavano entrambe → 2 deduct + 2 costi provider.
    // claim_render_session fa lock FOR UPDATE + update condizionale in un
    // colpo solo: UNA sola invocation ottiene il claim, l'altra riceve 409.
    // Il claim mette anche status='processing' → l'ordine deduct/processing
    // è invertito rispetto a prima (claim → deduct → lavoro).
    const { data: claimRaw, error: claimErr } = await supabase.rpc(
      "claim_render_session",
      { _session_id: session_id, _stale_seconds: 170, _allow_completed: isRefine },
    );
    if (claimErr) {
      throw new Error(`claim_render_session failed: ${claimErr.message}`);
    }
    const claim = claimRaw as {
      claimed: boolean;
      reason?: string;
      age_sec?: number;
      stale_takeover?: boolean;
    };
    if (!claim?.claimed) {
      const ageSec = claim?.age_sec ?? 0;
      logInfo({
        session_id,
        msg: "render_claim_rejected",
        reason: claim?.reason,
        age_sec: ageSec,
      });
      return new Response(
        JSON.stringify({
          error: "already_in_flight",
          message: `Render già in corso per questa sessione (avviato ${ageSec}s fa). Attendere il risultato o riprovare tra qualche secondo.`,
          session_id,
          status: "processing",
        }),
        {
          status: 409,
          headers: { ...CORS, "Content-Type": "application/json" },
        },
      );
    }

    // Takeover di un tentativo morto (isolate killata >170s fa): il consume
    // orfano del tentativo precedente va rimborsato PRIMA del nuovo deduct,
    // altrimenti l'utente paga 2 crediti per 1 render.
    if (claim.stale_takeover) {
      const { data: refundAll, error: refundAllErr } = await supabase.rpc(
        "refund_render_credit_all",
        {
          _company_id: session.company_id as string,
          _session_id: session_id,
          _reason_meta: { source: "stale_takeover", edge_fn: "generate-render" },
        },
      );
      logInfo({
        session_id,
        msg: "stale_takeover_refund",
        result: refundAll ?? null,
        error: refundAllErr?.message ?? null,
      });
    }

    // ── Deduct crediti ────────────────────────────────────────────────────
    // F4 — La PRIMA correzione entro 10 minuti dal render è inclusa (nessun
    // addebito): trasforma il "quasi giusto" in "giusto" senza far ricomprare.
    // Dalla seconda correzione in poi, o oltre la finestra, credito normale.
    const refinementsUsed = Number(
      ((session.meta as Record<string, unknown> | null)?.refinements_used as
        | number
        | undefined) ?? 0,
    );
    let freeRefine = false;
    if (isRefine) {
      const completedAtMs = session.processing_completed_at
        ? new Date(session.processing_completed_at as string).getTime()
        : 0;
      freeRefine = refinementsUsed === 0 &&
        completedAtMs > 0 &&
        Date.now() - completedAtMs < 10 * 60_000;
    }

    let revenueEur = 0;
    let purchaseId: string | null | undefined = null;
    if (freeRefine) {
      logInfo({
        session_id,
        msg: "free_refinement_no_deduct",
        refinements_used: refinementsUsed,
      });
    } else {
      const deductResult = await deductRenderCreditSafe(supabase, {
        companyId: session.company_id as string,
        sessionId: session_id,
        userId: user.id,
        reasonMeta: {
          vertical: "infissi",
          edge_fn: "generate-render",
          refinement: isRefine,
        },
        logTag: "generate-render",
      });

      if (deductResult.status === "insufficient") {
        // Rilascia il claim: la sessione torna 'pending' e l'utente può
        // riprovare dopo la ricarica (senza takeover-window di 170s).
        await supabase.rpc("release_render_session", { _session_id: session_id });
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
      revenueEur = deductResult.revenue_eur;
      purchaseId = deductResult.purchase_id;
    }

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
          negativePrompt,
          referenceImageDescriptors: referenceImageDescriptors ?? [],
          target_width,
          target_height,
          revenueEur,
          purchaseId,
          requestStartMs,
          refine: isRefine,
          refineSourcePath,
          refineNotes: String((rawConfig as { notes?: unknown }).notes ?? ""),
          refinementsUsed,
        });
      } catch (bgErr) {
        const msg = bgErr instanceof Error ? bgErr.message : String(bgErr);
        logError({
          session_id,
          msg: "background_render_failed",
          error: msg,
        });
        // Refund credito + marca session failed (in DB, niente response).
        // F1 (audit 16/07) — refund_render_credit_all al posto di v1: v1 si
        // blocca ("already_refunded") se la sessione ha GIÀ un refund da un
        // ciclo precedente → il consume del ciclo corrente restava non
        // rimborsato. refund_all rimborsa tutti i consume scoperti.
        if (refundableCompanyId && refundableSessionId) {
          try {
            const { data: refundAllRes, error: refundAllErr } = await supabase
              .rpc("refund_render_credit_all", {
                _company_id: refundableCompanyId,
                _session_id: refundableSessionId,
                _reason_meta: {
                  vertical: "infissi",
                  edge_fn: "generate-render",
                  error: msg.substring(0, 500),
                  background_failure: true,
                },
              });
            if (refundAllErr) throw new Error(refundAllErr.message);
            logInfo({
              session_id,
              msg: "background_refund_all",
              result: refundAllRes ?? null,
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
  // v8.6.33 — systemPrompt/userPrompt args morti rimossi: erano mai letti.
  // Il prompt effettivo è composedPrompt (block-based safety net) o quello
  // sovrascritto dal meta-prompt rewriter dentro processRenderBackground.
  negativePrompt: string;
  // deno-lint-ignore no-explicit-any
  referenceImageDescriptors: any[];
  target_width?: number;
  target_height?: number;
  revenueEur: number;
  purchaseId: string | null | undefined;
  requestStartMs: number;
  /** F4 — correzione mirata: usa il risultato precedente come sorgente. */
  refine?: boolean;
  refineSourcePath?: string | null;
  refineNotes?: string;
  refinementsUsed?: number;
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

  // F3 (audit 16/07) — Progress REALE verso il client. Scriviamo lo stage
  // corrente in meta.stage: il wizard lo riceve via Realtime (canale già
  // cablato su render_sessions) e lo mostra al posto della % simulata.
  // Fire-and-forget: un fallimento qui non deve mai toccare il render.
  // meta viene comunque riscritto per intero all'update finale di completed.
  const setStage = (stage: string) => {
    supabase
      .from("render_sessions")
      .update({ meta: { stage } })
      .eq("id", session_id)
      .then(() => {}, () => {});
  };
  setStage("ottimizzazione_prompt");

  // ── F4 (audit 16/07) — REFINEMENT MIRATO ─────────────────────────────
  // La sorgente è il RENDER precedente (non la foto originale) e il prompt
  // è una pura istruzione correttiva: niente rewriter (il prompt lungo
  // farebbe ri-restyling), niente QA (il confronto col source non ha più
  // senso semantico). Obiettivo: cambia SOLO ciò che la nota chiede.
  const isRefinePass = args.refine === true && !!args.refineSourcePath;
  if (isRefinePass) {
    const noteText = (args.refineNotes ?? "").trim();
    composedPrompt = [
      "You are refining an ALREADY APPROVED photorealistic render of an Italian window replacement. Image 1 is that render.",
      "Apply ONLY the corrections listed below. Everything else must remain as close to pixel-identical as possible: same room, same lighting, same camera angle, same crop, same window design except where the corrections say otherwise.",
      "",
      "CORRECTIONS REQUESTED BY THE CUSTOMER:",
      noteText || "(no specific notes — subtly improve installation realism only, change nothing else)",
      "",
      "Do NOT restyle the scene, do NOT regenerate from scratch, do NOT invent objects, do NOT change colors or components that the corrections do not mention.",
    ].join("\n");
    try {
      await supabase
        .from("render_sessions")
        .update({
          prompt_used: composedPrompt,
          prompt_char_count: composedPrompt.length,
        })
        .eq("id", args.session_id);
    } catch {
      // observability best-effort
    }
    logInfo({
      session_id: args.session_id,
      msg: "refinement_pass_prompt",
      notes_length: noteText.length,
    });
  }

  // ── v8.6.29 — META-PROMPT è ora il PATH UNICO (no env, no flag) ──────
  // La storia: block-based prompt aveva accumulato 25KB di regole +
  // 6 PRIORITY OVERRIDE + 13 categorie QA. Ogni nuova regola CONFONDEVA
  // di più il modello image (gpt-image-1) addestrato su prosa breve,
  // non su blocchi strutturati. Stesso pattern usato da OpenAI per
  // DALL-E: GPT-4 riscrive in prosa, DALL-E rende.
  //
  // Strategia (v8.6.32, post-rimozione Gemini): rewriter LLM testuale
  // (gpt-4o-mini → gpt-4o fallback) genera 300-500 parole di prosa
  // naturale dalla config strutturata. Il system prompt del rewriter è
  // il single source of truth per TUTTE le regole (cassonetto trichotomy,
  // sash count change, nodo asimmetrico, hinges, transom, ecc).
  //
  // Se il rewriter fallisce su entrambi i modelli della chain, fallback
  // al block-based originale (composedPrompt). Safety net mantenuto.
  // (Saltato nel refinement pass: il prompt correttivo è già pronto.)
  if (!isRefinePass) {
  try {
    const metaResult = await rewriteToMetaPrompt({
      config: args.normalizedConfig,
      metadata: {
        task_kind: "render_prompt_rewrite",
        company_id: session.company_id as string,
        session_id: args.session_id,
      },
    });
    if (metaResult) {
      // Prompt minimal: identity + prosa rewriter + 1 line negative.
      composedPrompt = [
        "You are an expert photorealistic Italian window-replacement render artist. Edit the source photo as instructed below. Output a clean photograph-quality result.",
        metaResult.userPrompt,
        "Avoid: cartoon, painterly, fake CGI, AI restyling, warped geometry, swatch rectangles, invented objects.",
      ].join("\n\n");

      // v8.6.30 — OBSERVABILITY: salva prosa rewriter + prompt finale subito
      // in render_sessions (anche se l'image gen poi fallisce). Senza questo,
      // è impossibile debuggare cosa è stato realmente mandato al modello.
      try {
        await supabase
          .from("render_sessions")
          .update({
            prompt_used: composedPrompt,
            prompt_char_count: composedPrompt.length,
          })
          .eq("id", args.session_id);
      } catch (saveErr) {
        // non bloccare il render se il save fallisce, ma logga
        logWarn({
          session_id: args.session_id,
          msg: "meta_prompt_save_to_db_failed",
          error: (saveErr as Error).message?.substring(0, 200),
        });
      }

      // v8.6.30 — LOG la prosa intera (truncated a 4000 char) così è ispezionabile
      // direttamente in Supabase Edge Function Logs senza dover query il DB.
      logInfo({
        session_id: args.session_id,
        msg: "meta_prompt_active",
        rewriter_model: metaResult.modelUsed,
        rewriter_latency_ms: metaResult.latencyMs,
        prose_length: metaResult.userPrompt.length,
        final_prompt_length: composedPrompt.length,
        // Prose intera (truncated solo se enorme)
        rewriter_prose: metaResult.userPrompt.length > 4000
          ? metaResult.userPrompt.substring(0, 4000) + "...[truncated]"
          : metaResult.userPrompt,
      });
    } else {
      logWarn({
        session_id: args.session_id,
        msg: "meta_prompt_fallback_to_legacy_blocks",
        reason: "rewriter_chain_failed_all_models",
      });
    }
  } catch (e) {
    logWarn({
      session_id: args.session_id,
      msg: "meta_prompt_exception_fallback_to_legacy_blocks",
      error: (e as Error).message?.substring(0, 200),
    });
  }
  } // fine if (!isRefinePass)

  const providerChain: Array<Record<string, unknown>> = [];

  // ── Prepara immagine input ───────────────────────────────────────────
  // F4 — Nel refinement la sorgente è il RENDER precedente (bucket
  // render-results), non la foto originale.
  setStage("preparazione_foto");
  const originalPath = isRefinePass
    ? (args.refineSourcePath as string)
    : (session.original_photo_url as string);
  const sourceBucket = isRefinePass ? "render-results" : "render-originals";
    const prepared = await prepareInputImage({
      supabase,
      bucket: sourceBucket,
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

    // RETE DI SICUREZZA SUL FORMATO. Le dimensioni arrivano solo da
    // target_width/target_height nel body: il frontend le calcola da
    // img.naturalWidth, ma se l'immagine non si carica non le manda e
    // pickOpenAISize ripiega su 1024x1024 quadrato. Su una foto di infisso —
    // quasi sempre VERTICALE — il modello deve ricomporre la scena per
    // riempire il quadrato, e finisce per tagliare cassonetto o davanzale.
    // Stessa protezione gia' applicata a bagno e stanza.
    let srcW = prepared.effective_width ?? target_width ?? undefined;
    let srcH = prepared.effective_height ?? target_height ?? undefined;
    if (!srcW || !srcH) {
      try {
        const probe = new Uint8Array(await sourceBlob.slice(0, 65536).arrayBuffer());
        const dim = detectImageDimensions(probe);
        if (dim) {
          srcW = dim.width;
          srcH = dim.height;
          logInfo({ msg: "source_dimensions_detected_from_bytes", width: srcW, height: srcH });
        }
      } catch (_e) { /* si resta sul default */ }
    }

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

    const generateCandidate = async (
      promptText: string,
      soloProviderDiretto = false,
    ) => {
      // F1 (audit 16/07) — Budget deadline-aware al posto del timeout fisso 90s.
      // La matematica vecchia (fino a 3 tentativi × 90s + backoff, × 2 tier)
      // arrivava a ~275s contro il cap runtime di 150s: l'isolate veniva
      // killata a metà → sessione zombie + credito perso. Ora:
      //  - maxRetries=0 → UN tentativo per tier (il fallback di affidabilità
      //    è il Tier 2, non il retry sullo stesso provider: un image-edit che
      //    fallisce dopo 60-80s raramente riesce ritentando identico)
      //  - timeout per tentativo ricavato dal budget residuo, riservando
      //    RESERVE_MS per QA + upload + update DB, mai oltre 75s
      //  - worst case: 2 tier × 65s = ~130s, dentro il budget 140s
      const RESERVE_MS = 25_000;
      const remaining = TOTAL_BUDGET_MS - elapsed() - RESERVE_MS;
      // Con un solo provider in catena non c'e' un secondo tier da finanziare:
      // il budget residuo va tutto al tentativo. Dividerlo comunque a meta' era
      // proprio cio' che mandava in timeout il provider diretto sul retry e
      // faceva scattare il fallback su OpenRouter.
      const perAttemptTimeout = Math.max(
        30_000,
        Math.min(75_000, Math.floor(remaining / (soloProviderDiretto ? 1 : 2))),
      );
      try {
        const result = await editImage({
          prompt: promptText,
          sourceImageBlob: sourceBlob,
          referenceImages: referenceImagesFetched.length > 0
            ? referenceImagesFetched
            : undefined,
          effectiveWidth: srcW,
          effectiveHeight: srcH,
          negativePrompt,
          timeoutMs: perAttemptTimeout,
          maxRetries: 0,
          directProviderOnly: soloProviderDiretto,
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
        // Traccia il formato di OGNI candidato: senza questo non si distingue
        // "il provider diretto ha rispettato la size e il retry l'ha rotta" da
        // "nessuno dei due l'ha mai rispettata", e le due cose si riparano in
        // punti diversi.
        const dimCandidato = detectImageDimensions(
          dataUrlBytes(result.imageDataUrl),
        );
        logInfo({
          session_id,
          msg: "candidato_formato",
          provider: result.providerUsed,
          model: result.modelUsed,
          size_richiesta: `${expectedOutputSize(srcW, srcH).width}x${expectedOutputSize(srcW, srcH).height}`,
          size_ottenuta: dimCandidato
            ? `${dimCandidato.width}x${dimCandidato.height}`
            : null,
        });
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
    setStage("generazione");
    // Il primo tentativo va SOLO sul provider diretto, con tutto il budget.
    //
    // Dividere il tempo a meta' per finanziare un secondo tier sembrava
    // prudente, ma il secondo tier e' OpenRouter — che ignora la size e
    // restituisce un quadrato. Si stava quindi sacrificando il tempo del
    // provider buono per pagare un fallback che produce un render con
    // l'inquadratura ricomposta. Misurato sulla sessione d655a562: il diretto
    // e' stato abortito a 53s (ne servivano ~60), il quadrato di OpenRouter e'
    // passato al QA e il cassonetto e' finito tagliato dal bordo superiore.
    //
    // Ora il diretto ha fino a 75s. Il fallback resta, ma come rete
    // sull'errore, non come coinquilino del budget.
    let candidate: Awaited<ReturnType<typeof generateCandidate>>;
    try {
      candidate = await generateCandidate(composedPrompt, true);
    } catch (primoErr) {
      logWarn({
        session_id,
        msg: "provider_diretto_fallito_si_passa_alla_catena",
        error: (primoErr as Error)?.message?.substring(0, 200),
        nota: "il formato potrebbe non essere rispettato dal fallback",
      });
      candidate = await generateCandidate(composedPrompt, false);
    }
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
    // F2 (audit 16/07) — QA SEMPRE attiva di default. Il check vision costa
    // ~€0.002 (Claude Haiku) contro €0.05+ di un render difettoso consegnato
    // al cliente: lo skip sui render "facili" risparmiava 6s ma lasciava
    // passare i difetti senza rete. RENDER_QA_SKIP_EASY=1 ripristina il
    // vecchio comportamento (skip senza risk factors) se mai servisse.
    const qaSkipEasy = Deno.env.get("RENDER_QA_SKIP_EASY") === "1";
    const riskFactors = normalizedConfig.technical_specification.some((s) => {
      const transomRequiresRemoval = typeof s.transomRule === "string" &&
        s.transomRule.toUpperCase().includes("REMOVE");
      // v8.6.25 — anche il caso "source NO cassonetto + utente NON aggiunge"
      // è ad alto rischio di invenzione: forza QA per pescarlo.
      const targetedOpening = normalizedConfig.scene_analysis.openings.find(
        (o) => o.id === s.openingId,
      );
      const cassonettoInventionRisk = targetedOpening &&
        !targetedOpening.hasCassonetto &&
        !s.cassonetto.replace;
      // v8.6.25 — cerniere nascoste = alto rischio modello le renderizza visibili
      const hiddenHingeRisk = s.hingeMode === "hidden";
      return Boolean(
        s.compositionChange ||
          s.shutter.isMotorized ||
          s.cassonetto.replace ||
          s.centralHandle ||
          s.reducedNode ||
          transomRequiresRemoval ||
          cassonettoInventionRisk ||
          hiddenHingeRisk,
      );
    });
    // F4 — QA saltata nel refinement: il confronto "source foto vs candidate"
    // non ha più senso quando la source è essa stessa un render approvato.
    const shouldRunQa = !isRefinePass && (qaForceOn || riskFactors || !qaSkipEasy);
    if (!shouldRunQa) {
      logInfo({
        session_id,
        msg: "qa_skipped_easy_render",
        reason: "no risk factors: frame change only",
        elapsed_ms: elapsed(),
      });
    }
    if (shouldRunQa) {
      setStage("controllo_qualita");
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

      // v8.6.29 — Parse semplificato (3 categorie holistic, no string legacy).
      const parsedIssues: QaIssue[] = [];
      for (const raw of qaResult.issues) {
        if (typeof raw === "string") {
          // Stringa free-text → assegniamo categoria di default residual_old_window.
          parsedIssues.push({ category: "residual_old_window", detail: raw });
        } else if (raw && typeof raw === "object") {
          const r = raw as { category?: string; detail?: string };
          const cat = (QA_CATEGORIES as readonly string[]).includes(r.category ?? "")
            ? (r.category as QaCategory)
            : "composition_mismatch";
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
          // Il dettaglio, non solo la categoria: senza il testo non si
          // distingue un difetto vero da un falso positivo del QA, e ogni
          // falso positivo costa una generazione in piu'.
          issues: parsedIssues.map((i) => `${i.category}: ${i.detail}`),
          issues_count: parsedIssues.length,
          elapsed_ms: elapsedNow,
        });
        composedPrompt = buildRetryPrompt(
          composedPrompt,
          normalizedConfig,
          parsedIssues,
        );

        // Il retry puo' peggiorare invece di migliorare. Il primo tentativo
        // esce da OpenAI diretto, che riceve `size` come parametro vero e
        // rispetta il formato; se il retry va in timeout la catena ripiega su
        // OpenRouter, dove il formato e' solo una riga di testo nel prompt —
        // e gpt-5-image la ignora, restituendo un 1024x1024. Su una foto di
        // infisso, quasi sempre verticale, il quadrato costringe il modello a
        // ricomporre: sparisce il cassonetto o il davanzale.
        // Visto in prod il 2026-09-01 sulla sessione 191ff913: sorgente
        // 689x916, primo tentativo corretto, retry quadrato che lo sostituiva.
        // Si accetta il retry solo se non rompe il formato che il primo
        // tentativo aveva gia' azzeccato.
        // Il confronto e' contro la size RICHIESTA al provider, non contro la
        // foto: il render esce sempre in una delle tre size OpenAI, quindi una
        // sorgente 689x916 non potra' mai coincidere con nessuna di esse.
        const formatoAtteso = expectedOutputSize(srcW, srcH);
        const primoTentativo = candidate;
        const primoDim = detectImageDimensions(dataUrlBytes(candidate.imageDataUrl));
        const primoFormatoOk = !describeFormatMismatch(formatoAtteso, primoDim);

        // Se il primo tentativo aveva gia' il formato giusto, il retry ha senso
        // solo se puo' mantenerlo: lo si vincola al provider diretto, l'unico
        // che rispetta la size. Cosi' non si paga un'immagine destinata a
        // essere scartata. Se il diretto non ce la fa, editImage solleva e si
        // tiene il primo tentativo senza spendere altro.
        let retryCandidate: Awaited<ReturnType<typeof generateCandidate>> | null =
          null;
        try {
          retryCandidate = await generateCandidate(composedPrompt, primoFormatoOk);
          generationAttempts = 2;
        } catch (retryErr) {
          logWarn({
            session_id,
            msg: "qa_retry_fallito_si_tiene_il_primo",
            error: (retryErr as Error)?.message?.substring(0, 200),
          });
        }

        const retryDim = retryCandidate
          ? detectImageDimensions(dataUrlBytes(retryCandidate.imageDataUrl))
          : null;
        const retryMismatch = retryCandidate
          ? describeFormatMismatch(formatoAtteso, retryDim)
          : "retry non disponibile";

        if (!retryCandidate) {
          candidate = primoTentativo;
        } else if (retryMismatch && primoFormatoOk) {
          logWarn({
            session_id,
            msg: "qa_retry_scartato_formato_peggiore",
            motivo: retryMismatch,
            primo: primoDim ? `${primoDim.width}x${primoDim.height}` : null,
            retry: retryDim ? `${retryDim.width}x${retryDim.height}` : null,
          });
          candidate = primoTentativo;
        } else {
          candidate = retryCandidate ?? primoTentativo;
        }
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
    setStage("salvataggio");
    const uint8 = dataUrlBytes(candidate.imageDataUrl);

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
    const providerKey = candidate.providerUsed === "openrouter"
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

    // F2 (audit 16/07) — Costi ausiliari nel costo reale. Prima veniva
    // catturato SOLO il costo dell'image-edit finale: rewriter meta-prompt
    // (~€0.001, gpt-4o-mini) e QA Vision (~€0.002 a passata, Claude Haiku)
    // restavano invisibili → margine sovrastimato in dashboard economics.
    // Stime flat conservative (le call non espongono sempre il costo reale).
    const AUX_COST_REWRITER_EUR = 0.001;
    const AUX_COST_QA_PASS_EUR = 0.002;
    const auxCostEur = AUX_COST_REWRITER_EUR +
      (qaModelUsed ? AUX_COST_QA_PASS_EUR : 0);
    const costReal = capture.cost_eur * generationAttempts + auxCostEur;
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
        // model     = quale provider vision ha risposto (Claude Haiku / GPT-4o-mini)
        // categories = categorie di failure rilevate al primo tentativo (vuoto = pass)
        // count     = totale issue rilevate (utile per dashboard %)
        // retried   = true se generationAttempts > 1 (QA ha forzato retry)
        qa_vision_model: qaModelUsed,
        qa_issue_categories: qaIssuesForLog.map((i) => i.category),
        qa_issues: qaIssuesForLog.map((i) => ({
          category: i.category,
          detail: i.detail?.substring(0, 300) ?? null,
        })),
        qa_issues_count: qaIssuesForLog.length,
        qa_retried: generationAttempts > 1,
        // F4 — contatore correzioni: la 1ª entro 10 min è gratis, poi credito.
        // Una generazione normale azzera il ciclo.
        refinements_used: isRefinePass ? (args.refinementsUsed ?? 0) + 1 : 0,
        is_refinement: isRefinePass,
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

    // F3 (audit 16/07) — Notifica campanella: il render è pronto anche se
    // l'utente ha chiuso la tab (il vecchio "Ti avviseremo quando è pronto"
    // della ProcessingCard ora è vero). Best-effort.
    try {
      await supabase.from("notifications").insert({
        company_id: session.company_id,
        user_id: user.id,
        type: "render_completed",
        title: "Il tuo render è pronto ✨",
        body: "Il render infissi è stato generato: aprilo dalla galleria per vederlo, scaricarlo o condividerlo col cliente.",
        entity_type: "render_session",
        entity_id: session_id,
        action_url: "/azienda/render/infissi/gallery",
        is_read: false,
        is_dismissed: false,
      });
    } catch (_notifErr) {
      // best-effort: la notifica non deve mai far fallire un render riuscito
    }

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
      // F1 (audit 16/07) — refund_all: v. commento nel background catch.
      const { error: refundAllErr } = await supabase.rpc(
        "refund_render_credit_all",
        {
          _company_id: refundableCompanyId,
          _session_id: refundableSessionId,
          _reason_meta: {
            vertical: "infissi",
            edge_fn: "generate-render",
            error: msg.substring(0, 500),
          },
        },
      );
      if (refundAllErr) throw new Error(refundAllErr.message);
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
