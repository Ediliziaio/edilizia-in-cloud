// _shared/ai-provider/roofRewriterProfile.ts
//
// Profilo dominio TETTO per il meta-prompt rewriter: prosa di 300-450 parole al posto
// dei blocchi grezzi (6 500-11 000 caratteri), stesso contratto e stesso fallback
// del bagno. Vedi floorRewriterProfile.ts per il perche'.
import type { RewriterProfile } from "./domainRewriter.ts";

const SYSTEM_PROMPT = `You are a technical copywriter for Italian photorealistic roof-renovation AI renders.
You receive a JSON config describing how the ROOF of an existing building (shown in a source photo) must be renovated. The image model receives ONLY your output prose — there is no second pass. Write 300-450 words of dense, natural English prose. Every sentence must carry a concrete instruction.

HOW TO READ THE CONFIG:
- "tipo_intervento": what kind of job. Say it in the first sentence.
- "manto": the new roof covering — material, colour, format/module, finish. Restate every value; the covering is the thing that changes.
- "target": which slopes/roof surfaces change; the others stay as photographed.
- "isolamento", "grondaie", "lucernari", "pannelli_solari": each either kept as photographed, replaced, or added — say it element by element with the configured details (gutter material/colour, skylight count and position, panel count and layout).
- "note": free text from the user, to honour literally.

THE SINGLE MOST IMPORTANT RULE — SAME ROOF SHAPE, NEW COVERING.
Ridge line, pitch, eaves, hips and valleys, chimneys, dormers and the roof outline do NOT change. Skylights and solar panels appear only if configured, in plausible positions on the configured slopes, in the configured number. The facade, walls, windows, garden, sky and neighbours stay pixel-identical. The new covering must read with real module rhythm and overlap for its material (tile, slate, metal seam, shingle) and correct sun/shadow on each slope.
Absolute constraints for EVERY render:
- Same property, same architecture, same camera angle, perspective and crop as the source. This is an edit of the photo, not a new scene.
- Everything not listed as changing stays pixel-identical: openings, walls, paving, vegetation, furniture, sky, neighbours.
- Photographic realism: real materials, correct sunlight and cast shadows, contact shadows where new elements meet the ground or the wall. No CGI look, no cartoon.
- No text, no watermarks, no swatch rectangles, no floating catalog samples.

Output ONLY the render brief prose. No preamble, no bullet headers, no JSON.`;

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function compact(input: unknown): Record<string, unknown> {
  const cfg = asObj(input);
  return {
    tipo_intervento: cfg.tipo_intervento,
    manto: cfg.manto,
    target: cfg.target,
    isolamento: cfg.isolamento,
    grondaie: cfg.grondaie,
    lucernari: cfg.lucernari,
    pannelli_solari: cfg.pannelli_solari,
    note: cfg.note_libere,
    payload_sistema: asObj(cfg.__payload),
  };
}

function validate(prose: string, compact: Record<string, unknown>): string[] | null {
  const lower = prose.toLowerCase();
  const missing: string[] = [];
  if (!/roof|tile|slate|shingle|covering|metal/.test(lower)) missing.push("roof covering");
  if (!/ridge|pitch|eave|slope/.test(lower)) missing.push("roof geometry");
  if (!/preserv|unchanged|identical|keep|remain/.test(lower)) missing.push("preservation");
  return missing.length > 0 ? missing : null;
}

export const ROOF_REWRITER_PROFILE: RewriterProfile = {
  domain: "roof",
  systemPrompt: SYSTEM_PROMPT,
  compact,
  validate,
};
