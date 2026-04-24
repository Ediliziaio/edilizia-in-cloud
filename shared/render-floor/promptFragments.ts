import type {
  Bisellatura,
  DirezionePosa,
  EffettoVisivoPavimento,
  EssenzaLegno,
  FasceBordo,
  FinituraPavimento,
  GiuntoPerimetrale,
  PatternPosa,
  ScalaPattern,
  SogliePorte,
  TipoPavimento,
  VariazioneTono,
} from "./types.ts";

export const MATERIAL_DESCRIPTIONS: Record<TipoPavimento, string> = {
  parquet_massello:
    "solid hardwood parquet: real timber, unique grain, natural board-to-board variation, credible knots, warm depth, visible plank edges",
  parquet_prefinito:
    "engineered prefinished parquet: real wood top layer, controlled factory finish, tight click seams, natural but orderly grain variation",
  laminato:
    "laminate flooring: printed wood/stone surface with more regular repetition than real wood, V-groove bevels, controlled matte surface",
  gres_porcellanato:
    "rectified porcelain stoneware: dense ceramic body, precise edges, thin grout, can reproduce marble, stone, concrete or wood with ceramic realism",
  ceramica:
    "ceramic tiles: glazed ceramic surface, slightly wider grout than rectified porcelain, visible tile-body edge logic",
  marmo:
    "natural marble: real slab/tile depth, natural veining, translucent polished depth, non-repeating veining between pieces",
  pietra_naturale:
    "natural stone: mineral texture, micro-irregular surface, tone variation, honed/brushed/tumbled credibility",
  vinile_lvt:
    "LVT/SPC vinyl: thin resilient floor, embossed-in-register texture, controlled repetition, very tight seams",
  cotto:
    "terracotta cotto: warm fired-clay tones, handmade irregularities, matte porous surface, rustic non-perfect edges",
  cemento_resina:
    "continuous resin/microcement floor: seamless trowel-applied surface, no modules, no grout, subtle mineral movement",
  resina_continua:
    "continuous resin floor: seamless poured surface, no tile joints, softly clouded depth and controlled satin reflection",
  microcemento:
    "microcement floor: seamless hand-trowelled mineral surface, fine spatula marks, continuous modern finish",
  moquette:
    "wall-to-wall carpet: continuous textile surface, soft pile direction, no grout, no tile/plank modules",
  terrazzo_veneziano:
    "Venetian terrazzo: polished composite with marble/quartz aggregate chips, natural chip distribution, optional divider strips",
};

export const VISUAL_EFFECT_DESCRIPTIONS: Record<EffettoVisivoPavimento, string> = {
  legno: "wood look must show believable grain direction, board identity and controlled tone variation",
  marmo: "marble look must show natural veining with slab-scale continuity, not a flat printed texture",
  pietra: "stone look must show mineral grain, mild irregularity and realistic honed or textured depth",
  cemento: "concrete look must show subtle mineral clouds, not a flat grey fill",
  resina: "resin look must be continuous, seamless and lightly trowelled with no old grid ghosts",
  cotto: "terracotta look must show warm handmade fired-clay variation and slightly imperfect edges",
  tessile: "textile look must absorb light softly and show pile direction without joints",
  terrazzo: "terrazzo look must show chips embedded in a matrix with believable scale and depth",
  neutro: "neutral look must remain material-credible and not generic AI blur",
};

export const WOOD_ESSENCE_DESCRIPTIONS: Record<EssenzaLegno, string> = {
  rovere_naturale: "natural oak: honey-beige oak with visible open grain and moderate plank variation",
  rovere_sbiancato: "bleached oak: pale beige-white oak with soft grain and low yellow saturation",
  rovere_miele: "honey oak: warm golden oak, medium saturation, visible straight and cathedral grain",
  noce: "walnut: warm medium-dark brown with elegant darker grain ribbons and refined contrast",
  teak: "teak: golden brown tropical wood with linear grain and subtle darker streaks",
  wenghe: "wenge: very dark brown wood, tight grain, premium low-sheen finish",
  frassino_bianco: "white ash: light creamy white wood, clear linear grain, clean contemporary look",
};

export const FINISH_DESCRIPTIONS: Record<FinituraPavimento, string> = {
  lucido: "polished glossy finish with controlled specular reflection consistent with the room light",
  opaco: "matte finish with soft diffuse light and no strong mirror highlights",
  satinato: "satin finish with gentle sheen and restrained reflections",
  spazzolato: "brushed tactile finish with directional micro-texture",
  boccardato: "bush-hammered anti-slip surface with fine impact texture",
  anticato: "aged finish with worn but realistic edges and mild patina",
  levigato: "honed flat finish with refined low sheen",
  naturale: "natural finish preserving the material texture without artificial gloss",
  cerato: "waxed finish with warm soft sheen and surface depth",
};

