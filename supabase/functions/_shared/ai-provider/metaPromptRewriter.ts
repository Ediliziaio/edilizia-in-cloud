// _shared/ai-provider/metaPromptRewriter.ts
//
// v8.6.26 — META-PROMPT REWRITER (experimental)
//
// Approccio alternativo al block-based prompt (~25KB rigido). Riceve il
// WindowRenderConfig strutturato e produce un brief in prosa naturale di
// 300-500 parole tramite un LLM testuale. Il prose viene poi inviato al
// modello immagine (gpt-image-1) al posto del prompt-blocchi.
//
// Razionale: i modelli immagine sono addestrati su caption brevi e
// naturali, non su struttured prompt da 25KB. Il block-based ha sviluppato
// "template fatigue" → le regole "buried" vengono ignorate. Il rewriter
// produce un prose denso, focalizzato, dove ogni frase pesa.
//
// Attivazione: env RENDER_PROMPT_MODE="meta". Default "blocks".
//
// Provider (v8.6.32, post-rimozione Gemini): chain OpenAI via OpenRouter
// (gpt-4o-mini → gpt-4o fallback), 1-3s, ~$0.001/render.
// Fallback: se il rewriter fallisce o omette key tokens, ritorna null →
// caller fa fallback al block-based.
//
// Validation post-rewrite: assicura che la prose contenga le keyword
// fondamentali (sash count, hinge spec, transom decision, cassonetto
// state, colore). Se mancano → return null = forza fallback.

import { callOpenRouter } from "./openrouter.ts";
import type { ChatMessage } from "./types.ts";

// v8.6.32 — Gemini eliminato. Solo OpenAI via OpenRouter.
const REWRITER_MODELS_CHAIN = [
  "openai/gpt-4o-mini",
  "openai/gpt-4o",
];

const SYSTEM_PROMPT = `You are a technical copywriter for Italian photorealistic window-replacement AI renders.

You receive a JSON config describing what new window must replace the existing one in a source photo. The image model (OpenAI gpt-image-1) receives ONLY your output prose to generate the render — there is no second pass.

Output a 300-500 word natural-language render brief in English. Direct, dense, concrete. No markdown, no bullet lists, no headers, no JSON — just prose.

MUST include explicitly:
1. Which opening to edit (by label, e.g. "opening A"). Other openings stay pixel-identical to source.
2. Frame profile + material + finish (color name and RAL code if available).
3. Sash count and node type (symmetric ~110mm doubled mullion / asymmetric reduced node ~50-70mm slim stile / central handle palettone slim ~30-60mm).
4. Handle: model, finish, count (exactly 1 for 2-sash window, 2 for 3-sash window grouped 2+1, etc), position (lateral stile of operative sash, OR center on palettone if central-handle).
5. Hinges: exact count per sash, total visible count, position on lateral stiles, finish. If hidden hinges mode → "ZERO visible hinges, mechanism concealed in frame channel, lateral stiles clean and continuous".
6. Horizontal transom: explicit keep / add / REMOVE. If REMOVE, say "delete the horizontal divider, render each sash as a single full-height continuous glass panel".
7. Cassonetto (CRITICAL): Italian portafinestre have THREE styles. Inspect target_opening.cassonettoStyle and target_opening.hasCassonetto:
   (a) cassonettoStyle="absent" or hasCassonetto=false → "the source has NO cassonetto and NO shutter. The render MUST have NO cassonetto, NO shutter slats, NO horizontal band above or inside the window. Plain wall above the frame, pixel-identical to source. Do NOT invent a box even if the source has a lintel/cornice/shadow that looks similar."
   (b) cassonettoStyle="internal_monoblocco" → "the source has a RECESSED monoblocco cassonetto built INSIDE the wall. There is NO external box projecting above the frame. From inside the room you see only the roller shutter slats as a striped band at the top of each sash. The render MUST preserve this: plain wall above the frame (pixel-identical to source) + roller shutter slats visible at the same position INSIDE the window opening. Do NOT add an external box."
   (c) cassonettoStyle="external_box" → "the source shows an external projecting cassonetto box above the frame. If user did NOT request replacement, reproduce it pixel-identical (same shape, material, color, proportions). If user DID request replacement, describe the new cassonetto: material, color, monoblock style."
   (d) User explicitly requested REPLACEMENT (spec.cassonetto.replace=true) → describe the NEW cassonetto regardless of source style: material, color, modern PVC monoblock flat surface.
8. Shutter (tapparella): preserved as in source / replaced with new color (specify color) / motorized cleanup (remove belt, install electric switch at ~110cm).
9. Preservation rules: room, furniture, view outdoors, walls, ceiling, floor IDENTICAL to source. Do not recolor or restyle the rest of the scene.

SPECIAL CASES (must be addressed explicitly when present in config):

A. SASH COUNT CHANGE: if spec.compositionChange is non-null (source has X sashes, target has Y sashes), state DIRECTLY: "the new window must have EXACTLY Y sashes. Remove/add the central mullion(s) accordingly. The wall opening width stays IDENTICAL, only the internal subdivision changes." This rule overrides any default.

B. ASYMMETRIC REDUCED NODE: if spec.reducedNode=true (and centralHandle=false), state: "the central vertical meeting point is a SLIM SINGLE STILE (~50-70mm wide, NOT a doubled 110mm mullion). The primary sash is visibly wider than the secondary sash. The palettone covers the palettino. Glass area increases vs symmetric profile. Valid for PVC, aluminum, minimal frames alike."

C. CENTRAL HANDLE: if spec.centralHandle=true, state: "the central vertical mullion is DRAMATICALLY SLIM (~30-60mm wide) with ONE single handle mounted at its geometric center. Glass area dominates the visual field. This is a slim palettone with central handle, NOT a classic doubled mullion."

D. TAPPARELLA NEW COLOR: if spec.shutter.replace=true and spec.shutter.colorLabel is a custom color (different from frame), state the exact color and "the roller shutter slats MUST show this color, NOT the frame color, NOT the original shutter color."

E. MOTORIZED CLEANUP: if spec.shutter.isMotorized=true and source has a manual belt/winder, state "remove ALL manual belt/cord/winder/wall plate from the wall beside the window. Repair the wall seamlessly. Install a new flush 80x80mm Vimar-style electric switch (matte white) at ~110cm from floor with up/down rocker buttons."

VISUAL ANCHORS (use concrete language):
- "polished chrome" not "shiny metal finish"
- "matte anthracite RAL 7016" not "dark gray"
- "single full-width clear glass panel" not "uninterrupted glazing"
- "exactly 4 hinges total (2 per sash)" not "European-style hinges"

ABSOLUTE BANS (always include at end):
- This is a PHYSICAL replacement, not a recolor of the old window. ERASE the old window, draw a NEW one.
- All frame surfaces (front + lateral stiles + top header + bottom sill + mullion) show the new color. NEVER leave lateral stiles in the old color.
- No phantom subdivisions, no residual georgian bars, no leftover manual belt/cord/winder when motorization is specified.
- No invented objects (curtains, lamps, plants, sensors) that weren't in the source photo.
- No swatch rectangles or product thumbnails pasted in the scene — reference images are inputs, never outputs.
- Corner construction follows material: PVC = mitred 45° V-perfect welded; Legno = L-shaped mortise & tenon; Alluminio = 90° butt with hidden corner cleat. Never mix.

End with: "Preserve all other scene elements pixel-identical to the source photo."

DO NOT exceed 500 words. DO NOT use bullet points or numbered lists. DO NOT include the JSON keys in the output.`;

