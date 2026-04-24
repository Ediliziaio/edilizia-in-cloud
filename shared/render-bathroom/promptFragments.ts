import type {
  BathroomBathtubType,
  BathroomFaucetFinish,
  BathroomFaucetStyle,
  BathroomFlushPlateStyle,
  BathroomMirrorType,
  BathroomSanitaryColor,
  BathroomShowerGlassType,
  BathroomShowerHeadType,
  BathroomShowerProfileFinish,
  BathroomShowerTrayType,
  BathroomShowerType,
  BathroomVanityStyle,
} from "./types.ts";

export const TILE_EFFECT_DESCRIPTIONS: Record<string, string> = {
  marmo_carrara:
    "Carrara marble — white to light grey base with fine grey veining, polished luxury surface, subtle depth and natural slab movement",
  marmo_calacatta:
    "Calacatta marble — warm white base with bold gold-grey veining, premium statement look, polished reflective surface",
  marmo_sahara_noir:
    "Sahara Noir marble — deep black polished marble with dramatic amber-gold veining and luxurious contrast",
  marmo_marquinia:
    "Nero Marquinia marble — deep black polished stone with crisp white veining and mirror-like highlights",
  marmo_verde_guatemala:
    "Verde Guatemala marble — saturated deep emerald stone with bright natural veining and rich polished depth",
  marmo_statuario:
    "Statuario marble — bright white slab with broad grey veining, highly luminous and high-end",
  marmo_emperador:
    "Emperador marble — rich warm brown marble with cream veining and classic Mediterranean elegance",
  cemento_grigio:
    "grey cement-effect porcelain, matte and contemporary, with subtle tonal movement",
  cemento_bianco:
    "white cement-effect porcelain, soft matte and luminous with minimal industrial texture",
  cemento_antracite:
    "anthracite cement-effect porcelain, dark matte minimal look with dense modern character",
  legno_rovere_chiaro:
    "light oak wood effect with warm honey tone and realistic linear grain",
  legno_rovere_scuro:
    "dark oak wood effect with rich warm grain and deeper contrast",
  legno_wenge:
    "wenge wood effect, dense dark grain and sophisticated deep tone",
  ardesia:
    "slate stone effect with layered dark texture and subtle geological relief",
  travertino:
    "travertine stone effect, warm beige limestone with soft movement and refined pore structure",
  basalto:
    "basalt stone effect, compact volcanic dark stone look with very fine grain",
  mono_bianco:
    "solid monochrome white finish, clean and timeless",
  mono_nero:
    "solid monochrome black finish, deep and graphic",
  mono_grigio:
    "solid monochrome grey finish, neutral and modern",
  mono_verde_salvia:
    "solid sage-green finish, calm spa-like premium feeling",
  mono_blu_navy:
    "solid navy-blue finish, dramatic and elegant",
  mono_terracotta:
    "solid terracotta finish, warm Mediterranean character",
  mono_greige:
    "solid greige finish, refined warm neutral",
  mosaico_esagoni:
    "hexagonal mosaic with visible geometric grout grid and decorative rhythm",
  mosaico_penny:
    "penny mosaic with small round modules and clear grout rhythm",
  zellige:
    "handmade zellige ceramic with glossy irregular artisanal surface and nuanced color variation",
  cotto_toscano:
    "Tuscan cotto effect with warm earthy handcrafted tone",
  resina_spatolata:
    "continuous troweled resin surface with no visible joints and subtle handcrafted movement",
  pietra_ardesia:
    "split-face slate wall texture with strong depth and relief",
};

export const POSA_DESCRIPTIONS: Record<string, string> = {
  dritta: "straight aligned grid layout",
  sfalsata: "running bond / offset layout",
  diagonale: "45-degree diagonal layout",
  spina_pesce: "herringbone layout",
  spina_ungherese: "Hungarian herringbone layout",
  chevron: "chevron layout",
  casuale: "mixed irregular layout",
};

