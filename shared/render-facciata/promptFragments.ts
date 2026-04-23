import type {
  FacciataZoneId,
  FinituraIntonaco,
  PosaRivestimento,
  SistemaCappotto,
  TipoInterventoFacciata,
  TipoRivestimento,
} from "./types.ts";

export const INTERVENTION_DESCRIPTIONS: Record<TipoInterventoFacciata, string> = {
  tinteggiatura: "light renovation focused on paint and superficial finish renewal",
  cappotto: "thermal insulation intervention with external facade depth adaptation",
  rivestimento: "material cladding intervention on selected facade zones",
  misto: "mixed intervention combining finishes, materials and selected architectural detailing",
  rifacimento_totale: "full facade renovation with coordinated material and detail renewal",
};

export const FINISH_DESCRIPTIONS: Record<FinituraIntonaco, string> = {
  liscio:
    "smooth troweled plaster, flat and continuous with subtle hand-finished nuance, matte and architectural, without added relief",
  graffiato_fine:
    "fine scratched plaster with delicate linear grain, controlled micro-grooves and a refined mineral texture",
  graffiato_medio:
    "medium scratched plaster with clearly legible grooves and a stronger tactile grain under raking light",
  rasato:
    "skim-coated rasato finish, extra smooth and contemporary, visually clean but still mineral and believable",
  bucciato:
    "orange-peel / bucciato finish with uniform stippled texture and diffuse light scattering",
  strutturato_grosso:
    "heavy structured plaster with coarse aggregate and deeper shadow pockets, clearly textured but still buildable",
  rustico:
    "rustic rough-cast plaster with irregular mineral texture and traditional handcrafted character",
  veneziana:
    "veneziana polished plaster with layered depth, subtle marbling and controlled sheen",
  bugnato:
    "bugnato rusticated treatment with raised ashlar-like geometry and crisp recessed joints",
};

export const CLADDING_DESCRIPTIONS: Record<TipoRivestimento, string> = {
  pietra_serena:
    "Pietra Serena stone cladding with cool grey sandstone character, fine natural grain and regular slab coursing",
  travertino:
    "travertine cladding with warm beige limestone, believable pores, veining and refined architectural slabs",
  arenaria_beige:
    "beige sandstone cladding with sedimentary layering and warm sandy chromatic variation",
  luserna:
    "Luserna stone cladding with split metamorphic texture, mica reflections and robust mountain-stone character",
  marmo_bianco:
    "white marble cladding with subtle veining, crisp edges and premium but believable exterior stone finish",
  porfido:
    "porphyry cladding with volcanic grain, irregular crystalline texture and earthy brown-grey tonal shifts",
  splitface_grigio:
    "grey split-face stone with strong relief, layered depth and pronounced shadow lines",
  pietra_rustica:
    "rustic natural stone with irregular module sizes, tactile roughness and traditional masonry character",
  cotto_rosso:
    "red terracotta brick cladding with warm kiln-fired variation and authentic Italian cotto character",
  clinker_rosso:
    "red clinker facing with dense ceramic finish, precise edges and controlled contemporary brick coursing",
  clinker_grigio:
    "grey clinker facing with cool anthracite tone, tight joints and modern architectural reading",
  clinker_beige:
    "beige clinker facing with warm sand tone, precise geometry and elegant contemporary brick texture",
  cotto_mattone:
    "brick-toned cotto cladding with warm earthy materiality and visible firing variation",
  laterizio_bianco:
    "light laterizio cladding with pale ceramic tone, visible joint rhythm and crisp masonry logic",
};

export const CLADDING_PATTERN_DESCRIPTIONS: Record<PosaRivestimento, string> = {
  corsi_regolari: "regular horizontal courses with aligned and buildable joint logic",
  corsi_sfalsati: "staggered coursing with offset joints and realistic masonry rhythm",
  listelli_orizzontali: "elongated horizontal strip layout with clean continuous banding",
  opus_incertum: "irregular opus incertum composition with believable manual placement and coherent joint density",
};

export const INSULATION_SYSTEM_DESCRIPTIONS: Record<SistemaCappotto, string> = {
  eps: "ETICS thermal insulation with EPS boards and reinforced exterior render finish",
  lana_roccia: "ETICS thermal insulation with mineral wool boards and reinforced render finish",
  fibra_legno: "ETICS thermal insulation with wood fiber boards and reinforced breathable render finish",
};

export const ZONE_LABELS: Record<FacciataZoneId, string> = {
  tutta: "entire facade",
  piano_terra: "ground floor",
  piani_superiori: "upper floors",
  zoccolatura: "base course / plinth zone",
  fasce_orizzontali: "horizontal bands",
  cantonali: "corner bands / quoin zones",
  marcapiano: "string course bands",
  cornici_finestre: "window cornices",
  davanzali: "window sills",
  gronde: "gutters and eaves line",
  balconi_ringhiere: "balcony railings",
};

export const DEFAULT_NEGATIVE_CONSTRAINTS = [
  "do not redesign the building",
  "do not change window sizes or move openings",
  "do not invent balconies, decorative reliefs or fake luxury features",
  "do not alter untouched facade zones",
  "do not change sky, weather, vegetation, neighboring buildings, cars or people",
  "do not stylize the image",
  "do not create fake CGI smoothness or smudged transitions",
  "do not modify shutters or frames unless explicitly requested",
  "do not leave hybrid old/new architectural states",
];

export const DEFAULT_QUALITY_DIRECTIVES = [
  "professional facade renovation visualization",
  "same-building realism with photographic credibility",
  "precise interpretation of the selected intervention",
  "clean construction logic at every edge, reveal and junction",
];
