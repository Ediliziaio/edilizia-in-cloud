import type {
  TipoPavimento,
  FinituraPavimento,
  PatternPosa,
  ConfigurazionePavimento,
  AnalisiPavimento,
} from "./types";

// ── POSA_PHYSICS ──────────────────────────────────────────────────────────────
const POSA_PHYSICS: Record<PatternPosa, string> = {
  rettilineo_dritto:
    "straight linear layout — tiles/planks aligned perfectly parallel to the longest wall with NO offset between rows, every joint forms a continuous straight line across the floor, creating a clean grid pattern",
  a_correre:
    "running bond (a correre) — planks or tiles offset by exactly 50% of their length in each successive row, like a classic brick pattern, joints staggered in a regular zigzag rhythm",
  sfalsato_33:
    "one-third offset bond — each row is offset by 33% of the tile/plank length from the previous row, creating a cascading staircase pattern of joints, commonly used for large-format planks",
  spina_di_pesce:
    "herringbone (spina di pesce) — rectangular planks arranged in a classic V-shaped zigzag pattern at 90-degree angles to each other, forming a continuous chevron weave across the entire floor surface",
  spina_ungherese:
    "Hungarian herringbone (spina ungherese) — planks cut at 45-degree angles at their ends and laid to form a continuous zigzag with pointed chevron tips, creating a sharper V-pattern than standard herringbone",
  diagonale_45:
    "diagonal 45-degree layout — tiles or planks rotated 45 degrees relative to the walls, all joints running diagonally across the room, creating diamond-shaped visual pattern",
  cassero_irregolare:
    "irregular staggered bond (cassero irregolare) — planks of varying lengths laid in random offset pattern, no repeating joint alignment, creating a natural organic appearance typical of real wood flooring",
  opus_romanum:
    "opus romanum — multi-format modular layout combining 2-4 different tile sizes (e.g. 60x60, 60x30, 30x30) in a repeating geometric pattern, creating a classical Roman mosaic-inspired floor design",
  doppia_fila:
    "double-strip layout (doppia fila) — two narrow planks laid side by side forming wider visual modules, then staggered in running bond, creating a paired-plank rhythm across the floor",
  modulare:
    "modular pattern — square tiles arranged in a grid with alternating orientation or mixed sizes creating a geometric basket-weave or pinwheel effect",
  esagonale:
    "hexagonal tile layout — six-sided tiles tessellated in a honeycomb pattern with minimal grout lines, creating an organic geometric mosaic covering the entire floor surface",
};