export const INTERVENTION_DESCRIPTIONS: Record<string, string> = {
  restyling_piastrelle: "Light restyling focused on surfaces and finish updates.",
  restyling_completo: "Complete restyling of the same bathroom without changing the overall room identity.",
  demolizione_parziale: "Partial demolition and replacement of selected zones only.",
  demolizione_completa: "Full demolition and rebuild while still preserving the same photographed bathroom shell.",
};

export const SHOWER_TYPE_LABELS: Record<BathroomShowerType, string> = {
  walk_in: "walk-in shower",
  nicchia_box: "niche shower enclosure",
  frontale_box: "frontal shower enclosure",
  angolare: "corner shower enclosure",
  semicircolare: "semicircular corner enclosure",
};

export const SHOWER_TYPE_DESCRIPTIONS: Record<BathroomShowerType, string> = {
  walk_in:
    "walk-in shower with a clearly open entry, fixed glass panel, no generic closed box feeling, and a premium minimal architectural presence",
  nicchia_box:
    "niche shower enclosure fitted between walls, with a real niche geometry and coherent door enclosure",
  frontale_box:
    "frontal shower box with a front-facing glazed enclosure, coherent as a true front access shower rather than a generic corner box",
  angolare:
    "corner shower enclosure with clear 90-degree geometry and believable corner occupancy",
  semicircolare:
    "semicircular corner shower enclosure with curved front geometry and a realistic curved base",
};

export const SHOWER_GLASS_DESCRIPTIONS: Record<BathroomShowerGlassType, string> = {
  trasparente: "clear transparent tempered glass",
  satinato: "satin / frosted tempered glass",
  fume: "smoke-tinted tempered glass",
  serigrafato: "screen-printed decorative glass",
};

export const SHOWER_PROFILE_DESCRIPTIONS: Record<BathroomShowerProfileFinish, string> = {
  cromato: "polished chrome profile",
  nero_opaco: "matte black profile",
  oro_spazzolato: "brushed warm-gold profile",
  senza_profilo: "frameless or near-frameless minimal glass edge",
};

export const SHOWER_TRAY_DESCRIPTIONS: Record<BathroomShowerTrayType, string> = {
  filo_pavimento: "flush-to-floor shower base with near seamless floor continuity",
  rialzato_3cm: "low-profile raised tray around 3 cm",
  rialzato_5cm: "raised tray around 5 cm with a more visible edge",
  pietra: "stone or stone-effect shower tray with premium tactile feel",
};

export const SHOWER_HEAD_DESCRIPTIONS: Record<BathroomShowerHeadType, string> = {
  a_parete: "wall-mounted shower head with matching hand shower",
  pioggia_soffitto: "ceiling-mounted rain shower head with premium spa feel",
  colonna_completa: "full exposed shower column with rain head and hand shower",
  combinato: "combined rain shower and hand shower system",
};

export const BATHTUB_TYPE_DESCRIPTIONS: Record<BathroomBathtubType, string> = {
  freestanding_ovale:
    "oval freestanding bathtub, clearly detached from surrounding walls and visually recognizable as freestanding",
  freestanding_rettangolare:
    "rectangular freestanding bathtub, clearly detached from surrounding walls and visually recognizable as freestanding",
  back_to_wall:
    "back-to-wall bathtub, clean modern tub visually grounded against the wall while remaining distinct from a built-in tub",
  incassata:
    "built-in bathtub integrated into the existing bathroom geometry with coherent ledge or apron",
  angolare:
    "corner bathtub inserted coherently into the room corner geometry",
};

export const BATHTUB_MATERIAL_DESCRIPTIONS: Record<string, string> = {
  acrilico_bianco: "white acrylic bathtub with realistic smooth glossy finish",
  solid_surface: "solid surface bathtub with refined matte premium body",
  ghisa_smaltata: "enameled cast-iron bathtub with weight and gloss",
  pietra: "stone or stone-effect bathtub with premium sculptural presence",
};

export const BATHTUB_FAUCET_DESCRIPTIONS: Record<string, string> = {
  a_parete: "wall-mounted bathtub mixer",
  a_pavimento: "floor-mounted bathtub mixer",
  bordo_vasca: "deck-mounted bathtub mixer",
};

