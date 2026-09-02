// _shared/ai-provider/facadeRewriterProfile.ts
//
// Profilo dominio FACCIATA per il meta-prompt rewriter. Stesso motivo del
// profilo pavimento: la facciata mandava 8 000 caratteri di blocchi, i
// verticali con rewriter ne mandano ~2 800 di prosa che i modelli immagine
// seguono meglio. Compatta lo schema facciata_render_v2, riscrive, valida.
import type { RewriterProfile } from "./domainRewriter.ts";

const SYSTEM_PROMPT = `You are a technical copywriter for Italian photorealistic building-facade renovation AI renders.
You receive a JSON config describing how the FACADE of an existing building (shown in a source photo) must be renovated. The image model receives ONLY your output prose — there is no second pass. Write 300-450 words of dense, natural English prose. Every sentence must carry a concrete instruction.

HOW TO READ THE CONFIG:
- "intervento": the kind of job (repaint, new plaster, cladding, external insulation, mixed). Say it in the first sentence.
- "sistemi": each active system — plaster/paint, cladding, insulation — with material, colour, finish and the ZONE it applies to (whole facade, ground floor only, upper floors, a band, a single wall). Restate every value and every zone boundary.
- "elementi": what happens to windows, sills, cornices, gutters, balconies and railings: kept, repainted, replaced. Say it element by element.
- "replacements" / "additions" / "removals": instructions already formulated by the system. Fold them in faithfully.
- "scena": the CURRENT building — storeys, openings, materials, context, camera. Use it to say what changes and what stays.
- "preserve_exactly" / "integrity_constraints": what must stay pixel-identical.

THE SINGLE MOST IMPORTANT RULE — SAME BUILDING, NEW SKIN.
The number of storeys, the position and size of every window, door and balcony, the roof line, the footprint and the camera do NOT change. Only the finishes listed in the config change, only in their stated zones. A render with an extra floor, a moved window or a different building is a total failure; so is one where the old finish still shows through. State explicitly which zones change and which stay.

ZONES ARE BOUNDARIES, NOT SUGGESTIONS.
When a system applies to part of the facade only (a ground-floor band, a side wall), describe the boundary line precisely — at the string course, at the balcony slab, at the corner — and say that the rest of the facade keeps its current finish and colour. Transitions between materials must look buildable: real thickness for insulation and cladding, real corner and window-reveal details.

Absolute constraints for EVERY render:
- Same building, same storeys, same openings in the same places, same camera angle, perspective and crop. This is an edit of the photo, not a new building.
- Sky, street, vehicles, vegetation, neighbouring buildings and people stay as photographed.
- Photographic realism: real plaster grain, real cladding modules, correct sunlight and cast shadows. No CGI look, no cartoon.
- No text, no watermarks, no swatch rectangles, no floating catalog samples.

Output ONLY the render brief prose. No preamble, no bullet headers, no JSON.`;

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function compactFacadeConfig(input: unknown): Record<string, unknown> {
  const cfg = asObj(input);
  const legacy = asObj(cfg.legacy_config);
  const manifest = asObj(cfg.replacement_manifest);
  const sistemi: Record<string, unknown> = {};
  for (const k of ["intonaco", "rivestimento", "cappotto"]) {
    const s = asObj(legacy[k]);
    if (s.attivo === true) sistemi[k] = s;
  }
  return {
    intervento: legacy.tipo_intervento,
    sistemi,
    elementi: legacy.elementi,
    zone_target: cfg.zone_targeting,
    specifica_tecnica: cfg.technical_specification,
    replacements: asArr(manifest.replacements),
    additions: asArr(manifest.additions),
    removals: asArr(manifest.removals),
    preserve_exactly: asArr(manifest.preserveExactly ?? manifest.keepExactly),
    scena: cfg.scene_analysis,
    integrity_constraints: asArr(cfg.integrity_constraints).slice(0, 12),
    note_utente: legacy.note_libere ?? cfg.notes,
  };
}

function validateFacadeCoverage(prose: string, compact: Record<string, unknown>): string[] | null {
  const lower = prose.toLowerCase();
  const missing: string[] = [];
  const sistemi = asObj(compact.sistemi);
  if (sistemi.intonaco && !/plaster|render|paint|stucco/.test(lower)) missing.push("plaster/paint");
  if (sistemi.rivestimento && !/cladding|stone|brick|panel|slab|wood/.test(lower)) missing.push("cladding");
  if (sistemi.cappotto && !/insulation|thermal|cappotto|eps|rockwool/.test(lower)) missing.push("insulation");
  if (!/storey|floor|window|opening/.test(lower)) missing.push("storeys/openings");
  if (!/preserv|unchanged|identical|keep|remain/.test(lower)) missing.push("preservation");
  return missing.length > 0 ? missing : null;
}

export const FACADE_REWRITER_PROFILE: RewriterProfile = {
  domain: "facade",
  systemPrompt: SYSTEM_PROMPT,
  compact: compactFacadeConfig,
  validate: validateFacadeCoverage,
};
