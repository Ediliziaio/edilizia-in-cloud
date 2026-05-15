// shared/render-window/promptFragments.ts — v8 (2026-05-14)
// CHANGELOG v8:
//   ↺ MATERIAL_PHYSICS: descrizioni con spessori numerici precisi (PVC 80mm vs ALU 55mm)
//   ↺ FRAME_STYLE_DESCRIPTION: dimensioni anatomiche esplicite per ogni stile
//   + Nuovo "alluminio_slim" come variante minimal premium
//   ↺ DEFAULT_NEGATIVE_CONSTRAINTS: aggiunte clausole su mullion ridotto, hidden hinges
//   + HIDDEN_HINGE_DESCRIPTION + ELECTRIC_BUTTON_DESCRIPTION + TRANSOM_DESCRIPTION

import type { WindowOpeningType } from "./types.ts";

// ─────────────────────────────────────────────────────────────────────────────
// MATERIALI: spessori dimensionali precisi per disambiguare il sightline
// ─────────────────────────────────────────────────────────────────────────────

export const MATERIAL_PHYSICS: Record<string, string> = {
  pvc:
    "high-quality PVC frame, 70-80mm visible outer width, 100-110mm central mullion " +
    "between sashes, smooth matte surface with subtle extrusion micro-texture, " +
    "crisp welded corners, realistic gasket lines. Residential renovation proportions.",
  alluminio:
    "extruded thermal-break aluminum frame, 50-60mm visible outer width, " +
    "60-70mm central mullion, slim architectural sightline, powder-coated " +
    "matte or satin surface, sharp 90-degree edges, visible thin dark thermal " +
    "break line at mid-depth. Glass surface dominant vs frame.",
  alluminio_slim:
    "premium slim aluminum architectural profile, 45-55mm visible outer width, " +
    "45-50mm central mullion (ULTRA-SLIM), thermal break visible as a thin (1-2mm) " +
    "dark horizontal stripe at mid-depth, glass-to-frame ratio at least 80% glass " +
    "surface area. Contemporary architect-grade window, NOT residential PVC chunky.",
  legno:
    "solid timber frame, 82-90mm outer width, slightly softened milled edges, " +
    "visible longitudinal grain, believable painted or stained wood behavior. " +
    "Slightly heavier proportions than PVC.",
  legno_alluminio:
    "timber-aluminum hybrid frame, 82mm outer width interior wood side, slim " +
    "powder-coated aluminum cladding on the exterior side. Wood grain visible " +
    "internally; clean coated finish externally.",
  acciaio_corten:
    "Corten steel frame with natural weathered rust patina, ultra-thin architectural " +
    "sightlines (30-40mm visible), real steel depth, visible welded corners.",
  acciaio_minimale:
    "minimal structural steel frame, ultra-thin black sightlines (25-35mm visible), " +
    "crisp geometry, premium industrial detailing.",
};

// ─────────────────────────────────────────────────────────────────────────────
// APERTURE: invariato (descrizioni tipologie già OK)
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// STILE TELAIO: descrizioni con misure NUMERICHE per forzare Gemini a vedere
// la differenza tra nodo ridotto, minimal, classico
// ─────────────────────────────────────────────────────────────────────────────

