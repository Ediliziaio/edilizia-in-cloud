import type {
  AccessorioPiscina,
  AreaPerimetralePiscina,
  ColoreAcquaPiscina,
  QuotaBordoPiscina,
  RivestimentoEsternoPiscina,
  RivestimentoInternoPiscina,
  SistemaAccessoPiscina,
  SistemaBordoPiscina,
  SuperficieRipristinoPiscina,
  TipoCopingPiscina,
  TipoPiscina,
} from "./types.ts";
import { MISURE_PISCINA_METRI } from "./types.ts";

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
  biopiscina: "natural swimming pool (biopiscina): a clear swimming zone beside a planted regeneration zone with aquatic plants and washed gravel, natural stone or timber edges, no tiles and no chlorine-blue look",
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

/** Le coperture si vedono in parte: così restano leggibili anche acqua, rivestimento e gradini. */
export const COVER_DESCRIPTIONS = {
  copertura_isotermica:
    "floating thermal bubble cover shown partly deployed: rolled on a reel at one short end with only a section pulled over the water, so the rest of the pool stays open and visible",
  copertura_rigida:
    "automatic slatted rigid cover shown partly closed over about a third of the pool, rolling out from a flush housing or bench at one end, the rest of the water left open and visible",
} as const;

export const ACCESSORY_DESCRIPTIONS: Record<AccessorioPiscina, string> = {
  illuminazione_subacquea: "subtle underwater lights integrated into pool walls, realistic soft glow only if lighting conditions support visibility",
  lama_dacqua: "linear water blade feature, physically attached to a wall/edge and flowing into pool, not decorative fantasy",
  cascata: "small architectural waterfall feature, scale-appropriate and connected to pool edge/wall",
  idromassaggio_integrato: "integrated spa/hydromassage zone, visible jets and seating only if selected, coherent with pool geometry",
  // Coperture: «chiusa» o «aperta» non era detto, e una copertura chiusa nasconde acqua,
  // rivestimento e gradini che il resto del prompt chiede di mostrare. Si mostrano parzialmente.
  copertura_isotermica: COVER_DESCRIPTIONS.copertura_isotermica,
  copertura_rigida: COVER_DESCRIPTIONS.copertura_rigida,
  doccia_esterna: "outdoor shower near poolside, sparse and buildable, not a random decorative object",
  zona_prendisole: "minimal sunbathing area with restrained loungers only if space supports it",
  recinzione_vetro: "glass pool safety fence: frameless clear glass panels about 1.2 m high on slim floor spigots, set back on the deck around the pool with a self-closing glass gate, keeping the view through",
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

/**
 * Quota del bordo rispetto al terreno (inserimento.quota_bordo). «A filo terreno» è il
 * default e non aggiunge testo: lo dice già la relazione «in-ground».
 */
export const QUOTA_BORDO_DESCRIPTIONS: Record<Exclude<QuotaBordoPiscina, "a_filo_terreno">, string> = {
  leggermente_rialzata: "coping raised slightly above the surrounding ground (about 10-20 cm), with a short visible side band below it",
  semi_incassata: "basin partly sunk: a raised wall about 40-70 cm high shows on the exposed sides, topped by the coping",
  fuori_terra: "basin standing fully above ground on a level base, walls rising about 1-1.3 m to the coping",
};

/** Pareti di una vasca rialzata (finiture.rivestimento_esterno): si dice solo se la vasca è rialzata. */
export const EXTERIOR_CLADDING_DESCRIPTIONS: Record<RivestimentoEsternoPiscina, string> = {
  doghe_legno_wpc: "wood-look WPC boards cladding the raised basin walls horizontally up to the coping",
  pietra_naturale: "natural stone cladding on the raised basin walls, split-face stones with tight joints up to the coping",
  gres_effetto_pietra: "large stone-look porcelain panels cladding the raised basin walls with thin aligned joints",
  intonaco_liscio: "smooth rendered raised basin walls with no visible joints, finished by the coping on top",
};

/** Cosa va al posto della piscina tolta (finiture.superficie_ripristino, solo rimozione). */
export const RESTORED_SURFACE_DESCRIPTIONS: Record<SuperficieRipristinoPiscina, string> = {
  prato_raccordato: "continuous lawn over the former pool area, level with the surrounding grass, with no outline, dip or colour change where the basin was",
  deck_wpc: "WPC wood-look deck over the former pool area, boards aligned to the perspective and flush with the surrounding ground",
  solarium_gres: "outdoor porcelain paving over the former pool area, slabs and joints continuing the surrounding layout",
  pietra_naturale: "natural stone paving over the former pool area, continuing the surrounding levels",
  ghiaia_drenante: "draining gravel bed over the former pool area with a clean containment edge",
};

/** Una misura valida in metri (numero o stringa numerica nell'intervallo), altrimenti null. */
function misura(value: unknown, limiti: { min: number; max: number }): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n >= limiti.min && n <= limiti.max ? Math.round(n * 10) / 10 : null;
}

/**
 * Misure reali della vasca (piscina.lunghezza_m / larghezza_m). La maggiore è la lunghezza,
 * qualunque campo l'abbia. Null se nessuna misura valida: il prompt resta quello di sempre.
 */
