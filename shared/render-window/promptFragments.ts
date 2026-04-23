import type { WindowOpeningType } from "./types.ts";

export const MATERIAL_PHYSICS: Record<string, string> = {
  pvc: "high-quality PVC frame with smooth matte surface, subtle extrusion micro-texture, crisp welded corners and realistic gasket lines",
  alluminio: "extruded aluminum frame with powder-coated or anodized surface, sharp edges, thin architectural sightlines and realistic thermal-break construction",
  legno: "solid timber frame with visible longitudinal grain, slightly softened milled edges and believable painted or stained wood behavior",
  legno_alluminio: "timber-aluminum hybrid frame with warm wood on the interior-facing side and slim powder-coated aluminum cladding on the exterior-facing side",
  acciaio_corten: "Corten steel frame with natural weathered rust patina, ultra-thin architectural sightlines and real steel depth",
  acciaio_minimale: "minimal structural steel frame with ultra-thin black sightlines, crisp geometry and premium industrial detailing",
};

export const APERTURA_DESCRIPTION: Record<WindowOpeningType, string> = {
  battente_1_anta: "single-leaf casement window with one operable sash",
  battente_2_ante: "double-leaf casement window with two operable sashes",
  battente_3_ante: "triple-leaf casement composition with three sashes",
  scorrevole: "horizontal sliding system with no visible side hinges",
  scorrevole_alzante: "lift-and-slide system with large glazed panels and recessed tracks",
  vasistas: "top-hung tilt window opening inward from the bottom",
  anta_ribalta: "tilt-and-turn window system with European multipoint hardware",
  bilico: "pivot opening rotating on a central axis",
  fisso: "fixed light with no handle and no visible opening hardware",
  portafinestra: "full-height French door / balcony door opening",
};

export const FRAME_STYLE_DESCRIPTION: Record<string, string> = {
  nodo_ridotto: "reduced-node profile with thinner visual frame and wider apparent glass area",
  nodo_ridotto_maniglia_centrale: "reduced-node profile with the handle positioned at the visual center of the main sash",
  minimal_squadrato: "minimal squared profile with extremely slim sightlines and crisp 90-degree edges",
  classico_arrotondato: "classic rounded frame profile with slightly softer visible edges",
  europeo_classico: "balanced European renovation profile with residential proportions",
};

export const HANDLE_STYLE_DESCRIPTION: Record<string, string> = {
  classica_dritta: "straight architectural lever handle with clean residential proportions",
  toulon: "curved ergonomic lever handle with softer premium silhouette",
  q_moderna: "square modern handle with minimal rectilinear profile",
  con_rosetta: "lever handle with visible rosette/backplate detail",
  pomolo: "compact knob/pull hardware",
  alzante: "lift-and-slide handle with deeper grip and heavier mechanism body",
  nessuna: "no visible handle because the target opening is fixed",
};

export const HANDLE_FINISH_DESCRIPTION: Record<string, string> = {
  cromo_lucido: "polished chrome finish with bright controlled highlights",
  inox_spazzolato: "brushed stainless steel finish with directional satin reflections",
  nero_opaco: "matte black finish with soft low-specular reflections",
  bronzo_anticato: "antique bronze finish with warm oxidized tone",
  oro_pvd: "polished gold finish with premium warm metallic reflection",
  titanio: "titanium anodized finish with cool refined metallic depth",
};

export const CASSONETTO_DESCRIPTION: Record<string, string> = {
  pvc_tradizionale: "traditional PVC roller box with residential proportions above the opening",
  pvc_slim: "slimmer PVC roller box with reduced visible height",
  pvc_integrato: "integrated roller box recessed into the wall, with only the access strip subtly visible",
  alluminio_coibentato: "insulated aluminum roller box with crisp machined edges and coated finish",
  mantieni: "existing roller box retained exactly as in the source photo",
};

export const SHUTTER_DESCRIPTION: Record<string, string> = {
  pvc_avvolgibile: "PVC roller shutter with realistic interlocking slats and guide channels",
  alluminio_avvolgibile: "aluminum roller shutter with crisp slat geometry and premium coating",
  microforata: "microperforated roller shutter with visible perforation pattern allowing light through",
  persiana_alluminio: "aluminum louvered shutter system with articulated slats",
  veneziana_integrata: "integrated blind between glass panes with very fine horizontal slat lines",
  mantieni: "existing shading system retained exactly as photographed",
};

export const DEFAULT_QUALITY_DIRECTIVES = [
  "Professional architectural photorealistic replacement render quality bar.",
  "The edited image must look like the same real photograph after a real installation, not a redesigned AI room.",
  "All joins between frame and wall must be believable, clean and installable in reality.",
  "Glazing reflections, gaskets, shadow casting and ambient occlusion must be physically plausible.",
  "No warped geometry, no floating elements, no showroom staging, no generic beauty-pass restyling.",
];

export const DEFAULT_NEGATIVE_CONSTRAINTS = [
  "do not redesign the room",
  "do not move furniture",
  "do not alter perspective or crop",
  "do not repaint walls unless explicitly required by a replacement rule",
  "do not change the floor",
  "do not invent extra windows or doors",
  "do not alter non-target openings",
  "do not produce generic AI interior restyling",
  "do not stylize",
  "do not beautify beyond photographic realism",
  "do not leave any manual belt, belt slot or wall winder visible if a motorized shutter is selected",
  "do not render mixed hinge colors or inconsistent hinge shapes",
  "do not oversize the cassonetto compared to the original visible envelope",
  "do not render a floating colored shutter band above the glazing when the shutter should be fully open and hidden",
];
