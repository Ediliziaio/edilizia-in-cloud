import type {
  MaterialeStrutturaPergola,
  StatoCoperturaPergola,
  TipoChiusuraLaterale,
  TipoCoperturaPergola,
  TipoIlluminazionePergola,
  TipoPergola,
} from "./types.ts";

export const PERGOLA_TYPE_DESCRIPTIONS: Record<TipoPergola, string> = {
  addossata: "wall-mounted pergola attached to the facade with a clear rear beam/ledger and front support posts",
  autoportante: "freestanding pergola with independent post-and-beam structure, no wall dependency",
  bioclimatica_addossata: "wall-mounted bioclimatic pergola with technical aluminum frame and orientable roof louvers",
  bioclimatica_autoportante: "freestanding bioclimatic pergola with independent aluminum frame and orientable roof louvers",
  telo_addossata: "wall-mounted pergola with retractable technical fabric canopy and visible tension/track logic",
  telo_autoportante: "freestanding pergola with retractable technical fabric canopy and independent posts",
  vetro_addossata: "wall-mounted glass-roof pergola with transparent roof panels, structural profiles and drainage edges",
  vetro_autoportante: "freestanding glass-roof pergola with transparent roof panels and independent structural supports",
  legno_addossata: "wall-mounted timber or laminated-wood pergola with warm structural beams and realistic carpentry joints",
  legno_autoportante: "freestanding timber or laminated-wood pergola with robust posts, beams and realistic outdoor joinery",
};

export const MATERIAL_DESCRIPTIONS: Record<MaterialeStrutturaPergola, string> = {
  alluminio: "powder-coated aluminum profiles, crisp edges, slim technical sections and modern outdoor durability",
  alluminio_effetto_legno: "powder-coated aluminum with credible wood-effect finish, visible grain direction but crisp metal profile geometry",
  legno_lamellare: "laminated timber with believable grain, warm tone, structural beams and realistic outdoor protective finish",
  acciaio: "painted steel structure with slightly heavier sections, crisp welded/bolted details and durable outdoor coating",
  misto: "mixed aluminum/wood structure with coherent material junctions and no random hybrid detailing",
};

export const COVER_DESCRIPTIONS: Record<TipoCoperturaPergola, string> = {
  lamelle_orientabili: "bioclimatic orientable aluminum louvers, repeated blades in a precise roof grid, integrated perimeter frame",
  telo_retraibile: "retractable technical fabric cover with visible textile tension, tracks and collection logic",
  vetro: "glass roof panels with transparent/reflection behavior, structural rafters and realistic seals",
  policarbonato: "polycarbonate roof panels with translucent light diffusion, panel ribs and realistic edge seals",
  listelli_legno: "slatted timber sunshade roof with repeated battens, partial shade and visible gaps",
  copertura_opaca_tecnica: "technical opaque insulated cover with clean planar panels, edge trims and drainage logic",
};

export const COVER_STATE_RULES: Record<StatoCoperturaPergola, string> = {
  chiusa: "roof cover closed; shade/water protection visually active and continuous",
  semi_aperta: "roof cover partially open with clear intermediate state and realistic light stripes",
  aperta: "roof cover open enough to reveal the sky/light path through the structure",
  lamelle_15: "louvers tilted about 15 degrees, almost closed but with narrow light gaps",
  lamelle_30: "louvers tilted about 30 degrees with clear directional light filtering",
  lamelle_45: "louvers tilted about 45 degrees, visibly bioclimatic and semi-open",
  lamelle_90: "louvers vertical/open at about 90 degrees, roof visibly open between blades",
  telo_raccolto: "fabric canopy retracted and collected at one side/box, leaving roof mostly open",
  telo_disteso: "fabric canopy fully extended and tensioned, textile surface continuous and credible",
};

export const SIDE_CLOSURE_DESCRIPTIONS: Record<TipoChiusuraLaterale, string> = {
  nessuna: "no side closures; perimeter stays open and airy",
  vetrata_slide: "sliding glass side panels with transparent reflections, slim tracks and realistic overlap",
  screen_zip: "technical ZIP screens in side tracks, taut textile screen surface, not decorative curtains",
  tenda_tecnica: "technical side curtains with outdoor fabric, controlled folds and track/guide logic",
  frangivento: "windbreak panels with transparent or translucent outdoor barrier behavior",
  pannelli_fissi: "fixed side panels attached to posts with coherent frame and anchoring",
  brise_soleil: "architectural brise-soleil side blades with repeated lamellas and structural supports",
};

export const LIGHTING_DESCRIPTIONS: Record<TipoIlluminazionePergola, string> = {
  nessuna: "no added lighting fixtures",
  strip_led_perimetrale: "warm-white integrated LED strip along inner perimeter profiles, subtle realistic glow",
  spot_integrati: "small recessed spotlights integrated into beams or roof frame, evenly spaced and buildable",
  downlight_lineari: "linear downlights integrated into structural beams with clean modern light distribution",
  applique_coordinate: "coordinated wall or post-mounted outdoor applique lights, sparse and realistic",
};

export const DEFAULT_INTEGRITY_CONSTRAINTS = [
  "preserve the same house, facade, doors, windows and shutters unless explicitly targeted",
  "preserve paving outside the pergola footprint",
  "preserve garden, pool, parapets, railings, walls, fences and neighboring buildings",
  "preserve outdoor furniture unless the user explicitly requests sparse furniture additions or declutter",
  "preserve sky, weather, camera angle, perspective, crop, image dimensions and orientation",
];

export const DEFAULT_QUALITY_DIRECTIVES = [
  "professional pergola sales visualization",
  "same-property realism",
  "technically plausible installation",
  "clear selected pergola type, cover system, side closures and finish",
  "materials, shadows, reflections and contact occlusion must look photographic",
];

export const DEFAULT_NEGATIVE_CONSTRAINTS = [
  "do not redesign the house",
  "do not move windows or doors",
  "do not change the facade unless explicitly requested by replacement cleanup",
  "do not alter non-target paving, garden, pool, parapets or neighboring buildings",
  "do not add unrelated outdoor structures",
  "do not invent luxury furniture, plants, pools or decor not requested",
  "do not create impossible spans, floating posts, blocked doors or structural collisions",
  "do not leave traces of removed awnings, cassettes, brackets or old pergola parts",
  "do not generate a different property or generic outdoor catalog scene",
];
