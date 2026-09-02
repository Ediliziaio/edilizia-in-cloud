// _shared/ai-provider/shutterRewriterProfile.ts
//
// Profilo dominio PERSIANE per il meta-prompt rewriter: prosa di 300-450 parole al posto
// dei blocchi grezzi (6 500-11 000 caratteri), stesso contratto e stesso fallback
// del bagno. Vedi floorRewriterProfile.ts per il perche'.
import type { RewriterProfile } from "./domainRewriter.ts";

const SYSTEM_PROMPT = `You are a technical copywriter for Italian photorealistic window-shutter (persiane) replacement AI renders.
You receive a JSON config describing how the SHUTTERS of an existing facade (shown in a source photo) must be replaced or restyled. The image model receives ONLY your output prose — there is no second pass. Write 300-450 words of dense, natural English prose. Every sentence must carry a concrete instruction.

HOW TO READ THE CONFIG:
- "operazione": add, replace, recolor-only or remove shutters. Say it in the first sentence.
- "specifica": the new shutter — type (louvered, solid, mixed), material, colour/finish, panel count per opening, hinge and stop hardware, installation (in-reveal or on-wall). Restate every value.
- "aperture_target" / "aperture_preservate": which openings change and which must stay exactly as photographed. Name them by position.
- "replacements" / "additions" / "removals": instructions already formulated by the system. Fold them in faithfully.
- "scena": the CURRENT facade — openings, existing shutters, wall material, camera. Use it to say what changes and what stays.
- "accessori_non_target": whether hooks, brackets, lamps, cables, awnings and drains must stay exactly as photographed (default) or may be cleaned.

THE SINGLE MOST IMPORTANT RULE — COUNT AND GEOMETRY.
Every target opening gets exactly the configured number of shutter panels, sized to its own opening, hinged on its own jambs, in the configured open/closed state. No shutter appears on a non-target opening; no opening loses or gains a shutter that was not requested. Window frames, glazing, sills and the wall around each opening stay pixel-identical. On a recolor-only job the geometry, hinges and slats stay exactly as photographed and only the finish changes.
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
  const legacy = asObj(cfg.legacy_config);
  const spec = asObj(cfg.technical_specification);
  const manifest = asObj(cfg.replacement_manifest);
  const target = asObj(cfg.target_selection);
  return {
    operazione: legacy.operazione,
    specifica: spec,
    aperture_target: target.targetLabels ?? target.selectedOpeningIds,
    aperture_preservate: target.preservedOpeningIds,
    accessori_non_target: legacy.mantieni_accessori_non_target === false ? "may_be_cleaned" : "keep_exactly",
    replacements: asArr(manifest.replacements),
    additions: asArr(manifest.additions),
    removals: asArr(manifest.removals),
    preserve_exactly: asArr(manifest.preserveExactly ?? manifest.keepExactly),
    scena: cfg.scene_analysis,
    integrity_constraints: asArr(cfg.integrity_constraints).slice(0, 12),
    note_utente: legacy.note_libere ?? cfg.notes,
  };
}

function validate(prose: string, compact: Record<string, unknown>): string[] | null {
  const lower = prose.toLowerCase();
  const missing: string[] = [];
  if (!/shutter|persian|louver|panel/.test(lower)) missing.push("shutters");
  if (!/hinge|jamb|reveal|frame/.test(lower)) missing.push("hardware/geometry");
  if (!/preserv|unchanged|identical|keep|remain/.test(lower)) missing.push("preservation");
  return missing.length > 0 ? missing : null;
}

export const SHUTTER_REWRITER_PROFILE: RewriterProfile = {
  domain: "shutter",
  systemPrompt: SYSTEM_PROMPT,
  compact,
  validate,
};