export const FRAME_STYLE_DESCRIPTION: Record<string, string> = {
  // ── v8.1 — NODO ASIMMETRICO (a.k.a. "nodo ridotto" in Italian) ──────
  nodo_asimmetrico:
    "ASYMMETRIC NODE composition (Italian: nodo ridotto / asimmetrico): " +
    "the two sashes are NOT equal width. " +
    "PRIMARY SASH (anta principale) closes against the SECONDARY SASH (anta secondaria) " +
    "via a flap-stile cover (Italian: palettone) attached to the secondary sash that " +
    "overlaps the primary sash by ~20mm. " +
    "Visual result: the central meeting line shows ONLY ONE visible vertical stile (~70mm total) " +
    "instead of two separate stiles (~110mm classic symmetric). " +
    "Glass surface is visibly increased. The primary sash is slightly wider than the secondary.",
  nodo_asimmetrico_maniglia_centrale:
    "ASYMMETRIC NODE with CENTRAL HANDLE composition (Italian: nodo ridotto con maniglia centrale): " +
    "same asymmetric layout as above (palettone + palettino, primary sash wider than secondary), " +
    "BUT the single window handle is mounted EXACTLY at the geometric vertical center of the palettone, " +
    "NOT on the primary sash stile. " +
    "Render EXACTLY ONE handle on the entire window, positioned on the central palettone. " +
    "Do NOT render two handles. Do NOT render a handle on either sash side stile. " +
    "Reference: 'infisso con maniglia centrale' — finestra a 2 ante con una sola maniglia centrale sul palettone.",
  nodo_simmetrico:
    "SYMMETRIC NODE composition (classico): two equal-width sashes meeting at a doubled " +
    "central vertical mullion (~110mm total visible: two stiles of ~55mm each side-by-side). " +
    "Traditional residential look. Each sash has its own handle. " +
    "Glass area is balanced left/right.",
  // ── v7/v8 legacy aliases (manteniamo per backward-compat con sessioni salvate) ──
  nodo_ridotto: "DEPRECATED ALIAS → use nodo_asimmetrico. " +
    "ASYMMETRIC NODE composition: primary sash (anta principale) + secondary sash (anta secondaria) " +
    "with palettone overlapping. Central meeting stile ~70mm visible (vs ~110mm classic). " +
    "Glass area visibly larger.",
  nodo_ridotto_maniglia_centrale: "DEPRECATED ALIAS → use nodo_asimmetrico_maniglia_centrale. " +
    "ASYMMETRIC NODE + CENTRAL HANDLE: ONE single handle mounted on the palettone at the geometric " +
    "center of the window. Do NOT render two handles.",
  // ── Profile-style descriptors (separati dal nodo!) ──────────────────
  minimal_squadrato:
    "minimal squared aluminum architectural profile (Italian: profilo alluminio minimal): " +
    "45-55mm visible outer frame, crisp 90-degree corners, no rounded chamfers, " +
    "thermal break visible as a subtle dark line at mid-depth. Glass-to-frame ratio at " +
    "least 80% glass surface area. Contemporary architect-grade window, NOT residential PVC.",
  alluminio_slim:
    "slim aluminum profile: 50-60mm outer frame, sharp 90-degree edges with visible thermal break " +
    "as a thin (1-2mm) dark stripe at mid-depth, powder-coated surface (matte or satin).",
  classico_arrotondato:
    "classic European casement profile: 80-90mm outer frame with slightly softened edges " +
    "(2-3mm chamfer). Residential wood-feel proportions.",
  europeo_classico:
    "European residential casement profile: 70-80mm outer frame, balanced sightline typical " +
    "of standard PVC renovation work.",
};

// ─────────────────────────────────────────────────────────────────────────────
// MANIGLIE: invariato (descrizioni stile/finitura OK)
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// CASSONETTI / TAPPARELLE: invariato
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// v8 NEW — CERNIERE A SCOMPARSA / VISIBILI
// ─────────────────────────────────────────────────────────────────────────────

export const HIDDEN_HINGE_DESCRIPTION =
  "Hidden hinges (cerniere a scomparsa): NO VISIBLE HINGES anywhere on the window. " +
  "All hinge mechanisms are completely concealed inside the frame profile when the sash " +
  "is closed. The sash appears to float against the frame with no visible hardware on " +
  "the hinged side stile. Premium architectural look. Do NOT render any traditional " +
  "European-style hinge knuckles, decorative caps, or hinge cylinders on the outside of " +
  "the frame. The hinge side stile is clean and continuous.";

export const VISIBLE_HINGE_DESCRIPTION_BASE =
  "Visible compact European-style hinges, aligned on the hinged side stile, with " +
  "consistent finish matching the handle hardware. Each hinge is a compact cylindrical " +
  "knuckle (~12-15mm diameter) with the cap/cover in the selected hardware finish.";

// ─────────────────────────────────────────────────────────────────────────────
// v8 NEW — BOTTONE ELETTRICO TAPPARELLA
// ─────────────────────────────────────────────────────────────────────────────

export const ELECTRIC_BUTTON_DESCRIPTION_BASE =
  "Electric roller-shutter switch plate: SMALL square wall-mounted recessed switch " +
  "approximately 80x80mm (Italian residential standard, Vimar/Bticino style), flush with " +
  "the wall surface. Front face shows TWO vertical rectangular rocker buttons side by side, " +
  "each with a small triangle pictogram: LEFT rocker has an UP triangle (▲), " +
  "RIGHT rocker has a DOWN triangle (▽). Matte white finish (RAL 9010) by default. " +
  "Centered at approximately 110cm from the floor on the same wall/reveal where the " +
  "old manual belt winder was previously mounted. " +
  "" +
  "CRITICAL SIZE/WALL-REPAIR RULE: the NEW electric switch plate is SIGNIFICANTLY " +
  "SMALLER than the OLD manual belt winder plate it replaces. The old winder plate " +
  "was typically a tall vertical box (~80x140mm or larger, plus the belt exit slot below). " +
  "The new electric switch is just an 80x80mm square. " +
  "This means there is a SIGNIFICANT WALL AREA that was covered by the old plate but is " +
  "NOT covered by the new plate. That area MUST be: " +
  "  (1) seamlessly plastered/stuccoed flush with the surrounding wall, " +
  "  (2) repainted with the EXACT same paint color and finish as the adjacent wall, " +
  "  (3) show NO visible patch, halo, edge, or shade difference. " +
  "The viewer must NOT be able to tell that something else was previously there. " +
  "" +
  "Style/color override rules: if the photographed room has other visible wall switches, " +
  "MATCH their brand-look (plate shape, plate frame style, button shape) for visual consistency.";