export const PATTERN_DESCRIPTIONS: Record<PatternPosa, string> = {
  rettilineo_dritto:
    "straight aligned layout: joints form uninterrupted parallel grid lines with no row offset",
  a_correre:
    "running bond 50 percent offset: regular half-length stagger with aligned rows",
  sfalsato_33:
    "one-third offset: each row shifts exactly one third of the module length",
  spina_di_pesce:
    "classic herringbone: rectangular strips meet at 90 degrees, creating a woven broken-zigzag pattern, not chevron-cut ends",
  spina_ungherese:
    "Hungarian point / chevron: strip ends are cut at matching angles, forming continuous sharp V points, clearly different from classic herringbone",
  diagonale_45:
    "45 degree diagonal layout relative to the walls, with perspective-correct diamond/diagonal joint logic",
  cassero_irregolare:
    "irregular plank bond with varied lengths and non-repeating stagger, typical of real wood installation",
  opus_romanum:
    "opus romanum modular stone/tile layout with multiple module sizes repeated in a controlled Roman pattern",
  doppia_fila:
    "double-strip paired layout: two narrow boards form one visual module before staggering",
  modulare:
    "modular mixed-size layout with repeating geometric modules, never random AI fragments",
  esagonale:
    "hexagonal tessellation with consistent six-sided modules and perspective-correct grout",
};

export const TONE_VARIATION_DESCRIPTIONS: Record<VariazioneTono, string> = {
  uniforme: "low tone variation; pieces should be visually calm and consistent",
  leggera: "light tone variation; mild natural shifts without a busy pattern",
  naturale: "natural tone variation; realistic piece-to-piece differences appropriate to the material",
  marcata: "marked tone variation; stronger but still realistic contrast between modules",
};

export const BEVEL_DESCRIPTIONS: Record<Bisellatura, string> = {
  nessuna: "no visible bevel; edges appear flush and clean",
  microbisello: "micro-beveled edges: very fine shadow line between boards/tiles",
  bisello_v: "V-groove bevels: visible V-shaped edge lines on planks/modules",
  bordo_irregolare: "slightly irregular natural edges, suitable only for cotto or stone",
};

export const DIRECTION_DESCRIPTIONS: Record<DirezionePosa, string> = {
  segue_prospettiva: "align the laying direction to the photographed room perspective and main vanishing point",
  parallela_parete_lunga: "run the main module direction parallel to the longest visible wall",
  perpendicolare_parete_lunga: "run the main module direction perpendicular to the longest visible wall",
  verso_finestra: "run the main direction toward the visible window/light source where spatially plausible",
  diagonale_45: "run the layout diagonally at 45 degrees relative to the room walls",
};

export const SCALE_DESCRIPTIONS: Record<ScalaPattern, string> = {
  compatta: "compact module scale with many visible pieces, but still geometrically regular",
  standard: "standard residential module scale",
  grande_formato: "large-format modules with fewer, larger visible pieces and sparse joints",
  maxi_lastre: "maxi slab scale: very large slabs, extremely low joint density, no small-tile grid, no visual subdivision into smaller tiles",
};

export const THRESHOLD_DESCRIPTIONS: Record<SogliePorte, string> = {
  mantieni: "keep existing door thresholds and transition strips unchanged",
  sostituisci_coerenti: "replace visible thresholds with coherent new transition profiles matching the new floor",
  integra_senza_soglia: "integrate transitions flush where plausible, avoiding random metal strips",
};

export const PERIMETER_JOINT_DESCRIPTIONS: Record<GiuntoPerimetrale, string> = {
  standard_nascosto: "standard expansion joint hidden under skirting or edge trim",
  ombra_sottile: "thin shadow gap at perimeter, clean and consistent along walls",
  sigillatura_elastica: "elastic perimeter sealant, clean thin line at wall-floor junction",
};

export const BORDER_BAND_DESCRIPTIONS: Record<FasceBordo, string> = {
  nessuna: "no decorative border band",
  cornice_perimetrale: "perimeter border frame aligned to the room walls, only if visible and geometrically plausible",
  fascia_stesso_materiale: "same-material perimeter strip, subtle and construction-plausible",
};

export const GROUT_COLOR_DESCRIPTIONS: Record<string, string> = {
  bianco: "white grout",
  grigio_chiaro: "light grey grout",
  grigio_scuro: "dark grey grout",
  nero: "black grout",
  beige: "beige grout",
  tono_su_tono: "tone-on-tone grout, matched to the new floor surface to minimize joint contrast",
};

export const BASEBOARD_DESCRIPTIONS: Record<string, string> = {
  coordinato_pavimento: "baseboard coordinated with the new floor material and color",
  bianco: "clean white painted baseboard",
  legno: "natural wood baseboard, warm and compatible with the selected floor",
  alluminio: "thin brushed aluminum modern baseboard",
};

export const DEFAULT_INTEGRITY_CONSTRAINTS = [
  "walls, wall colors, wallpaper and wall tiles",
  "ceiling, lighting fixtures and ceiling geometry",
  "all furniture, appliances, rugs and objects",
  "doors, windows, frames, radiators, outlets and switches",
  "room dimensions, camera perspective, lens distortion and image dimensions",
  "all non-floor architectural elements",
];

export const DEFAULT_QUALITY_DIRECTIVES = [
  "professional interior renovation visualization",
  "same-room realism",
  "material credibility",
  "pattern accuracy",
  "correct floor-object contact shadows",
  "no generic AI restyling",
];

export const DEFAULT_NEGATIVE_CONSTRAINTS = [
  "do not redesign the room",
  "do not move, remove or add furniture or objects",
  "do not change wall color, wall texture, ceiling, doors or windows",
  "do not create new architectural elements",
  "do not leave any patch or ghost grid of the old floor visible",
  "do not distort perspective or pattern geometry",
  "do not create hybrid flooring states",
  "do not generate CGI, cartoon, painterly, showroom or staged output",
  "do not change image dimensions, crop or orientation",
];
