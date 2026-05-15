import type {
  FinituraPavimentazioneEsterna,
  PatternPosaEsterna,
  TipoBordoEsterna,
  TipoGiuntoEsterno,
  TipoGradinoEsterno,
  TipoPavimentazioneEsterna,
  UsoSuperficieEsterna,
} from "./types.ts";

export const EXTERIOR_FLOOR_MATERIAL_DESCRIPTIONS: Record<TipoPavimentazioneEsterna, string> = {
  gres_outdoor: "outdoor porcelain pavers with exterior-grade anti-slip surface, calibrated edges, realistic 2 cm slab feel and weather-resistant ceramic behavior",
  pietra_naturale: "natural stone paving with real mineral variation, slight thickness character, outdoor micro-roughness and non-flat printed texture",
  masselli_autobloccanti: "interlocking concrete pavers / betonelle with stable modular repetition, sand-filled joints and driveway-grade robustness",
  cotto_esterno: "outdoor terracotta/cotto paving with warm handmade variation, porous matte surface and subtle irregular edges",
  cemento_architettonico: "architectural concrete paving with controlled slab fields, light trowel/cast texture and exterior matte surface",
  cemento_drenante: "draining washed/permeable concrete with granular exposed texture, water-permeable appearance and outdoor ruggedness",
  deck_wpc: "WPC outdoor deck boards with clear board direction, narrow open gaps, composite wood texture and realistic exterior decking behavior",
  deck_legno: "natural exterior timber deck boards with visible grain, board variation, open gaps and weatherable wood surface",
  ghiaia_stabilizzata: "stabilized gravel surface with compacted aggregate, honeycomb-like stability implied only if plausible, no loose random pile look",
  lastre_grande_formato: "large-format exterior slabs with sparse joints, broad uninterrupted fields, plausible perimeter cuts and anti-slip outdoor finish",
  coping_bordo_piscina: "pool coping edge system with dense water-compatible material, visible thickness, clean perimeter line and basin-safe profile",
};

export const EXTERIOR_FLOOR_FINISH_DESCRIPTIONS: Record<FinituraPavimentazioneEsterna, string> = {
  opaco: "matte exterior finish with no indoor-polished glare",
  naturale: "natural exterior finish with restrained texture and realistic weather response",
  fiammato: "flamed stone-like surface with fine rough texture and anti-slip behavior",
  spazzolato: "brushed exterior texture with directional tactile grain",
  sabbiato: "sandblasted matte surface with soft granular roughness",
  bocciardato: "bush-hammered micro-pitted texture suitable for outdoor grip",
  antiscivolo: "clearly anti-slip exterior surface with subtle roughness",
  lavato: "washed aggregate / exposed grain surface",
  effetto_materico: "material-rich exterior surface with visible depth, roughness and outdoor credibility",
};

export const EXTERIOR_PATTERN_DESCRIPTIONS: Record<PatternPosaEsterna, string> = {
  rettilineo: "straight aligned laying pattern with grid lines locked to perspective",
  a_correre: "running bond pattern with staggered modules and plausible perimeter cuts",
  diagonale: "diagonal laying pattern, consistent 45-degree direction and perspective-correct cuts",
  opus: "opus / mixed-size stone layout with deliberate modular logic, not random AI patches",
  modulare: "modular pattern with repeated large/small module families and consistent joint rhythm",
  cassero: "irregular running/cassero layout with controlled stagger and believable module lengths",
  doga_parallela: "parallel deck-board layout with continuous board direction",
  doga_sfalsata: "staggered deck-board layout with offset board ends and open gaps",
  stepping_stones: "stepping-stone path with individual slabs set into lawn/gravel and believable gaps",
  massello_spina: "interlocking pavers in herringbone driveway-capable arrangement",
  massello_classico: "classic interlocking paver layout with stable modular repetition",
};