// ── FLOOR_PHYSICS ─────────────────────────────────────────────────────────────
const FLOOR_PHYSICS: Record<TipoPavimento, string> = {
  parquet_massello:
    "solid hardwood parquet — natural wood grain visible on every plank, color variation between planks (lighter and darker tones), subtle knot patterns, beveled or micro-beveled edges between planks, warm matte or satin finish, planks typically 70-100mm wide and 300-600mm long",
  parquet_prefinito:
    "pre-finished engineered wood parquet — real wood top layer with visible grain and slight color variation, factory-applied uniform finish (matte/satin/glossy), click-lock joints with very tight seams, planks typically 120-200mm wide and 1200-2200mm long, consistent surface quality",
  laminato:
    "laminate flooring — high-resolution photographic wood-grain or stone-print surface layer, perfectly uniform repeat pattern every 4-6 planks, slight V-groove beveled edges, matte or semi-gloss surface, planks typically 190-240mm wide and 1200-1380mm long, no natural variation between planks",
  gres_porcellanato:
    "porcelain stoneware (gres porcellanato) — dense ceramic tile with extremely fine surface texture, can imitate marble/stone/concrete/wood with high fidelity, available in large formats (60x60, 60x120, 120x120cm), very thin grout lines (1-3mm), consistent color and pattern, slight rectified edge precision",
  ceramica:
    "ceramic tile — glazed surface with visible gloss or matte finish, wider grout lines (2-5mm) than porcelain, available in many colors and patterns, standard formats (20x20, 30x30, 45x45cm), visible tile edges where glaze meets bisque",
  marmo:
    "natural marble — distinctive veining patterns unique to each slab/tile, high-gloss polished surface with deep reflections, subtle color gradients within each piece, visible variation between tiles, luxury appearance with characteristic translucent depth, grout lines typically 1-2mm",
  pietra_naturale:
    "natural stone — irregular surface texture with fossil marks, grain patterns, and natural color variation, available in slate/travertine/limestone/granite finishes, can be honed/brushed/tumbled, wider grout lines (3-5mm), each piece uniquely different",
  vinile_lvt:
    "luxury vinyl tile (LVT/SPC) — realistic embossed-in-register texture imitating wood or stone, perfectly uniform surface with programmed texture repeat, very thin or zero visible joints, waterproof appearance, slightly softer visual texture than real wood/stone, available in plank or tile format",
  cotto:
    "cotto (terracotta) — warm earth-toned handmade clay tiles, irregular surface with visible hand-forming marks, natural color variation from orange to deep red-brown, unglazed matte surface, typically 15x30 or 25x25cm format, wider grout lines (5-8mm), rustic Mediterranean aesthetic",
  cemento_resina:
    "continuous resin/microcement floor — perfectly seamless surface with NO joints, NO tiles, NO grout lines, subtle trowel texture and micro-imperfections, uniform color with very slight depth variation, industrial-modern aesthetic, matte or satin finish, visible in one continuous pour across the entire room",
  moquette:
    "wall-to-wall carpet (moquette) — continuous soft textile surface with NO joints or seams visible, uniform pile texture (loop/cut/saxony), slight directional shading from pile direction, color perfectly consistent across entire surface, soft diffused light absorption",
  terrazzo_veneziano:
    "Venetian terrazzo — polished composite floor with visible aggregate chips (marble, quartz, glass) embedded in cement or resin matrix, chips vary in size (5-30mm) and color, surface polished to high gloss revealing cross-sections of aggregate, seamless continuous surface with optional brass divider strips",
};

// ── FINITURA_DESC ─────────────────────────────────────────────────────────────
const FINITURA_DESC: Record<FinituraPavimento, string> = {
  lucido: "high-gloss polished finish — strong specular reflections, mirror-like surface, visible ambient reflections on floor",
  opaco: "matte finish — no specular highlights, soft diffused light absorption, flat non-reflective surface",
  satinato: "satin finish — subtle soft sheen, gentle light reflections without harsh specular highlights, silky appearance",
  spazzolato: "brushed finish — directional micro-texture visible on surface, soft tactile grain following wood/stone direction",
  boccardato: "bush-hammered finish — rough textured surface with small impact craters, anti-slip tactile appearance, common on stone",
  anticato: "aged/antiqued finish — artificially weathered surface with worn edges, patina effect, vintage character",
  levigato: "honed/smoothed finish — perfectly flat surface with very subtle matte sheen, no rough texture, refined appearance",
  naturale: "natural finish — untreated surface appearance preserving original material texture, minimal processing visible",
  cerato: "wax finish — warm soft sheen with depth, slightly darker than natural, hand-rubbed appearance, traditional treatment",
};

// ── FUGA_COLORE_DESC ──────────────────────────────────────────────────────────
const FUGA_COLORE_DESC: Record<string, string> = {
  bianco: "white grout — high contrast with most floor colors, clean bright joint lines",
  grigio_chiaro: "light grey grout — subtle neutral contrast, most common residential choice",
  grigio_scuro: "dark grey grout — strong definition between tiles, modern industrial aesthetic",
  nero: "black grout — maximum contrast, dramatic joint lines, contemporary look",
  beige: "beige grout — warm neutral tone, blends well with wood-effect and warm-toned floors",
  tono_su_tono: "color-matched grout — same tone as tile surface, minimizes joint visibility for seamless appearance",
};

// ── BATTISCOPA_DESC ───────────────────────────────────────────────────────────
const BATTISCOPA_DESC: Record<string, string> = {
  coordinato_pavimento: "baseboard matching floor material — same color/texture as the new floor, creating visual continuity between floor and wall",
  bianco: "white painted baseboard — clean bright border between floor and wall, standard residential choice",
  legno: "natural wood baseboard — warm wood tone that complements the floor without exact matching",
  alluminio: "brushed aluminum baseboard — thin modern metal profile, industrial-contemporary aesthetic, typically 40-60mm height",
};

