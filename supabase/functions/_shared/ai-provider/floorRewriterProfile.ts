// _shared/ai-provider/floorRewriterProfile.ts
//
// Profilo dominio PAVIMENTO per il meta-prompt rewriter.
//
// Perche'. Il salto di qualita' piu' grande misurato su infissi e bagno e'
// venuto dal riscrivere la configurazione in 300-500 parole di prosa: i
// modelli immagine sono addestrati su didascalie, non su blocchi di regole.
// Pavimento mandava i blocchi grezzi — 7 700 caratteri contro i ~2 800 dei
// verticali con rewriter. Stesso schema del profilo bagno: compattare lo
// schema v2 (scene_analysis / coverage_map / technical_specification /
// replacement_manifest), riscrivere, validare che la prosa nomini le scelte
// critiche, altrimenti ripiegare sui blocchi.
import type { RewriterProfile } from "./domainRewriter.ts";

const SYSTEM_PROMPT = `You are a technical copywriter for Italian photorealistic floor-replacement AI renders.
You receive a JSON config describing how the FLOOR of an existing room (shown in a source photo) must be replaced. The image model receives ONLY your output prose — there is no second pass. Write 300-450 words of dense, natural English prose. Every sentence must carry a concrete instruction.

HOW TO READ THE CONFIG:
- "nuovo_pavimento": the floor that must appear — material, format, finish, colour, laying pattern and direction, joint width and colour, skirting and thresholds. This is your primary material: restate every value.
- "replacements" / "additions" / "removals": instructions already formulated by the system. Fold them into the prose faithfully.
- "scena": the CURRENT room — existing floor, furniture, walls, openings, camera. Use it to say what is replaced and what stays.
- "preserve_exactly" / "integrity_constraints": what must stay pixel-identical.

THE SINGLE MOST IMPORTANT RULE — ONLY THE FLOOR CHANGES.
The new floor must visibly replace the old one across the whole visible floor area, with exactly the stated material, format, pattern and colour. EVERYTHING ELSE stays pixel-identical: walls, wall tiles, doors, windows, furniture, appliances, rugs only if the config says so, radiators, sockets, plants, decor, ceiling, lighting, camera. A render that redesigns the room is a failure; so is one where the old floor still shows through.

SCALE IS THE THING THE MODEL GETS WRONG.
Honour the stated format literally and anchor it to objects in the room: a 120x120 slab is wider than a kitchen base cabinet door; a 20x120 plank is as long as a dining chair is tall. Large formats read as few, big modules with thin refined joints in the stated grout colour — never as a dense grid of small tiles. Standard formats keep a normal residential joint rhythm. Always state the laying direction relative to the main light source or the longest wall, exactly as configured.

EDGES, SKIRTING, THRESHOLDS.
Say what happens where the floor meets the walls (skirting kept, replaced, or none, with height and colour if given), at door thresholds, and around fixed objects (island, columns, radiators): the new floor runs cleanly under and around them with correct perspective and contact shadows.

Absolute constraints for EVERY render:
- Same room, same architecture, same camera angle, perspective and crop as the source. This is an edit of the photo, not a new room.
- Photographic realism: real surface texture, correct reflections and light falloff on the new floor. No CGI look, no cartoon.
- No text, no watermarks, no swatch rectangles, no floating catalog samples.

Output ONLY the render brief prose. No preamble, no bullet headers, no JSON.`;

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Riduce lo schema v2 del pavimento a cio' che serve al rewriter. */
function compactFloorConfig(input: unknown): Record<string, unknown> {
  const cfg = asObj(input);
  const legacy = asObj(cfg.legacy_config);
  const spec = asObj(cfg.technical_specification);
  const manifest = asObj(cfg.replacement_manifest);
  const scene = asObj(cfg.scene_analysis);
  const coverage = asObj(cfg.coverage_map);
  const battiscopa = asObj(legacy.battiscopa);

  return {
    nuovo_pavimento: {
      materiale: legacy.tipo,
      finitura: legacy.finitura,
      effetto: legacy.effetto_visivo,
      essenza_legno: legacy.essenza_legno,
      colore: legacy.colore_nome ?? legacy.colore_ral ?? legacy.colore_hex,
      variazione_tono: legacy.variazione_tono,
      formato: legacy.formato_piastrella ??
        (legacy.larghezza_listello_mm && legacy.lunghezza_listello_mm
          ? `${legacy.larghezza_listello_mm}x${legacy.lunghezza_listello_mm} mm planks`
          : undefined),
      pattern_posa: legacy.pattern_posa,
      direzione_posa: legacy.direzione_posa,
      scala_pattern: legacy.scala_pattern,
      fuga: {
        larghezza_mm: legacy.fuga_larghezza_mm,
        colore: legacy.fuga_colore,
      },
      bisellatura: legacy.bisellatura,
      battiscopa: battiscopa.azione
        ? `${battiscopa.azione}${battiscopa.tipo ? ` — ${battiscopa.tipo}` : ""}${battiscopa.altezza_cm ? ` ${battiscopa.altezza_cm}cm` : ""}`
        : undefined,
      soglie_porte: legacy.soglie_porte,
      giunto_perimetrale: legacy.giunto_perimetrale,
      fasce_bordo: legacy.fasce_bordo,
      specifica_tecnica: spec,
      note_utente: legacy.note_libere,
    },
    copertura: coverage,
    replacements: asArr(manifest.replacements),
    additions: asArr(manifest.additions),
    removals: asArr(manifest.removals),
    preserve_exactly: asArr(manifest.preserveExactly ?? manifest.keepExactly),
    scena: scene,
    integrity_constraints: asArr(cfg.integrity_constraints).slice(0, 12),
  };
}

/** La prosa deve nominare materiale, formato/pattern e cio' che si preserva. */
function validateFloorCoverage(prose: string, compact: Record<string, unknown>): string[] | null {
  const lower = prose.toLowerCase();
  const nuovo = asObj(compact.nuovo_pavimento);
  const missing: string[] = [];
  const materiale = String(nuovo.materiale ?? "").toLowerCase();
  if (materiale && !/tile|plank|parquet|wood|stone|resin|gres|porcelain|marble|laminate|vinyl|concrete|floor/.test(lower)) {
    missing.push("material");
  }
  const formato = String(nuovo.formato ?? "");
  if (formato && !lower.includes(formato.toLowerCase().split(" ")[0])) {
    missing.push(`format ${formato}`);
  }
  if (!/preserv|unchanged|identical|keep|remain/.test(lower)) missing.push("preservation");
  if (!/joint|grout|seam/.test(lower)) missing.push("joints");
  return missing.length > 0 ? missing : null;
}

export const FLOOR_REWRITER_PROFILE: RewriterProfile = {
  domain: "floor",
  systemPrompt: SYSTEM_PROMPT,
  compact: compactFloorConfig,
  validate: validateFloorCoverage,
};
