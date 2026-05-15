import type {
  BedType,
  GardenLightingMode,
  GardenStyle,
  GroundCoverType,
  HedgeType,
  LawnType,
  OutdoorFurnitureMode,
  PathType,
  PlantingDensity,
} from "./types.ts";

export function bullets(lines: Array<string | null | undefined>): string {
  return lines
    .filter((line): line is string => Boolean(line && line.trim()))
    .map((line) => `- ${line}`)
    .join("\n");
}

export const GARDEN_STYLE_DESCRIPTIONS: Record<GardenStyle, string> = {
  moderno_minimale: "minimal modern garden: clean edges, clean lines, controlled green masses, few strong elements, crisp edges, premium but restrained composition",
  mediterraneo: "Mediterranean garden: warm mineral textures, aromatic shrubs, olive/lavender/rosemary-like palette, dry-climate planting and relaxed elegant borders",
  naturale: "naturalistic landscape garden: softer planting drifts, layered grasses/perennials, readable but less formal structure, not chaotic",
  contemporaneo: "clean contemporary garden: balanced lawn, structured beds, subtle materials, precise edges and tidy residential design",
  tropicale_controllato: "controlled tropical garden: lush but disciplined foliage, strong leaf shapes, no jungle overcrowding, plausible for the property scale",
  rustico_elegante: "elegant rustic garden: natural stone, softer shrubs, warm informal planting, refined countryside feeling without mess",
  zen: "zen-inspired garden: calm composition, gravel/stone accents, sculptural planting, open breathing space and controlled asymmetry",
  classico: "ordered classic garden: formal lawn, clipped low hedges, symmetrical borders and tidy flowering accents",
  low_maintenance: "low-maintenance garden: robust planting, reduced delicate lawn, mulch/gravel/tappezzanti, clear edges and easy upkeep",
  premium_relax: "premium relaxation garden: coherent lawn, curated planting, discreet lighting and sparse high-end outdoor living zone",
};

export const LAWN_DESCRIPTIONS: Record<LawnType, string> = {
  prato_inglese: "dense fine-bladed English lawn, lush green, even but natural, not plastic-looking",
  prato_resistente: "durable residential lawn with realistic mixed blade texture, robust and slightly less delicate",
  macroterma: "warm-season macrothermal lawn, compact resilient texture and sun-tolerant look",
  prato_ornamentale: "ornamental lawn with refined smooth surface, realistic blade variation and premium maintenance",
  prato_low_maintenance: "low-maintenance lawn/turf mix with natural variation, less fragile and less water-demanding",
  sintetico_premium: "premium synthetic turf only if selected: very even but with subtle fiber direction, no fake neon carpet effect",
};

export const BED_DESCRIPTIONS: Record<BedType, string> = {
  perimetrale: "perimeter planting beds following existing edges, fences or garden borders with clean depth",
  isola: "island bed inside lawn, rounded or geometric depending on style, with clear border and breathing space",
  lineare: "linear planting strip with controlled rhythm and crisp edge",
  angolare: "corner planting bed filling an empty corner without blocking circulation",
  bordo_piscina: "poolside planting bed kept away from coping and waterline, with clean maintenance strip",
  bordo_camminamento: "planting bed along a path edge, respecting walking clearance",
  sottofinestre: "low planting below windows, never blocking openings or facade details",
};

export const HEDGE_DESCRIPTIONS: Record<HedgeType, string> = {
  schermante_alta: "tall screening hedge, continuous but organic, with realistic plant texture and clearance from windows/doors",
  schermante_media: "medium privacy hedge, visually protective without turning into an artificial green wall",
  bassa_formale: "low formal hedge used as edge definition, clipped but not plastic",
  naturale_morbida: "soft natural hedge, layered and informal, with realistic density variation",
};

export const PATH_DESCRIPTIONS: Record<PathType, string> = {
  stepping_stones: "stepping stones path with plausible stride spacing, integrated into lawn or gravel",
  ghiaia: "gravel path with compacted edge, realistic aggregate texture and usable width",
  pietra_naturale: "natural stone path with irregular but controlled slabs and realistic joints",
  betonelle: "modular paver path with stable repeated pattern and credible joints",
  deck_path: "wood/WPC deck path with visible board direction and open gaps",
  lastre_modulari: "modular outdoor slabs path with clean grid and perspective-correct spacing",
};

export const GROUND_COVER_DESCRIPTIONS: Record<GroundCoverType, string> = {
  ghiaia: "decorative gravel ground cover with clean edges and realistic aggregate scale",
  corteccia: "bark mulch ground cover with natural brown texture and clear bed boundaries",
  lapillo: "lapillo volcanic gravel with dark red/brown granular texture, used only in bed areas",
  stabilizzato: "stabilized gravel/mineral surface, compact and usable, not random loose texture",
  tappezzante_vegetale: "living ground-cover plants, low and continuous, not tall shrubs",
};

export const DENSITY_DESCRIPTIONS: Record<PlantingDensity, string> = {
  bassa: "low density planting with clear soil/mulch visibility and strong breathing space",
  media: "medium density planting with realistic mature spacing and layered shrubs",
  alta: "high density planting only in target beds, still maintainable and not overcrowded",
};

export const FURNITURE_DESCRIPTIONS: Record<OutdoorFurnitureMode, string> = {
  mantieni: "preserve existing outdoor furniture exactly in place; adapt only shadows and surrounding planting",
  aggiungi_minimo: "add only sparse coherent garden furniture, small and physically placed",
  aggiungi_relax: "add a restrained relaxation setup only in the selected relax zone, not a resort staging",
  sostituisci_leggero: "lightly replace selected outdoor furniture while preserving function and circulation",
};

export const LIGHTING_DESCRIPTIONS: Record<GardenLightingMode, string> = {
  nessuna: "do not add garden lights",
  segnapasso: "subtle path marker lights along circulation routes, low glare and realistic spacing",
  uplight_vegetazione: "discreet uplights aimed at selected trees/shrubs, with physically plausible glow",
  luce_perimetrale: "soft perimeter lighting along borders or walls, sparse and buildable",
  mix_soft: "soft mix of path markers and planting accents, restrained and realistic",
};

export const DEFAULT_GARDEN_INTEGRITY_CONSTRAINTS = [
  "preserve the house facade, windows, doors and architectural shell",
  "preserve non-target hardscape, patio, deck, pool, pergola, fences and walls",
  "preserve sky, neighboring buildings, street context and significant existing trees unless targeted",
  "preserve image dimensions, crop, camera angle and perspective",
  "do not alter non-target garden zones or functional access paths",
];

export const DEFAULT_GARDEN_NEGATIVE_CONSTRAINTS = [
  "do not redesign the house",
  "do not alter non-target architectural elements",
  "do not invent random pools, pergolas or pavements",
  "do not place trees too close to impossible locations",
  "do not block paths, doors, windows, pool coping or pergola access unless explicitly requested",
  "do not overfill the space with vegetation",
  "do not leave hybrid old/new garden states",
  "do not create a luxury resort scene unless requested",
  "do not stylize, illustrate or generate a different property",
  // v8.6.4 — Anti-dimming luminosità source (cross-render)
  "do not darken the outdoor scene or apply cinematic teal-orange grading",
  "do not desaturate or mute the natural daylight of the source",
  "do not add dusk or overcast atmosphere when source shows bright daylight",
  "do not change the time-of-day visible in the source photo",
];

export const DEFAULT_GARDEN_QUALITY_DIRECTIVES = [
  "professional garden sales visualization",
  "same-property realism",
  "plausible planting composition",
  "clearly recognizable selected garden style",
  "trustworthy output for commercial use",
];