export function buildElectricButtonFragment(style: "bianco_standard" | "nero_opaco" | "match_room_switches"): string {
  switch (style) {
    case "nero_opaco":
      return (
        ELECTRIC_BUTTON_DESCRIPTION_BASE +
        " Style override: matte black finish (RAL 9005) for a contemporary look."
      );
    case "match_room_switches":
      return (
        ELECTRIC_BUTTON_DESCRIPTION_BASE +
        " Style: MATCH EXACTLY the visible wall switches in the photographed room " +
        "(same brand-look, same color, same plate dimensions, same arrow pictograms). " +
        "Maintain visual coherence with the existing electrical fixtures."
      );
    case "bianco_standard":
    default:
      return ELECTRIC_BUTTON_DESCRIPTION_BASE + " Default white matte finish (RAL 9010).";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// v8 NEW — TRAVERSO PORTAFINESTRA
// ─────────────────────────────────────────────────────────────────────────────

export const TRANSOM_KEEP_DESCRIPTION =
  "Keep the existing horizontal transom (mullion) at the same height position " +
  "as photographed. Above the transom: clear glass. Below the transom: same panel " +
  "type as the source photo (clear glass or solid panel — match what is visible).";

export const TRANSOM_REMOVE_DESCRIPTION =
  "REMOVE the horizontal transom (mullion) entirely from the door-window composition. " +
  "Each sash becomes a SINGLE full-height glazed panel with NO horizontal divider in the " +
  "middle. Replace the area below the former transom with continuous clear glass from the " +
  "top of the door to the bottom rail. The result must look like a modern frameless " +
  "full-height glazed door-window.";

export const TRANSOM_ADD_DESCRIPTION =
  "Add a horizontal transom (mullion) at approximately 50% height of the door-window. " +
  "The transom is a horizontal frame element in the same material and finish as the " +
  "outer frame. Above the transom: clear glass. Below the transom: clear glass " +
  "(do NOT add a solid panel unless specifically required).";

// ─────────────────────────────────────────────────────────────────────────────
// QUALITY DIRECTIVES (estese in v8)
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_QUALITY_DIRECTIVES = [
  "Professional architectural photorealistic replacement render quality bar.",
  "The edited image must look like the same real photograph after a real installation, not a redesigned AI room.",
  "All joins between frame and wall must be believable, clean and installable in reality.",
  "Glazing reflections, gaskets, shadow casting and ambient occlusion must be physically plausible.",
  "No warped geometry, no floating elements, no showroom staging, no generic beauty-pass restyling.",
  "Frame profile thickness numerical values stated in the specification MUST be visually respected.",
  "If reduced-node or minimal profile is specified, the central mullion MUST appear visibly thinner than the outer frame perimeter — this is non-negotiable.",
];

// ─────────────────────────────────────────────────────────────────────────────
// NEGATIVE CONSTRAINTS (estese in v8)
// ─────────────────────────────────────────────────────────────────────────────

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
  "do not leave any manual cord, strap, vertical pull element or leftover manual-control trim visible if a motorized shutter is selected",
  "do not render mixed hinge colors or inconsistent hinge shapes",
  "do not oversize the cassonetto compared to the original visible envelope",
  "do not render a floating colored shutter band above the glazing when the shutter should be fully open and hidden",
  // ── v8 ──
  "do not render TWO handles when CENTRAL-HANDLE composition is specified — exactly ONE handle on the central palettone",
  "do not render visible hinges when HIDDEN HINGES mode is specified — the hinged stile must be clean and continuous",
  "do not keep the source-photo sash count if the specification requests a different sash count — adapt the composition by removing or adding mullions within the same opening width",
  "do not leave the wall blank where the old manual belt winder was — a new electric switch plate MUST be installed at that location",
  "do not render the horizontal transom if the specification requests REMOVE — produce single full-height glazed sashes",
  // ── v8.1 — Nodo ──
  "do not render two equal-width sashes when ASYMMETRIC NODE is specified — primary sash MUST be visibly wider than secondary sash",
  "do not render a doubled central mullion (~110mm) when ASYMMETRIC NODE is specified — show ONE single ~70mm meeting stile (palettone covering palettino)",
  "do not render two equal stiles meeting in the center when SYMMETRIC NODE is specified — show the classic doubled vertical mullion (~110mm visible)",
  "do not render the handle on the side sash stile when CENTRAL-HANDLE is specified — the handle must be exactly at the geometric center on the palettone",
  // ── v8.2 — Handle count (Italian residential standard) ──
  "do not render TWO handles on a 2-sash window — exactly ONE handle goes on the primary operative sash, the secondary sash has only internal locking",
  "do not render THREE handles on a 3-sash window — exactly TWO handles total: ONE on the 2-sash group + ONE on the single sash",
  "do not render FOUR handles on a 4-sash window — exactly TWO handles total: ONE per 2-sash group",
  "do not render one handle per sash on multi-sash compositions — sashes are grouped, only the primary sash of each group shows a handle",
];
