import type {
  AccessorioPiscina,
  AreaPerimetralePiscina,
  ColoreAcquaPiscina,
  RivestimentoInternoPiscina,
  SistemaAccessoPiscina,
  SistemaBordoPiscina,
  TipoCopingPiscina,
  TipoPiscina,
} from "./types.ts";

export const POOL_TYPE_DESCRIPTIONS: Record<TipoPiscina, string> = {
  interrata_rettangolare: "in-ground rectangular residential pool with crisp straight geometry and buildable proportions",
  interrata_organica: "in-ground freeform organic pool integrated into garden landscape with natural curved perimeter",
  lap_pool: "long narrow lap pool, linear and proportional, clearly designed for swimming lanes",
  plunge_pool: "compact plunge pool, small but premium, integrated into patio/garden without looking like a tub dropped in",
  sfioro_rettangolare: "rectangular overflow pool with continuous premium edge and water close to upper coping level",
  infinity_pool: "infinity-edge pool only where the view/level context supports it, with a readable vanishing overflow edge",
  semi_incassata: "semi-inground premium pool with visible raised edge and clean landscape/deck integration",
  fuori_terra_premium: "premium above-ground pool with architectural cladding/base, never inflatable or cheap-looking",
  minipiscina: "compact spa-like mini pool integrated into terrace/patio with precise coping and technical details",
  terrazzo_compatta: "compact terrace/rooftop-compatible pool, only if scene support and load/edge logic are visually plausible",
};

export const WATER_SYSTEM_DESCRIPTIONS: Record<SistemaBordoPiscina, string> = {
  skimmer: "traditional premium skimmer system: waterline sits slightly below coping, clear but subtle skimmer-pool behavior, no overflow ambiguity",
  sfioro: "overflow system: water level very close to upper edge with continuous premium perimeter, visible overflow logic where plausible",
  infinity_edge: "infinity edge: one edge visually spills toward a lower/view side; only plausible when scene has a view, drop, terrace edge or slope",
  sfioro_nascosto: "hidden overflow system: clean flush waterline with very discreet channel detail, premium continuous edge without visible skimmer look",
};

export const INTERIOR_FINISH_DESCRIPTIONS: Record<RivestimentoInternoPiscina, string> = {
  mosaico_bianco: "white pool mosaic, bright base tone, high water clarity and luminous light-blue reflections",
  mosaico_azzurro: "classic light-blue mosaic, familiar clear-blue water tone with visible small tesserae only where close enough",
  mosaico_grigio: "contemporary grey mosaic, elegant muted blue-grey water, controlled reflections and premium tone",
  mosaico_antracite: "dark anthracite mosaic, deeper dramatic water color with more mirror-like reflections and visible depth gradient",
  gres_effetto_pietra: "stone-effect porcelain pool finish, natural mineral base, refined water tone, not a flat blue texture",
  gres_effetto_sabbia: "sand-effect porcelain pool finish, pale beach-like base, turquoise/sandy shallow water perception",
  liner_chiaro: "premium light liner, clean uniform base and soft clear water, no cheap plastic appearance",
  liner_scuro: "premium dark liner, deep blue/charcoal water with stronger reflection and depth shading",
  resina_premium: "premium continuous resin pool finish, seamless surface, soft reflections and no visible tile grid",
  pietra_naturale_pool_finish: "natural stone pool finish, subtle mineral irregularity and luxurious grounded water tone",
};

export const WATER_LOOK_DESCRIPTIONS: Record<ColoreAcquaPiscina, string> = {
  cristallina_chiara: "crystal-clear light water with realistic transparency and visible shallow-depth gradient",
  azzurra_classica: "classic residential blue water, natural under sunlight, not neon or fantasy",
  turchese: "turquoise water influenced by light interior finish and sky reflection, realistic and premium",
  grigio_verde_naturale: "natural grey-green water tone, refined and landscape-integrated, not dirty",
  blu_profondo: "deeper blue water tone with believable depth shading and reflective highlights",
  sabbia_chiara: "light sandy water tone for beach-entry/shallow areas, transparent and warm",
};

export const COPING_DESCRIPTIONS: Record<TipoCopingPiscina, string> = {
  pietra_chiara: "light natural-stone coping with visible thickness, soft bevel and continuous perimeter",
  pietra_grigia: "grey stone coping, contemporary and tactile, consistent slab size and clean junctions",
  gres_2cm: "2cm outdoor porcelain coping, thin modern slabs, crisp rectified edges and precise joints",
  travertino: "travertine coping with warm beige tone, natural pores, believable thickness and premium edge profile",
  legno_wpc: "WPC/wood deck coping transition, warm board direction and realistic outdoor plank joints",
  cemento_spazzolato: "brushed concrete coping, modern matte texture, realistic formed edge and subtle variation",
  bordo_sottile_moderno: "thin modern coping edge, minimal profile, precise continuous line around the pool",
  bordo_massivo_classico: "thicker classic coping, more substantial edge profile and traditional residential character",
};

