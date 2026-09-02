// _shared/ai-provider/technicalRewriterProfile.ts
//
// Profilo dominio MODULI TECNICI (ristrutturazioni, pavimenti esterni,
// giardini, porte interne, porte blindate) per il meta-prompt rewriter.
// I prompt ricchi di questi moduli sono i piu' lunghi di tutti (11-14 000
// caratteri di blocchi): l'ultimo verticale senza prosa. Il compattatore
// legge il payload dell'adattatore (scene_analysis, target_map,
// replacement_manifest, blocks) piu' i sette campi generici della pagina, che
// sono le parole del cliente e vanno riportate alla lettera.
import type { RewriterProfile } from "./domainRewriter.ts";

const SYSTEM_PROMPT = `You are a technical copywriter for Italian photorealistic renovation AI renders.
You receive a JSON config describing ONE technical system to renovate on an existing property shown in a source photo: an interior door, a security entrance door, a garden, an exterior floor, or a coordinated renovation. The image model receives ONLY your output prose — there is no second pass. Write 300-450 words of dense, natural English prose. Every sentence must carry a concrete instruction.

HOW TO READ THE CONFIG:
- "module_type": which system. Name it in the first sentence.
- "richiesta_cliente": the customer's own words — preset, target area, material/system, colour and finish, technical details, what to preserve, intensity. Restate every value literally; these are the brief.
- "target_map": where exactly the change happens (opening, surface, zone) and its limits.
- "replacement_manifest": removals, additions, replacements, preservation already formulated by the system. Fold them in faithfully.
- "scene_analysis": the CURRENT scene. Use it to say what changes and what stays.
- "blocks": the full rule set — mine it for the details that matter (hardware, joints, edges, clearances, buildability), do not copy it.

THE SINGLE MOST IMPORTANT RULE — ONE SYSTEM CHANGES, THE SCENE STAYS.
Only the selected system changes, only inside its target. Everything else — walls, openings, floor, furniture, plants, appliances, facade, sky, neighbours — stays pixel-identical, and the customer's preservation list is repeated word for word. The new system must look buildable: real thickness, real junctions with wall and floor, contact shadows, correct perspective. No hybrid old/new state, no leftover of the old element.

Absolute constraints for EVERY render:
- Same property, same camera angle, perspective and crop as the source. This is an edit of the photo, not a new scene.
- Photographic realism: real materials, correct light and shadows. No CGI look, no cartoon.
- No text, no watermarks, no swatch rectangles, no floating catalog samples.

Output ONLY the render brief prose. No preamble, no bullet headers, no JSON.`;

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function compact(input: unknown): Record<string, unknown> {
  const cfg = asObj(input);
  const generica = asObj(cfg.config);
  return {
    module_type: cfg.module_type,
    richiesta_cliente: {
      preset: generica.interventionPreset,
      area_target: generica.targetArea,
      materiale_o_sistema: generica.materialOrSystem,
      colore_e_finitura: generica.colorAndFinish,
      dettagli_tecnici: generica.technicalDetails,
      da_preservare: generica.preserveNotes,
      intensita: generica.intensity,
    },
    target_map: cfg.target_map,
    replacement_manifest: cfg.replacement_manifest,
    scene_analysis: cfg.scene_analysis,
    blocks: cfg.blocks,
  };
}

const PAROLE_MODULO: Record<string, RegExp> = {
  "porte-interne": /door|leaf|frame|jamb/,
  "porte-blindate": /door|entrance|security|leaf/,
  giardini: /garden|lawn|plant|bed|hedge|path/,
  "pavimenti-esterni": /paving|slab|deck|stone|floor|tile/,
  ristrutturazioni: /renovat|surface|finish/,
};

function validate(prose: string, compact: Record<string, unknown>): string[] | null {
  const lower = prose.toLowerCase();
  const missing: string[] = [];
  const re = PAROLE_MODULO[String(compact.module_type ?? "")];
  if (re && !re.test(lower)) missing.push(`module ${compact.module_type}`);
  if (!/preserv|unchanged|identical|keep|remain/.test(lower)) missing.push("preservation");
  return missing.length > 0 ? missing : null;
}

export const TECHNICAL_REWRITER_PROFILE: RewriterProfile = {
  domain: "technical",
  systemPrompt: SYSTEM_PROMPT,
  compact,
  validate,
};