export interface MetaPromptArgs {
  config: unknown; // WindowRenderConfig, kept as unknown to avoid import cycles
  metadata: {
    task_kind: string;
    company_id?: string | null;
    session_id?: string | null;
  };
  timeoutMs?: number;
}

export interface MetaPromptResult {
  userPrompt: string;
  modelUsed: string;
  latencyMs: number;
}

/**
 * Rewrite a structured WindowRenderConfig into a natural-language render brief.
 *
 * Returns null if all models in the chain fail OR if the produced prose fails
 * validation (missing key tokens) — caller should fall back to block-based.
 */
export async function rewriteToMetaPrompt(
  args: MetaPromptArgs,
): Promise<MetaPromptResult | null> {
  const t0 = Date.now();

  // Pre-tagliamo il config a quello che serve davvero al rewriter:
  // technical_specification (primary opening), scene_analysis.openings,
  // target_selection, traverso, notes. Esclude prompt_used, foto_analisi
  // legacy, validation result, ecc.
  const compact = compactConfigForRewriter(args.config);
  const userPromptForRewriter = JSON.stringify(compact, null, 2);

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Generate the render brief for this configuration:\n\n${userPromptForRewriter}`,
    },
  ];

  let lastError: Error | null = null;
  for (const model of REWRITER_MODELS_CHAIN) {
    try {
      const result = await callOpenRouter(
        {
          model,
          messages: messages as unknown[],
          temperature: 0, // deterministico per A/B test pulito
          max_tokens: 1200, // ~600-900 parole, abbondante
        },
        {
          task_kind: args.metadata.task_kind,
          company_id: args.metadata.company_id,
        },
      );

      const prose = (result.content ?? "").trim();
      if (!prose || prose.length < 200) {
        lastError = new Error(`Empty or too-short response from ${model} (${prose.length} chars)`);
        continue;
      }

      // Validation: assicurati che il prose contenga le keyword chiave del config.
      const validationErr = validateMetaPromptCoverage(prose, compact);
      if (validationErr) {
        console.warn(JSON.stringify({
          lvl: "warn",
          fn: "metaPromptRewriter",
          session_id: args.metadata.session_id,
          model,
          msg: "meta_prompt_validation_failed",
          missing: validationErr,
          prose_length: prose.length,
        }));
        lastError = new Error(`Validation failed: missing ${validationErr.join(", ")}`);
        continue;
      }

      console.log(JSON.stringify({
        lvl: "info",
        fn: "metaPromptRewriter",
        session_id: args.metadata.session_id,
        msg: "meta_prompt_generated",
        model: result.model,
        prose_length: prose.length,
        latency_ms: Date.now() - t0,
      }));

      return {
        userPrompt: prose,
        modelUsed: result.model,
        latencyMs: Date.now() - t0,
      };
    } catch (e) {
      lastError = e as Error;
      console.warn(JSON.stringify({
        lvl: "warn",
        fn: "metaPromptRewriter",
        session_id: args.metadata.session_id,
        model,
        msg: "meta_prompt_rewriter_call_failed",
        error: String(lastError.message ?? lastError),
      }));
    }
  }

  console.warn(JSON.stringify({
    lvl: "warn",
    fn: "metaPromptRewriter",
    session_id: args.metadata.session_id,
    msg: "meta_prompt_rewriter_all_models_failed_fallback_to_blocks",
    last_error: String(lastError?.message ?? ""),
  }));
  return null;
}

// Riduce il config alle sezioni effettivamente necessarie al rewriter.
// Evita di sprecare token su validation result, prompt_used legacy, ecc.
function compactConfigForRewriter(config: unknown): Record<string, unknown> {
  if (!config || typeof config !== "object") return {};
  const c = config as Record<string, unknown>;
  const spec = Array.isArray(c.technical_specification) ? c.technical_specification[0] : null;
  const sceneAnalysis = c.scene_analysis as Record<string, unknown> | undefined;
  const openings = Array.isArray(sceneAnalysis?.openings) ? sceneAnalysis!.openings : [];
  const targetSel = c.target_selection as Record<string, unknown> | undefined;
  const targetIds = Array.isArray(targetSel?.targetOpeningIds) ? targetSel!.targetOpeningIds : [];
  const targetOpening = openings.find((o: unknown) => {
    if (!o || typeof o !== "object") return false;
    return targetIds.includes((o as Record<string, unknown>).id);
  });

  return {
    target_opening: targetOpening ?? null,
    spec: spec ?? null,
    traverso: c.traverso ?? "auto",
    target_labels: (targetSel as Record<string, unknown> | undefined)?.targetLabels ?? [],
    notes: c.notes ?? null,
  };
}

// Verifica che il prose contenga le keyword fondamentali della config.
// Se manca qualcosa di critico, ritorna l'elenco mancante (caller fallback).
function validateMetaPromptCoverage(prose: string, compact: Record<string, unknown>): string[] | null {
  const lower = prose.toLowerCase();
  const missing: string[] = [];

  const spec = compact.spec as Record<string, unknown> | null;
  if (!spec) return null; // nessun spec → niente da validare

  // 1. Colore finitura presente nel prose
  const finish = spec.finish as Record<string, unknown> | undefined;
  const finishName = (finish?.name as string | undefined)?.toLowerCase() ?? "";
  const finishRal = (finish?.ral as string | undefined)?.toLowerCase() ?? "";
  if (finishName && !lower.includes(finishName.toLowerCase()) && (!finishRal || !lower.includes(finishRal))) {
    missing.push(`finish "${finishName}"`);
  }

  // 2. Sash count menzionato (sia desiredSashCount sia il termine "sash")
  const sashCount = Number(spec.desiredSashCount ?? 0);
  if (sashCount > 0) {
    // Cerca cifra o sua versione parola
    const num = String(sashCount);
    const words: Record<number, string> = { 1: "single", 2: "two", 3: "three", 4: "four" };
    if (!lower.includes(num) && !lower.includes(words[sashCount] ?? "")) {
      missing.push(`sash count ${sashCount}`);
    }
  }

  // 3. Transom se REMOVE deve essere menzionato
  const transomRule = (spec.transomRule as string | undefined) ?? "";
  if (transomRule.toUpperCase().includes("REMOVE")) {
    if (!lower.includes("transom") && !lower.includes("divider")) {
      missing.push("transom removal");
    }
  }

  // 4. Hinge mode (hidden = critico)
  if (spec.hingeMode === "hidden") {
    if (!lower.includes("hidden") && !lower.includes("conceal")) {
      missing.push("hidden hinges");
    }
  }

  // 5. Cassonetto if replace=true
  const cassonetto = spec.cassonetto as Record<string, unknown> | undefined;
  if (cassonetto?.replace === true) {
    if (!lower.includes("cassonetto") && !lower.includes("roller shutter housing") && !lower.includes("shutter box")) {
      missing.push("cassonetto replacement");
    }
  }

  return missing.length > 0 ? missing : null;
}