// ── buildPavimentoPrompt ──────────────────────────────────────────────────────
export function buildPavimentoPrompt(
  config: ConfigurazionePavimento,
  analisi?: AnalisiPavimento | null,
): {
  systemPrompt: string;
  userPrompt: string;
  promptVersion: string;
} {
  const a = {
    tipo_stanza: "stanza generica",
    pavimento_attuale: "non identificato",
    colore_attuale: "non identificato",
    dimensione_stimata: "non identificata",
    stato_conservazione: "non identificato",
    battiscopa_presente: false,
    note: "",
    ...(analisi || {}),
  };

  const blocks: Record<string, string> = {};

  // ── [CONTESTO] ──────────────────────────────────────────────────────────
  blocks.CONTESTO = `[CONTESTO — ANALISI STANZA]
Tipo stanza: ${a.tipo_stanza}
Pavimento attuale: ${a.pavimento_attuale} (${a.colore_attuale})
Dimensione stimata: ${a.dimensione_stimata}
Stato conservazione: ${a.stato_conservazione}
Battiscopa presente: ${a.battiscopa_presente ? "SI" : "NO"}
${a.note ? `Note aggiuntive: ${a.note}` : ""}`;

  // ── [PAVIMENTO] ─────────────────────────────────────────────────────────
  const floorPhysics = FLOOR_PHYSICS[config.tipo] || config.tipo;
  const finishPhysics = FINITURA_DESC[config.finitura] || config.finitura;
  const posaPhysics = POSA_PHYSICS[config.pattern_posa] || config.pattern_posa;

  let colorDesc = config.colore_nome || "colore non specificato";
  if (config.colore_hex) colorDesc += ` (hex: ${config.colore_hex})`;
  if (config.colore_ral) colorDesc += ` (RAL ${config.colore_ral})`;

  let formatoDesc = "";
  if (config.formato_piastrella) {
    formatoDesc = `\nFormato piastrella: ${config.formato_piastrella}`;
  }
  if (config.larghezza_listello_mm && config.lunghezza_listello_mm) {
    formatoDesc += `\nDimensioni listello: ${config.larghezza_listello_mm}mm x ${config.lunghezza_listello_mm}mm`;
  }

  let fugaDesc = "";
  if (config.fuga_larghezza_mm != null) {
    const fugaColore = config.fuga_colore
      ? FUGA_COLORE_DESC[config.fuga_colore] || config.fuga_colore
      : "standard grout color";
    fugaDesc = `\n\nGROUT (FUGA):\nWidth: ${config.fuga_larghezza_mm}mm\nColor: ${fugaColore}`;
    if (config.fuga_larghezza_mm === 0) {
      fugaDesc = `\n\nGROUT (FUGA): NONE — seamless joint, no visible grout lines`;
    }
  }

  blocks.PAVIMENTO = `[PAVIMENTO — NUOVO MATERIALE]
Material: ${floorPhysics}

Finish: ${finishPhysics}

Color: ${colorDesc}

Laying pattern: ${posaPhysics}
${formatoDesc}${fugaDesc}

PATTERN RENDERING RULES:
1. The laying pattern MUST be geometrically accurate across the ENTIRE visible floor surface — every tile/plank must follow the specified pattern consistently.
2. Pattern perspective MUST follow the room's vanishing points — tiles near the camera appear larger, tiles far away appear smaller, all converging correctly.
3. Grout lines / joints MUST be consistently spaced and parallel to their respective pattern axes.
4. If the material is seamless (cemento_resina, moquette), do NOT render any tile joints or grout lines.
5. Material texture and color must be consistent across the entire floor with only natural subtle variation appropriate to the material type.`;

  // ── [BATTISCOPA] ────────────────────────────────────────────────────────
  const batt = config.battiscopa;
  if (batt) {
    if (batt.azione === "rimuovi") {
      blocks.BATTISCOPA = `[BATTISCOPA — RIMOZIONE]
Remove all baseboard/skirting. Show clean wall-to-floor junction with no baseboard, no shadow gap, just direct wall meeting floor.`;
    } else if (batt.azione === "sostituisci" && batt.tipo) {
      const battDesc = BATTISCOPA_DESC[batt.tipo] || batt.tipo;
      const altezza = batt.altezza_cm || 8;
      blocks.BATTISCOPA = `[BATTISCOPA — SOSTITUZIONE]
Replace existing baseboard with: ${battDesc}
Height: ${altezza}cm
The new baseboard must run continuously along ALL visible wall-floor junctions.
Color/material must be consistent with the specified type.`;
    } else {
      blocks.BATTISCOPA = `[BATTISCOPA — MANTIENI]
Keep existing baseboard exactly as it appears in the original photo. Do NOT change its color, height, or material.`;
    }
  } else {
    blocks.BATTISCOPA = `[BATTISCOPA]
${a.battiscopa_presente ? "Keep existing baseboard unchanged." : "No baseboard present — do not add one."}`;
  }

  // ── [VINCOLI] ───────────────────────────────────────────────────────────
  blocks.VINCOLI = `[VINCOLI — PRESERVATION RULES]
The following MUST remain 100% pixel-identical to the original photo:
- ALL walls: color, texture, paint, wallpaper, tiles, imperfections
- ALL ceiling: color, texture, lighting fixtures, cornices
- ALL furniture, appliances, and objects resting on the floor
- ALL doors, door frames, windows, and window frames
- ALL lighting conditions, shadows, and ambient light direction
- Camera perspective and lens distortion: IDENTICAL
- Room dimensions and proportions: UNCHANGED
- Any visible pipes, cables, outlets, switches, radiators
- Objects that rest ON the floor (furniture legs, rugs, etc.) must appear naturally placed on the NEW floor surface with correct shadow contact

ABSOLUTE NEGATIVE CONSTRAINTS — NEVER:
- Change any wall color, texture, or decoration
- Move, remove, or add any furniture or object
- Alter the ceiling in any way
- Change window or door appearance
- Add or remove any architectural element not related to the floor
- Produce cartoon, illustration, CGI, or sketch artifacts
- Add watermarks, text overlays, or logos
- Change the camera angle or perspective
- Change image dimensions — output MUST match input exactly
- Show the old floor peeking through anywhere — the new floor must cover 100% of the floor area`;

  // ── System prompt ───────────────────────────────────────────────────────
  const systemPrompt = `You are a SURGICAL PHOTOREALISTIC IMAGE EDITOR specialized in floor replacement for architectural visualization. Your ONLY task: replace EXACTLY the floor surface in the photograph with the specified new flooring material, while leaving EVERYTHING ELSE 100% pixel-perfect identical.

CRITICAL FLOOR RENDERING RULES:
1. The new floor MUST cover the ENTIRE visible floor area — no gaps, no patches of old floor.
2. Floor perspective MUST be geometrically correct — tiles/planks converge toward the room's vanishing points.
3. The laying pattern MUST be consistent and accurate across the whole surface.
4. Reflections on the new floor must match the room's existing light sources and direction.
5. Where furniture touches the floor, render correct contact shadows and natural floor-furniture interaction.
6. Grout lines and joints must follow correct perspective diminution (thinner in the distance).
7. Material texture must be photorealistic — not flat, not cartoonish, not over-saturated.
8. Floor edges at walls must be clean and precise, matching the room's existing wall-floor junction geometry.
9. Output image dimensions MUST match input image dimensions exactly.
10. This is PRECISE SURGICAL REPLACEMENT — do NOT artistically reinterpret the room.`;

  // ── User prompt ─────────────────────────────────────────────────────────
  const userParts = [blocks.CONTESTO, blocks.PAVIMENTO, blocks.BATTISCOPA, blocks.VINCOLI];

  if (config.note_libere) {
    userParts.push(`[NOTE AGGIUNTIVE]\n${config.note_libere}`);
  }

  // ── Final checklist ─────────────────────────────────────────────────────
  userParts.push(`[FINAL CHECKLIST — Verify before output]
- New floor covers 100% of visible floor area
- Laying pattern is geometrically correct in perspective
- Floor color and material match specification exactly
- Grout/joint lines are consistent and follow perspective
- ALL walls, ceiling, furniture, doors, windows are UNCHANGED
- Lighting and shadows are physically correct on new surface
- Image dimensions match original exactly
- No artifacts, no old floor visible, no cartoon effects`);

  const userPrompt = userParts.join("\n\n");

  return {
    systemPrompt,
    userPrompt,
    promptVersion: "1.0.0",
  };
}