export function misureReali(lunghezza: unknown, larghezza: unknown): { lunghezza: number | null; larghezza: number | null } | null {
  const l = misura(lunghezza, MISURE_PISCINA_METRI.lunghezza);
  const w = misura(larghezza, MISURE_PISCINA_METRI.larghezza);
  if (l === null && w === null) return null;
  if (l !== null && w !== null && w > l) return { lunghezza: w, larghezza: l };
  return { lunghezza: l, larghezza: w };
}

const metri = (n: number) => String(n);

/** «about 8 x 4 m»: forma corta per la geometria. */
export function describeRealSizeShort(m: { lunghezza: number | null; larghezza: number | null }): string {
  if (m.lunghezza !== null && m.larghezza !== null) return `real size about ${metri(m.lunghezza)} x ${metri(m.larghezza)} m`;
  return m.lunghezza !== null ? `real length about ${metri(m.lunghezza)} m` : `real width about ${metri(m.larghezza as number)} m`;
}

/** Forma lunga, per l'impronta: come misurarla nella foto e che vince sulla classe apparente. */
export function describeRealSize(m: { lunghezza: number | null; larghezza: number | null }): string {
  return `${describeRealSizeShort(m)} inside the coping, overriding the apparent size class: scale it against visible references (a door is about 2.1 m high, a step about 17 cm, a garden chair about 80 cm) and never stretch it to fill the space`;
}

/** Colore dell'acqua impossibile su quel rivestimento: vince il rivestimento (piscineCoerenza.ts). */
export function describeFinishWaterConflict(finish: string, water: string): string {
  return `the selected water look (${water.replace(/_/g, " ")}) cannot appear over this interior finish (${finish.replace(/_/g, " ")}): the finish wins, render the water exactly as it really looks over this finish and ignore the conflicting tone`;
}

/**
 * Elementi che l'operazione NON cambia (piscineOperationScope.ts): si conservano come
 * sono in foto. Prima il prompt descriveva il valore di default del form come obiettivo.
 */
export const KEEP_EXISTING = {
  typology: "existing pool, unchanged",
  geometry: "keep the existing pool exactly as photographed: same outline, size, depth, position, steps and edge; this operation does not rebuild the basin",
  installation: "existing installation, unchanged",
  waterSystem: "existing edge system, unchanged",
  waterSystemRules: "keep the existing waterline, edge and overflow behavior exactly as photographed",
  interiorFinish: "existing interior finish, unchanged",
  interiorFinishRules: "keep the existing interior finish exactly as photographed",
  waterLook: "keep the existing water colour and transparency exactly as photographed",
  access: "Preserve existing access features exactly; do not add or modify ladders, steps, beach shelf or lounge shelf.",
  accessories: "no extra water features, spa, shower, cover, lighting or resort furniture in this operation scope",
  lighting: "Preserve existing lighting exactly; do not add pool lights in this operation scope.",
  coping: "keep the existing coping exactly as photographed",
  surroundings: "keep the existing surroundings exactly as photographed",
  surroundingsCopingJunction: "keep the existing surroundings; rebuild only the narrow strip that meets the new coping, with a crisp buildable junction",
  footprint: "existing pool footprint exactly as photographed: same outline, size, position and orientation, no resize and no move",
  size: "existing pool size, unchanged",
  depth: "existing apparent depth, unchanged",
  groundPlane: "keep the existing relation between pool, coping and ground exactly as photographed",
  infinity: "existing edge system unchanged",
  waterRealismSystem: "existing pool: keep the waterline, edge and overflow behavior exactly as photographed",
  waterRealismAccess: "preserve existing access geometry exactly; do not add or modify steps, ladders, beach shelf or lounge shelf in this operation scope",
} as const;

/** Rimozione: nessun elemento della vasca resta, nessun testo lo descrive come da costruire. */
export const REMOVED_POOL = {
  typology: "none - the existing pool is removed",
  geometry: "no pool remains: the former basin area becomes ground, as described in the manifest",
  installation: "not applicable",
  scale: "the restored ground continues the surrounding levels, materials and perspective",
  waterSystem: "none - the pool is removed",
  waterSystemRules: "no water, waterline, skimmer or overflow channel may remain",
  interiorFinish: "none - removed with the pool",
  interiorFinishRules: "no lining, tile or water may remain",
  waterLook: "no water remains",
  waterNote: "No water plane, reflection or caustic of the removed pool may remain.",
  access: "Remove pool access features with the pool and restore the ground/hardscape coherently.",
  coping: "removed together with the pool",
  footprint: "the existing pool to remove, exactly where it is photographed",
  size: "the area of the removed pool, unchanged in size",
  depth: "not applicable: the basin is filled to the surrounding ground level",
  groundPlane: "the former basin is filled to the surrounding ground level: no step, dip, edge band or excavation scar",
  infinity: "not applicable",
  copingRules: [
    "no coping, edge band, skimmer or deck scar of the old pool may remain",
    "restored ground/paving junctions must be crisp and follow the surrounding perspective",
    "cut lines, joints, slab/plank direction and grass cuts must follow perspective",
    "restored surfaces must not randomly expand into non-target garden areas",
  ],
  waterRealism: [
    "no water may remain: no reflections, caustics, blue patch or waterline of the removed pool",
    "the restored ground takes the light, shadows and perspective of the surrounding garden",
  ],
} as const;
