// _shared/ai-provider/pergolaRewriterProfile.ts
//
// Profilo dominio PERGOLE per il meta-prompt rewriter: prosa di 300-450 parole al posto
// dei blocchi grezzi (6 500-11 000 caratteri), stesso contratto e stesso fallback
// del bagno. Vedi floorRewriterProfile.ts per il perche'.
import type { RewriterProfile } from "./domainRewriter.ts";

const SYSTEM_PROMPT = `You are a technical copywriter for Italian photorealistic pergola-installation AI renders.
You receive a JSON config describing a PERGOLA / outdoor shading system to insert, replace or restyle on an existing property (shown in a source photo). The image model receives ONLY your output prose — there is no second pass. Write 300-450 words of dense, natural English prose. Every sentence must carry a concrete instruction.

HOW TO READ THE CONFIG:
- "operazione": add new, replace existing, recolor only, change cover only. Say it in the first sentence.
- "struttura": material, colour/finish, post count and section, beam geometry, wall-mounted or free-standing, footprint. Restate every value.
- "copertura": cover type (bioclimatic louvers, fixed slats, fabric, polycarbonate, none) and its open/closed state.
- "chiusure_laterali", "illuminazione", "arredo": side closures, lighting and furniture — only if configured.
- "installazione": where it goes (patio, terrace, garden zone), attachment line, clearances from doors/windows/pool.
- "elementi_da_preservare": what the user listed to keep exactly.

THE SINGLE MOST IMPORTANT RULE — ONE BUILDABLE PERGOLA, NOTHING ELSE CHANGES.
Exactly one pergola, posts standing on the ground with contact shadows, beams spanning plausibly, attached to the facade only where configured and never blocking a door or window. House, facade, openings, paving, garden, pool, furniture (unless configured), sky and neighbours stay pixel-identical. No second structure, no leftover of an old awning, no floating parts.
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
  const manifest = asObj(cfg.replacement_manifest);
  return {
    operazione: legacy.operazione,
    struttura: legacy.struttura,
    copertura: legacy.copertura,
    chiusure_laterali: legacy.chiusure_laterali,
    illuminazione: legacy.illuminazione,
    arredo: legacy.arredo,
    installazione: legacy.installazione,
    mappa_installazione: cfg.target_installation_map,
    envelope: cfg.installability_envelope,
    specifica: cfg.technical_specification,
    replacements: asArr(manifest.replacements),
    additions: asArr(manifest.additions),
    removals: asArr(manifest.removals),
    preserve_exactly: asArr(manifest.preserveExactly ?? manifest.keepExactly),
    elementi_da_preservare: legacy.elementi_da_preservare,
    scena: cfg.scene_analysis,
    integrity_constraints: asArr(cfg.integrity_constraints).slice(0, 12),
    note_utente: legacy.note_libere ?? cfg.notes,
  };
}

function validate(prose: string, compact: Record<string, unknown>): string[] | null {
  const lower = prose.toLowerCase();
  const missing: string[] = [];
  if (!/pergola|canopy|louver|beam|post/.test(lower)) missing.push("pergola");
  if (!/post|beam|attach|mount/.test(lower)) missing.push("structure");
  if (!/preserv|unchanged|identical|keep|remain/.test(lower)) missing.push("preservation");
  // La lista scritta dal cliente ("ulivo a sinistra") NON viene pretesa nella
  // prosa: il rewriter la perde spesso (cbe2081f) e pretenderla faceva
  // ripiegare sui blocchi ogni volta (23b3839d: 8 769 caratteri invece di
  // ~2 200). L'edge la accoda alla prosa in modo deterministico, quindi arriva
  // al modello comunque — e la prosa resta.
  return missing.length > 0 ? missing : null;
}

export const PERGOLA_REWRITER_PROFILE: RewriterProfile = {
  domain: "pergola",
  systemPrompt: SYSTEM_PROMPT,
  compact,
  validate,
};
