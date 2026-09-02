// _shared/ai-provider/poolRewriterProfile.ts
//
// Profilo dominio PISCINE per il meta-prompt rewriter: prosa di 300-450 parole al posto
// dei blocchi grezzi (6 500-11 000 caratteri), stesso contratto e stesso fallback
// del bagno. Vedi floorRewriterProfile.ts per il perche'.
import type { RewriterProfile } from "./domainRewriter.ts";

const SYSTEM_PROMPT = `You are a technical copywriter for Italian photorealistic swimming-pool installation AI renders.
You receive a JSON config describing a POOL to insert, replace or restyle in an existing garden (shown in a source photo). The image model receives ONLY your output prose — there is no second pass. Write 300-450 words of dense, natural English prose. Every sentence must carry a concrete instruction.

HOW TO READ THE CONFIG:
- "operazione": add new pool, replace existing, change finishes only, change coping only. Say it in the first sentence.
- "piscina": shape, size class, depth read, steps/entry, water colour read. Restate every value.
- "finiture": interior lining, coping/edge material and colour, surrounding deck material. Restate every value.
- "comfort": ladder, lighting, cover, shower — only if configured.
- "inserimento": where in the garden, distance from the house, relation to lawn/paving/level changes, known interferences.
- "elementi_da_preservare" / "elementi_da_rimuovere": user lists, to honour literally.

THE SINGLE MOST IMPORTANT RULE — ONE LEVEL POOL, REAL WATER, NOTHING ELSE CHANGES.
Exactly one pool, dug into the ground with a perfectly level water surface, straight coherent edges, coping that sits flush on the terrain, correct reflections of sky and house. House, facade, openings, existing paving outside the pool zone, trees, fences, furniture (unless configured) and neighbours stay pixel-identical. No pasted blue rectangle, no floating pool, no second basin, no leftover of an old pool.
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
    piscina: legacy.piscina,
    finiture: legacy.finiture,
    comfort: legacy.comfort,
    inserimento: legacy.inserimento,
    mappa_inserimento: cfg.target_pool_insertion_map,
    envelope: cfg.buildability_envelope,
    specifica: cfg.technical_specification,
    regole_acqua: asArr(cfg.water_realism_rules).slice(0, 8),
    replacements: asArr(manifest.replacements),
    additions: asArr(manifest.additions),
    removals: asArr(manifest.removals),
    preserve_exactly: asArr(manifest.preserveExactly ?? manifest.keepExactly),
    elementi_da_preservare: legacy.elementi_da_preservare,
    elementi_da_rimuovere: legacy.elementi_da_rimuovere,
    scena: cfg.scene_analysis,
    integrity_constraints: asArr(cfg.integrity_constraints).slice(0, 12),
    note_utente: legacy.note_libere ?? cfg.notes,
  };
}

function validate(prose: string, compact: Record<string, unknown>): string[] | null {
  const lower = prose.toLowerCase();
  const missing: string[] = [];
  if (!/pool|basin|water/.test(lower)) missing.push("pool");
  if (!/coping|edge|deck|lining/.test(lower)) missing.push("finishes");
  if (!/preserv|unchanged|identical|keep|remain/.test(lower)) missing.push("preservation");
  // La lista scritta dal cliente ("ulivo a sinistra") NON viene pretesa nella
  // prosa: il rewriter la perde spesso (cbe2081f) e pretenderla faceva
  // ripiegare sui blocchi ogni volta (23b3839d: 8 769 caratteri invece di
  // ~2 200). L'edge la accoda alla prosa in modo deterministico, quindi arriva
  // al modello comunque — e la prosa resta.
  return missing.length > 0 ? missing : null;
}

export const POOL_REWRITER_PROFILE: RewriterProfile = {
  domain: "pool",
  systemPrompt: SYSTEM_PROMPT,
  compact,
  validate,
};