export const EXTERIOR_JOINT_DESCRIPTIONS: Record<TipoGiuntoEsterno, string> = {
  fuga_sottile: "thin exterior grout joint, perspective-correct and not overly dense",
  fuga_media: "medium exterior grout joint with realistic outdoor width",
  fuga_larga: "wide outdoor joint suitable for stone/pavers, stable and consistent",
  drenante: "draining joint logic, water-permeable gaps and plausible runoff behavior",
  sabbia_polimerica: "polymeric sand-filled paver joints with dry granular look",
  giunto_aperto_deck: "open deck gaps between boards, dark reveal lines and drainage-ready spacing",
  nessuno_visibile: "no obvious visible joint; previous grid traces must disappear if replacing",
};

export const EXTERIOR_BORDER_DESCRIPTIONS: Record<TipoBordoEsterna, string> = {
  nessuno: "no extra border band unless existing edges require clean termination",
  fascia_perimetrale: "perimeter band framing the field with clean turns and matching scale",
  bordo_pietra: "stone border with visible thickness and crisp edge against adjacent material",
  bordo_alluminio: "thin aluminum edging strip, subtle and clean, no bulky fake trim",
  bordo_massello: "paver border course with robust outdoor edge restraint logic",
  coping_piscina_moderno: "modern pool coping with slim dense profile and clean water-compatible edge",
  coping_piscina_classico: "classic pool coping with thicker rounded or eased profile and visible depth",
};

export const EXTERIOR_STEP_DESCRIPTIONS: Record<TipoGradinoEsterno, string> = {
  nessuno: "no step intervention unless visible/selected",
  rivestito_stesso_materiale: "steps clad with the same selected material, consistent tread/riser surfaces",
  pedata_alzata_coordinate: "coordinated tread and riser finishes with clean nosing and aligned joints",
  toro_arrotondato: "rounded bullnose/toro step edge, realistic thickness and exterior durability",
  gradone_monolitico: "monolithic block-like step with substantial edge and plausible stone/concrete mass",
};

export const EXTERIOR_USAGE_DESCRIPTIONS: Record<UsoSuperficieEsterna, string> = {
  pedonale: "pedestrian exterior use with comfortable surface and realistic outdoor grip",
  carrabile_leggera: "light vehicular use: robust module, stable bedding, no fragile decorative-only finish",
  carrabile_intensa: "intensive vehicular use: very robust paver/concrete logic, stable pattern and driveway-grade joints",
  bordo_piscina: "poolside use: anti-slip, water-compatible coping/deck transitions and clean drainage",
  area_relax: "outdoor lounge use with comfortable paving/deck and preserved furniture contact shadows",
  camminamento_giardino: "garden walkway use with clear path geometry and clean lawn/gravel transitions",
};

export const DEFAULT_EXTERIOR_FLOOR_INTEGRITY_CONSTRAINTS = [
  "same house facade",
  "same windows and doors",
  "same outdoor area and camera perspective",
  "same non-target lawn, garden, deck, pool basin, pergola, walls and fences",
  "same sky, vegetation, neighboring buildings and outdoor furniture unless selected",
  "same image crop, dimensions and aspect ratio",
];

export const DEFAULT_EXTERIOR_FLOOR_NEGATIVE_CONSTRAINTS = [
  "different property",
  "redesigned house",
  "moved windows or doors",
  "altered non-target garden",
  "changed pool basin when coping-only",
  "floating pavement",
  "impossible threshold height",
  "random AI paving pattern",
  "old grout ghost visible",
  "hybrid old/new paving",
  "indoor glossy floor outside",
  "smudged material transitions",
  "fake CGI showroom look",
  "stylized or illustrative output",
  // v8.6.4 — Anti-dimming luminosità source (cross-render)
  "darkened outdoor scene or cinematic teal-orange grading",
  "desaturated or muted natural daylight",
  "dusk or overcast atmosphere when source shows bright daylight",
  "different time-of-day from source",
];

export function bullets(lines: Array<string | null | undefined>): string {
  return lines
    .filter((line): line is string => Boolean(line && line.trim()))
    .map((line) => `- ${line}`)
    .join("\n");
}