export const VANITY_STYLE_DESCRIPTIONS: Record<BathroomVanityStyle, string> = {
  sospeso_moderno: "wall-hung modern vanity",
  sospeso_minimal: "wall-hung minimal vanity",
  a_terra_classico: "floor-standing classic vanity",
  a_terra_industrial: "floor-standing industrial vanity",
};

export const VANITY_MIRROR_DESCRIPTIONS: Record<BathroomMirrorType, string> = {
  retroilluminato: "backlit mirror",
  specchiera_contenitore: "mirrored storage cabinet",
  tondo: "round mirror",
  verticale: "vertical full-height mirror",
};

export const BASIN_DESCRIPTIONS: Record<string, string> = {
  integrato: "integrated basin",
  appoggio_ovale: "oval countertop basin",
  appoggio_rettangolare: "rectangular countertop basin",
  semincasso: "semi-recessed basin",
};

export const VANITY_TOP_DESCRIPTIONS: Record<string, string> = {
  marmo_bianco: "white marble top with natural veining",
  marmo_nero: "black marble top with strong contrast veining",
  quarzo: "engineered quartz top, compact and uniform",
  legno: "sealed wood top with warm grain",
  ceramica: "ceramic top, smooth and practical",
};

export const SANITARY_TYPE_DESCRIPTIONS: Record<string, string> = {
  sospeso: "wall-hung sanitary ware",
  rimless_sospeso: "wall-hung rimless sanitary ware",
  a_terra: "floor-standing sanitary ware",
  back_to_wall: "back-to-wall sanitary ware",
};

export const SANITARY_COLOR_DESCRIPTIONS: Record<BathroomSanitaryColor, string> = {
  bianco: "white ceramic finish",
  grigio_chiaro: "light-grey ceramic finish",
  nero_opaco: "matte black ceramic finish",
};

export const FLUSH_PLATE_DESCRIPTIONS: Record<BathroomFlushPlateStyle, string> = {
  rettangolare_sottile:
    "slim rectangular wall flush plate, minimal and architectural, aligned above the WC",
  vetro_minimal:
    "minimal glass-look wall flush plate with crisp rectangular geometry and low visual bulk",
  tonda_soft:
    "soft rounded dual-flush wall plate, compact and contemporary rather than old-fashioned",
};

export const FAUCET_FINISH_DESCRIPTIONS: Record<BathroomFaucetFinish, string> = {
  cromo: "polished chrome finish",
  nero_opaco: "matte black finish",
  oro_spazzolato: "brushed warm-gold finish",
  oro_rosa: "rose-gold satin metallic finish",
  acciaio_spazzolato: "brushed stainless-steel finish",
};

export const FAUCET_STYLE_DESCRIPTIONS: Record<BathroomFaucetStyle, string> = {
  quadro_moderno: "modern squared faucet language",
  tondo_classico: "rounded contemporary-classic faucet language",
  industrial: "industrial technical faucet language",
  vintage_crosshead: "vintage crosshead faucet language",
};

export const DEFAULT_NEGATIVE_CONSTRAINTS = [
  "do not redesign the whole bathroom unless explicitly requested",
  "do not move non-target fixtures",
  "do not alter perspective",
  "do not change room size",
  "do not stylize or beautify into a fantasy spa unrelated to the source photo",
  "do not keep removed fixtures partially visible",
  "do not mix incompatible shower and bathtub states unless explicitly requested",
  "do not alter surfaces that were not selected for replacement",
  "do not change image dimensions or orientation",
  "do not render 120x240 slabs as a 60x60 or dense medium-tile grid",
  "do not render a freestanding bathtub as a tiny bowl, mini tub or undersized decorative object",
];

export const DEFAULT_QUALITY_DIRECTIVES = [
  "Professional architectural renovation render quality bar.",
  "Interior photography-grade output, not CGI-looking showroom imagery.",
  "Exact interpretation of the selected fixture type and finish.",
  "Physically plausible materials, shadows, reflections, joins and installation details.",
];