export const ACCESS_DESCRIPTIONS: Record<SistemaAccessoPiscina, string> = {
  nessuno: "no added access feature; do not invent stairs, ladder or beach shelf",
  scala_inox: "stainless-steel pool ladder, properly anchored to coping with realistic metal reflections",
  gradini_angolo: "corner entry steps, visible below water, proportional and integrated into pool geometry",
  gradini_frontali: "front entry steps, clearly readable through water, aligned to main pool axis",
  gradoni_lounge: "wide internal lounge steps / seating ledge, shallow zone clearly visible and integrated",
  spiaggetta: "baja shelf / tanning ledge, broad shallow area with thinner transparent water and clear level transition",
  beach_entry: "beach entry sloped shallow access, gradual water depth and natural walk-in geometry",
};

export const AREA_DESCRIPTIONS: Record<AreaPerimetralePiscina, string> = {
  mantieni_esistente: "preserve existing surrounding lawn/deck/paving except precise pool insertion junctions",
  deck_wpc: "WPC/wood-look solarium deck around the pool, boards aligned to perspective with real plank joints",
  solarium_gres: "outdoor porcelain solarium paving, slip-resistant slabs, realistic joints and clean perimeter",
  pietra_naturale: "natural-stone poolside paving with believable slabs, thickness and material variation",
  prato_raccordato: "lawn restored and cleanly cut around coping, no muddy AI-smudged edge",
  ghiaia_drenante: "draining gravel perimeter, controlled texture, realistic containment edge",
};

export const ACCESSORY_DESCRIPTIONS: Record<AccessorioPiscina, string> = {
  illuminazione_subacquea: "subtle underwater lights integrated into pool walls, realistic soft glow only if lighting conditions support visibility",
  lama_dacqua: "linear water blade feature, physically attached to a wall/edge and flowing into pool, not decorative fantasy",
  cascata: "small architectural waterfall feature, scale-appropriate and connected to pool edge/wall",
  idromassaggio_integrato: "integrated spa/hydromassage zone, visible jets and seating only if selected, coherent with pool geometry",
  copertura_isotermica: "thermal pool cover only if requested, physically aligned with water surface and stored/closed coherently",
  copertura_rigida: "rigid pool cover with believable panels or shuttered surface, no arbitrary tarp look",
  doccia_esterna: "outdoor shower near poolside, sparse and buildable, not a random decorative object",
  zona_prendisole: "minimal sunbathing area with restrained loungers only if space supports it",
};

export const DEFAULT_INTEGRITY_CONSTRAINTS = [
  "preserve the same house, facade, windows, doors and outdoor architecture",
  "preserve non-target lawn, paving, deck, patio and garden areas",
  "preserve trees, important vegetation, fences, walls, boundaries and neighboring buildings",
  "preserve existing outdoor furniture unless explicitly changed or decluttered",
  "preserve sky, weather, camera angle, perspective, crop, image dimensions and orientation",
];

export const DEFAULT_WATER_REALISM_RULES = [
  "water must show realistic specular reflections, not flat painted blue",
  "water transparency must depend on depth, interior finish and scene lighting",
  "depth gradient and shadow inside the basin must be physically plausible",
  "subtle caustics are allowed only when natural and restrained",
  "reflections of sky, facade and vegetation must follow the original camera angle",
  "avoid neon-blue fantasy water and fake resort CGI look",
];

export const DEFAULT_QUALITY_DIRECTIVES = [
  "professional pool sales visualization",
  "same-property realism",
  "technically plausible pool insertion",
  "clearly recognizable selected pool system",
  "water, coping, deck transitions, shadows and contact occlusion must look photographic",
];

export const DEFAULT_NEGATIVE_CONSTRAINTS = [
  "do not redesign the house",
  "do not move windows, doors, fences, walls or fixed outdoor structures",
  "do not alter non-target garden, lawn, paving, deck, patio or neighboring property",
  "do not invent random resort furniture, palm trees, fountains or luxury styling not requested",
  "do not create impossible infinity-edge conditions",
  "do not create a floating, pasted-on or badly merged pool",
  "do not leave traces of removed pools, coping, deck edges or old water features",
  "do not generate a different property or generic outdoor catalog scene",
  // v8.6.4 — Anti-dimming luminosità source (cross-render)
  "do not darken the outdoor scene or apply cinematic teal-orange grading",
  "do not desaturate or mute the natural daylight of the source photo",
  "do not add dusk or overcast atmosphere when source shows bright daylight",
  "do not change the time-of-day visible in the source",
];
