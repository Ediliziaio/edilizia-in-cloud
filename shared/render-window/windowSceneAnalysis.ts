import type {
  WindowBeltPlacement,
  SceneEnvironmentType,
  WindowImageOrientation,
  WindowMaterial,
  WindowOpeningPosition,
  WindowOpeningType,
  WindowPhotoMeta,
  WindowRollerCurtainState,
  WindowRollerControlType,
  WindowSceneAnalysis,
  WindowSceneOpening,
  WindowTargetSelection,
  WindowTransomPanelBelow,
} from "./types.ts";

const OPENING_TYPES: WindowOpeningType[] = [
  "battente_1_anta",
  "battente_2_ante",
  "battente_3_ante",
  "scorrevole",
  "scorrevole_alzante",
  "vasistas",
  "anta_ribalta",
  "bilico",
  "fisso",
  "portafinestra",
];

const MATERIALS: WindowMaterial[] = [
  "pvc",
  "alluminio",
  "legno",
  "legno_alluminio",
  "acciaio_corten",
  "acciaio_minimale",
  "unknown",
];

const POSITIONS: WindowOpeningPosition[] = [
  "far_left",
  "left",
  "center",
  "right",
  "far_right",
  "full_width",
  "unknown",
];

const ENVIRONMENTS: SceneEnvironmentType[] = [
  "living_room",
  "kitchen",
  "bedroom",
  "bathroom",
  "staircase",
  "office",
  "facade",
  "balcony",
  "interior_generic",
  "exterior_generic",
  "mixed",
  "unknown",
];

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "si", "sì", "1"].includes(normalized)) return true;
    if (["false", "no", "0"].includes(normalized)) return false;
  }
  return fallback;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringArray(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, limit);
}

function normalizeOpeningType(value: unknown): WindowOpeningType {
  return OPENING_TYPES.includes(value as WindowOpeningType) ? (value as WindowOpeningType) : "battente_2_ante";
}

function normalizeMaterial(value: unknown): WindowMaterial {
  return MATERIALS.includes(value as WindowMaterial) ? (value as WindowMaterial) : "unknown";
}

function normalizePosition(value: unknown): WindowOpeningPosition {
  return POSITIONS.includes(value as WindowOpeningPosition) ? (value as WindowOpeningPosition) : "unknown";
}

function normalizeEnvironment(value: unknown): SceneEnvironmentType {
  return ENVIRONMENTS.includes(value as SceneEnvironmentType) ? (value as SceneEnvironmentType) : "unknown";
}

function normalizeRollerCurtainState(value: unknown, fallback: WindowRollerCurtainState): WindowRollerCurtainState {
  const allowed: WindowRollerCurtainState[] = [
    "fully_raised_hidden",
    "top_recessed_band",
    "partially_lowered",
    "fully_lowered",
    "not_visible",
    "unknown",
  ];
  return allowed.includes(value as WindowRollerCurtainState) ? (value as WindowRollerCurtainState) : fallback;
}

function normalizeBeltPlacement(value: unknown): WindowBeltPlacement {
  const allowed: WindowBeltPlacement[] = [
    "left_wall",
    "right_wall",
    "left_reveal",
    "right_reveal",
    "center",
    "unknown",
  ];
  return allowed.includes(value as WindowBeltPlacement) ? (value as WindowBeltPlacement) : "unknown";
}

function normalizeTransomPanelBelowType(value: unknown): WindowTransomPanelBelow {
  const allowed: WindowTransomPanelBelow[] = ["glass", "solid_panel", "louvered", "unknown"];
  return allowed.includes(value as WindowTransomPanelBelow) ? (value as WindowTransomPanelBelow) : "unknown";
}

function normalizePct(value: unknown): number | null {
  const number = optionalNumber(value);
  if (number === null) return null;
  return Math.max(0, Math.min(100, number));
}

function inferOrientation(meta?: WindowPhotoMeta | null): WindowImageOrientation {
  return meta?.orientation ?? "unknown";
}

function labelFromIndex(index: number): string {
  return String.fromCharCode(65 + index);
}

function inferPlacement(position: WindowOpeningPosition, index: number, total: number): string {
  if (position !== "unknown") return position.replace(/_/g, " ");
  if (total === 1) return "center";
  if (index === 0) return "left side of the frame";
  if (index === total - 1) return "right side of the frame";
  return "central area";
}

function buildOpeningFromLegacy(raw: Record<string, unknown>): WindowSceneOpening {
  const typeCurrent = normalizeOpeningType(raw.tipo_apertura);
  const sashCount = numberOr(raw.num_ante_attuale, typeCurrent === "battente_2_ante" ? 2 : 1);
  const hasRoller = booleanOr(raw.presenza_tapparella, booleanOr(raw.presenza_cassonetto, false));
  const hasBelt = stringOr(raw.cinghia_attuale, "").toLowerCase() === "con_cinghia";
  const canHaveTransom = typeCurrent === "portafinestra";

  return {
    id: "A",
    label: "A",
    order: 0,
    position: "center",
    approximatePlacement: "center",
    typeCurrent,
    perceivedElement: typeCurrent === "portafinestra" ? "door_window" : typeCurrent.includes("scorrevole") ? "sliding_panel" : "window",
    sashCount,
    materialPerceived: normalizeMaterial(raw.materiale_attuale),
    colorPerceived: stringOr(raw.colore_attuale, "unknown"),
    condition: ["buone", "usurato", "danneggiato", "fatiscente"].includes(String(raw.condizioni))
      ? (String(raw.condizioni) as WindowSceneOpening["condition"])
      : "unknown",
    hasCassonetto: booleanOr(raw.presenza_cassonetto, false),
    cassonettoType: booleanOr(raw.presenza_cassonetto, false) ? stringOr(raw.tipo_cassonetto, "roller box") : null,
    hasRollerShutter: hasRoller,
    hasBelt,
    hasBeltBox: hasBelt,
    beltPlacement: "unknown",
    beltPlacementNotes: hasBelt
      ? "manual belt visible near the opening, exact side not determined in legacy analysis"
      : "no visible manual belt",
    rollerControlType: hasBelt ? "manual_belt" : hasRoller ? "unknown" : "none",
    operativeSash: "unknown",
    rollerCurtainState: hasRoller ? "fully_raised_hidden" : "not_visible",
    rollerCurtainPositionNotes: hasRoller
      ? "roller curtain not visibly lowered; if present, it is likely hidden inside the box in the source photo"
      : "no visible roller curtain in the source photo",
    hasHorizontalTransom: canHaveTransom ? booleanOr(raw.has_horizontal_transom ?? raw.hasHorizontalTransom, false) : false,
    transomPositionPct: canHaveTransom ? normalizePct(raw.transom_position_pct ?? raw.transomPositionPct) : null,
    transomPanelBelowType: canHaveTransom ? normalizeTransomPanelBelowType(raw.transom_panel_below_type ?? raw.transomPanelBelowType) : "unknown",
    estimatedHeightCm: optionalNumber(raw.estimated_height_cm ?? raw.estimatedHeightCm ?? raw.altezza_stimata_cm),
    hasPersiane: booleanOr(raw.presenza_persiane, false),
    hasScuri: booleanOr(raw.presenza_scuri, false),
    hasGrates: booleanOr(raw.presenza_inferriata, false),
    hasSill: booleanOr(raw.presenza_davanzale, false),
    hasCurtains: booleanOr(raw.presenza_tende, false),
    radiatorNearby: booleanOr(raw.presenza_radiatore, false),
    cassonettoGeometryNotes: booleanOr(raw.presenza_cassonetto, false)
      ? stringOr(raw.cassonetto_geometry_notes, "keep the existing cassonetto footprint, height, depth and lower reveal line as close as possible to the source photo")
      : "no visible cassonetto envelope to preserve",
    surroundingElements: stringArray(raw.elementi_contorno),
    lightNotes: stringOr(raw.luce, "same existing lighting"),
    reflectionNotes: stringOr(raw.riflessi, "preserve current glazing reflections"),
    shadowNotes: stringOr(raw.ombre, "preserve current shadow direction"),
    geometryNotes: stringOr(raw.geometria, "preserve the original opening geometry"),
    outdoorViewNotes: stringOr(raw.outdoor_view_notes, "preserve outdoor view through glass"),
    preserveNotes: stringOr(raw.note_analisi, "preserve surrounding room elements"),
  };
}

function normalizeOpening(rawOpening: Record<string, unknown>, index: number, total: number): WindowSceneOpening {
  const label = stringOr(rawOpening.id, labelFromIndex(index)).toUpperCase();
  const typeCurrent = normalizeOpeningType(rawOpening.type_current ?? rawOpening.typeCurrent ?? rawOpening.tipo_apertura);
  const sashCount = Math.max(1, Math.min(6, numberOr(rawOpening.sash_count ?? rawOpening.sashCount ?? rawOpening.num_ante_attuale, typeCurrent === "battente_2_ante" ? 2 : 1)));
  const hasBelt = booleanOr(rawOpening.has_belt ?? rawOpening.hasBelt ?? rawOpening.presenza_cinghia, false);
  const hasBeltBox = booleanOr(rawOpening.has_belt_box ?? rawOpening.hasBeltBox ?? rawOpening.presenza_avvolgitore, hasBelt);
  // Un cassonetto esiste per contenere una tapparella: se c'e' il cassonetto,
  // la tapparella c'e' anche quando e' completamente alzata e non se ne vede
  // una stecca. Il modello di analisi rispondeva `has_roller_shutter: false`
  // proprio su questi casi — dichiarando nella stessa risposta un cassonetto
  // esterno — e quel false spegneva a valle ogni regola sulla tapparella e sul
  // suo comando: si ottenevano render con tapparella motorizzata e l'asta di
  // manovra manuale ancora appesa al muro accanto.
  // Provato due volte a correggerlo nel prompt di analisi, senza risultato: la
  // deduzione sta qui, dove e' deterministica.
  const haCassonetto = booleanOr(rawOpening.has_cassonetto ?? rawOpening.hasCassonetto, false);
  const hasRollerShutter = haCassonetto || hasBelt ||
    booleanOr(rawOpening.has_roller_shutter ?? rawOpening.hasRollerShutter ?? rawOpening.presenza_tapparella, false);
  const position = normalizePosition(rawOpening.position);
  const beltPlacement = normalizeBeltPlacement(rawOpening.belt_placement ?? rawOpening.beltPlacement);
  const rollerCurtainState = normalizeRollerCurtainState(
    rawOpening.roller_curtain_state ?? rawOpening.rollerCurtainState,
    hasRollerShutter ? "fully_raised_hidden" : "not_visible",
  );
  const rawPerceivedElement = rawOpening.perceived_element ?? rawOpening.perceivedElement;
  const perceivedElement = ["window", "door_window", "sliding_panel", "fixed_light", "unknown"].includes(String(rawPerceivedElement))
    ? (String(rawPerceivedElement) as WindowSceneOpening["perceivedElement"])
    : typeCurrent === "portafinestra"
      ? "door_window"
      : typeCurrent.includes("scorrevole")
        ? "sliding_panel"
        : typeCurrent === "fisso"
          ? "fixed_light"
          : "window";
  const canHaveTransom = perceivedElement === "door_window" || typeCurrent === "portafinestra";
  const estimatedHeightCm = optionalNumber(rawOpening.estimated_height_cm ?? rawOpening.estimatedHeightCm ?? rawOpening.altezza_stimata_cm);

  return {
    id: label,
    label,
    order: index,
    position,
    approximatePlacement: stringOr(rawOpening.approximate_placement ?? rawOpening.approximatePlacement, inferPlacement(position, index, total)),
    typeCurrent,
    perceivedElement,
    sashCount,
    materialPerceived: normalizeMaterial(rawOpening.material_perceived ?? rawOpening.materialPerceived ?? rawOpening.materiale_attuale),
    colorPerceived: stringOr(rawOpening.color_perceived ?? rawOpening.colorPerceived ?? rawOpening.colore_attuale, "unknown"),
    condition: ["buone", "usurato", "danneggiato", "fatiscente"].includes(String(rawOpening.condition ?? rawOpening.condizione))
      ? (String(rawOpening.condition ?? rawOpening.condizione) as WindowSceneOpening["condition"])
      : "unknown",
    hasCassonetto: booleanOr(rawOpening.has_cassonetto ?? rawOpening.hasCassonetto, false),
    cassonettoType: booleanOr(rawOpening.has_cassonetto ?? rawOpening.hasCassonetto, false)
      ? stringOr(rawOpening.cassonetto_type ?? rawOpening.cassonettoType, "roller box")
      : null,
    cassonettoStyle: (() => {
      const raw = String(rawOpening.cassonetto_style ?? rawOpening.cassonettoStyle ?? "").toLowerCase().trim();
      if (raw === "external_box" || raw === "internal_monoblocco" || raw === "absent") return raw;
      // Auto-derive da legacy fields se l'analizzatore non lo ha specificato.
      const hasCass = booleanOr(rawOpening.has_cassonetto ?? rawOpening.hasCassonetto, false);
      const hasShutter = booleanOr(
        rawOpening.has_roller_shutter ?? rawOpening.hasRollerShutter ?? rawOpening.presenza_tapparella,
        false,
      );
      if (!hasCass && !hasShutter) return "absent" as const;
      // Se ha shutter ma non c'è evidenza di box esterno → assumiamo monoblocco
      // (l'errore di default è external_box, che è il peggior fallimento).
      if (hasShutter && !hasCass) return "internal_monoblocco" as const;
      return "unknown" as const;
    })(),
    hasRollerShutter,
    hasBelt,
    hasBeltBox,
    beltPlacement,
    beltPlacementNotes: stringOr(
      rawOpening.belt_placement_notes ?? rawOpening.beltPlacementNotes,
      hasBelt
        ? beltPlacement === "right_wall"
          ? "manual belt / wall winder is visible on the right wall beside the opening"
          : beltPlacement === "left_wall"
            ? "manual belt / wall winder is visible on the left wall beside the opening"
            : beltPlacement === "right_reveal"
              ? "manual belt / wall winder is visible on the right reveal beside the opening"
              : beltPlacement === "left_reveal"
                ? "manual belt / wall winder is visible on the left reveal beside the opening"
                : "manual belt / wall winder is visible near the opening and must be localized carefully"
        : "no visible manual belt",
    ),
    operativeSash: ["left", "right", "both", "none"].includes(String(rawOpening.operative_sash ?? rawOpening.operativeSash))
      ? (String(rawOpening.operative_sash ?? rawOpening.operativeSash) as WindowSceneOpening["operativeSash"])
      : "unknown",
    rollerControlType: ["manual_belt", "motorized", "chain", "crank", "none", "unknown"].includes(String(rawOpening.roller_control_type ?? rawOpening.rollerControlType))
      ? (String(rawOpening.roller_control_type ?? rawOpening.rollerControlType) as WindowRollerControlType)
      : hasBelt
        ? "manual_belt"
        : hasRollerShutter
          ? "unknown"
          : "none",
    rollerCurtainState,
    rollerCurtainPositionNotes: stringOr(
      rawOpening.roller_curtain_position_notes ?? rawOpening.rollerCurtainPositionNotes,
      rollerCurtainState === "fully_raised_hidden"
        ? "shutter curtain is not visibly lowered; it should stay hidden inside the cassonetto unless explicitly lowered"
        : rollerCurtainState === "top_recessed_band"
          ? "only a very small top recessed shutter band is visible behind the glass/guides"
          : rollerCurtainState === "partially_lowered"
            ? "shutter curtain is partially lowered within the guides"
            : rollerCurtainState === "fully_lowered"
              ? "shutter curtain is fully lowered within the guides"
              : "no visible shutter curtain",
    ),
    hasHorizontalTransom: canHaveTransom
      ? booleanOr(rawOpening.has_horizontal_transom ?? rawOpening.hasHorizontalTransom, false)
      : false,
    transomPositionPct: canHaveTransom
      ? normalizePct(rawOpening.transom_position_pct ?? rawOpening.transomPositionPct)
      : null,
    transomPanelBelowType: canHaveTransom
      ? normalizeTransomPanelBelowType(rawOpening.transom_panel_below_type ?? rawOpening.transomPanelBelowType)
      : "unknown",
    estimatedHeightCm,
    hasPersiane: booleanOr(rawOpening.has_persiane ?? rawOpening.hasPersiane, false),
    hasScuri: booleanOr(rawOpening.has_scuri ?? rawOpening.hasScuri, false),
    hasGrates: booleanOr(rawOpening.has_grates ?? rawOpening.hasGrates ?? rawOpening.presenza_inferriata, false),
    hasSill: booleanOr(rawOpening.has_sill ?? rawOpening.hasSill ?? rawOpening.presenza_davanzale, false),
    hasCurtains: booleanOr(rawOpening.has_curtains ?? rawOpening.hasCurtains ?? rawOpening.presenza_tende, false),
    radiatorNearby: booleanOr(rawOpening.radiator_nearby ?? rawOpening.radiatorNearby ?? rawOpening.presenza_radiatore, false),
    cassonettoGeometryNotes: stringOr(
      rawOpening.cassonetto_geometry_notes ?? rawOpening.cassonettoGeometryNotes,
      booleanOr(rawOpening.has_cassonetto ?? rawOpening.hasCassonetto, false)
        ? "keep the visible cassonetto envelope, overall height, depth, bottom reveal line and side overhang close to the source photo"
        : "no visible cassonetto envelope to preserve",
    ),
    surroundingElements: stringArray(rawOpening.surrounding_elements ?? rawOpening.surroundingElements),
    lightNotes: stringOr(rawOpening.light_notes ?? rawOpening.lightNotes, "preserve current local light behavior"),
    reflectionNotes: stringOr(rawOpening.reflection_notes ?? rawOpening.reflectionNotes, "preserve current glazing reflections"),
    shadowNotes: stringOr(rawOpening.shadow_notes ?? rawOpening.shadowNotes, "preserve current shadow placement"),
    geometryNotes: stringOr(rawOpening.geometry_notes ?? rawOpening.geometryNotes, "preserve the current opening geometry"),
    outdoorViewNotes: stringOr(rawOpening.outdoor_view_notes ?? rawOpening.outdoorViewNotes, "preserve the outdoor view"),
    preserveNotes: stringOr(rawOpening.preserve_notes ?? rawOpening.preserveNotes, "preserve adjacent architectural details"),
  };
}

export function createFallbackWindowSceneAnalysis(meta?: WindowPhotoMeta | null): WindowSceneAnalysis {
  const legacyOpening = buildOpeningFromLegacy({});
  return {
    version: "2.0",
    environmentType: "unknown",
    viewMode: "unknown",
    imageOrientation: inferOrientation(meta),
    estimatedOpeningsVisible: 1,
    targetableOpenings: 1,
    cameraAngle: "preserve original camera angle",
    lightingDirection: "preserve original lighting direction",
    lightingQuality: "preserve original exposure and white balance",
    environmentSummary: "Same photographed environment, no reinterpretation.",
    wallMaterial: "same existing wall material",
    wallColor: "same existing wall color",
    floorVisible: true,
    curtainsPresent: false,
    radiatorPresent: false,
    furnitureContext: [],
    untouchedElements: ["walls", "floor", "furniture", "curtains", "radiators", "outdoor view"],
    outdoorViewSummary: "keep outdoor scenery identical",
    openings: [legacyOpening],
    primaryTargetHint: "A",
    noteAnalisi: "Fallback analysis: preserve the source photo exactly and replace only the selected infisso.",
    legacy: {
      tipo_apertura: legacyOpening.typeCurrent,
      materiale_attuale: legacyOpening.materialPerceived,
      colore_attuale: legacyOpening.colorPerceived,
      condizioni: legacyOpening.condition,
      stile_edificio: "unknown",
      num_ante_attuale: legacyOpening.sashCount,
      presenza_cassonetto: legacyOpening.hasCassonetto,
      presenza_davanzale: legacyOpening.hasSill,
      presenza_inferriata: legacyOpening.hasGrates,
      larghezza_stimata_cm: null,
      altezza_stimata_cm: null,
      note_analisi: "Fallback analysis",
      cinghia_attuale: legacyOpening.hasBelt ? "con_cinghia" : "unknown",
    },
  };
}

export function normalizeWindowSceneAnalysis(rawInput: unknown, meta?: WindowPhotoMeta | null): WindowSceneAnalysis {
  const raw = asObject(rawInput);
  if (!Object.keys(raw).length) return createFallbackWindowSceneAnalysis(meta);

  const rawOpenings = Array.isArray(raw.openings)
    ? raw.openings.map((item) => asObject(item)).filter((item) => Object.keys(item).length > 0)
    : [];

  const openings = (rawOpenings.length > 0 ? rawOpenings : [buildOpeningFromLegacy(raw)]).map((item, index, array) =>
    normalizeOpening(asObject(item), index, array.length),
  );

  const legacyFirst = openings[0] ?? buildOpeningFromLegacy(raw);
  const legacy = asObject(raw.legacy);
  const untouchedElements = [
    ...stringArray(raw.untouched_elements, 16),
    ...stringArray(raw.elementi_da_preservare, 16),
  ];

  return {
    version: "2.0",
    environmentType: normalizeEnvironment(raw.environment_type ?? raw.environmentType),
    viewMode: ["interior", "exterior", "mixed", "unknown"].includes(String(raw.view_mode ?? raw.viewMode))
      ? (String(raw.view_mode ?? raw.viewMode) as WindowSceneAnalysis["viewMode"])
      : "unknown",
    imageOrientation: inferOrientation(meta),
    estimatedOpeningsVisible: Math.max(1, numberOr(raw.openings_count_visible ?? raw.estimatedOpeningsVisible ?? raw.numero_aperture_visibili, openings.length)),
    targetableOpenings: openings.length,
    cameraAngle: stringOr(raw.camera_angle ?? raw.cameraAngle ?? raw.angolo_ripresa, "preserve original camera angle"),
    lightingDirection: stringOr(raw.lighting_direction ?? raw.lightingDirection ?? raw.luce, "preserve original lighting direction"),
    lightingQuality: stringOr(raw.lighting_quality ?? raw.lightingQuality, "preserve original exposure and white balance"),
    environmentSummary: stringOr(raw.environment_summary ?? raw.environmentSummary, "Same photographed environment with only surgical infisso replacement."),
    wallMaterial: stringOr(raw.wall_material ?? raw.wallMaterial ?? raw.materiale_muro, "same existing wall material"),
    wallColor: stringOr(raw.wall_color ?? raw.wallColor ?? raw.colore_muro, "same existing wall color"),
    floorVisible: booleanOr(raw.floor_visible ?? raw.floorVisible, true),
    curtainsPresent: booleanOr(raw.curtains_present ?? raw.curtainsPresent ?? raw.presenza_tende, openings.some((opening) => opening.hasCurtains)),
    radiatorPresent: booleanOr(raw.radiator_present ?? raw.radiatorPresent ?? raw.presenza_radiatore, openings.some((opening) => opening.radiatorNearby)),
    furnitureContext: stringArray(raw.furniture_context ?? raw.furnitureContext, 12),
    untouchedElements: untouchedElements.length > 0
      ? Array.from(new Set(untouchedElements))
      : ["walls", "floor", "ceiling", "furniture", "curtains", "radiators", "sockets", "outdoor view"],
    outdoorViewSummary: stringOr(raw.outdoor_view_summary ?? raw.outdoorViewSummary, "keep the outdoor view identical unless minimal glass-consistent refinement is unavoidable"),
    openings,
    primaryTargetHint: typeof raw.primary_target_hint === "string"
      ? raw.primary_target_hint.toUpperCase()
      : typeof raw.primaryTargetHint === "string"
        ? raw.primaryTargetHint.toUpperCase()
        : openings[0]?.id ?? null,
    noteAnalisi: stringOr(raw.note_analisi ?? raw.noteAnalisi, "Preserve the same environment and replace only the requested openings."),
    legacy: {
      tipo_apertura: normalizeOpeningType(raw.tipo_apertura ?? legacy.tipo_apertura ?? legacyFirst.typeCurrent),
      materiale_attuale: normalizeMaterial(raw.materiale_attuale ?? legacy.materiale_attuale ?? legacyFirst.materialPerceived),
      colore_attuale: stringOr(raw.colore_attuale ?? legacy.colore_attuale ?? legacyFirst.colorPerceived, legacyFirst.colorPerceived),
      condizioni: stringOr(raw.condizioni ?? legacy.condizioni ?? legacyFirst.condition, legacyFirst.condition),
      stile_edificio: stringOr(raw.stile_edificio ?? legacy.stile_edificio, "unknown"),
      num_ante_attuale: numberOr(raw.num_ante_attuale ?? legacy.num_ante_attuale, legacyFirst.sashCount),
      presenza_cassonetto: booleanOr(raw.presenza_cassonetto ?? legacy.presenza_cassonetto, legacyFirst.hasCassonetto),
      presenza_davanzale: booleanOr(raw.presenza_davanzale ?? legacy.presenza_davanzale, legacyFirst.hasSill),
      presenza_inferriata: booleanOr(raw.presenza_inferriata ?? legacy.presenza_inferriata, legacyFirst.hasGrates),
      larghezza_stimata_cm: optionalNumber(raw.larghezza_stimata_cm),
      altezza_stimata_cm: optionalNumber(raw.altezza_stimata_cm),
      note_analisi: stringOr(raw.note_analisi ?? legacy.note_analisi, "Detailed scene analysis"),
      cinghia_attuale: (raw.cinghia_attuale ?? legacy.cinghia_attuale) === "con_cinghia"
        ? "con_cinghia"
        : legacyFirst.hasBelt
          ? "con_cinghia"
          : "unknown",
    },
  };
}

export function createWindowTargetSelection(
  analysis: WindowSceneAnalysis,
  selectedOpeningIds?: string[] | null,
): WindowTargetSelection {
  const targetableIds = analysis.openings.map((opening) => opening.id);
  const normalizedSelected = (selectedOpeningIds ?? targetableIds)
    .filter((id): id is string => typeof id === "string" && targetableIds.includes(id))
    .filter((id, index, array) => array.indexOf(id) === index);

  const finalSelected = normalizedSelected.length > 0 ? normalizedSelected : targetableIds.slice(0, 1);
  const preservedOpeningIds = targetableIds.filter((id) => !finalSelected.includes(id));

  return {
    mode:
      finalSelected.length === targetableIds.length
        ? "all"
        : finalSelected.length === 1
          ? "single"
          : "multiple",
    selectedOpeningIds: finalSelected,
    preservedOpeningIds,
    primaryOpeningId: finalSelected[0] ?? null,
    targetLabels: analysis.openings
      .filter((opening) => finalSelected.includes(opening.id))
      .map((opening) => opening.label),
  };
}

/**
 * C'e' un comando manuale della tapparella da rimuovere, dato che la nuova e'
 * motorizzata?
 *
 * La stessa condizione era scritta a mano in TRE punti diversi — la regola di
 * rimozione nel manifest, la nota di compatibilita' e la decisione di
 * installare il comando elettrico — e in tutti e tre era `hasBelt ||
 * hasBeltBox`, cioe' riconosceva solo la cinghia. In Italia il comando manuale
 * ha altre due forme, l'ASTA DI MANOVRA (tipica dei cassonetti esterni) e la
 * catenella: per quelle nessuno dei tre rami si attivava, e il render usciva
 * con la tapparella motorizzata e l'asta ancora appesa al muro.
 * Averla in un posto solo evita che i tre punti tornino a divergere.
 */
export function haComandoManualeDaRimuovere(
  opening: WindowSceneOpening | undefined,
  isMotorized: boolean,
): boolean {
  if (!isMotorized || !opening) return false;
  const tipo = opening.rollerControlType;
  const noto = opening.hasBelt || opening.hasBeltBox ||
    tipo === "manual_belt" || tipo === "crank" || tipo === "chain";
  if (noto) return true;
  // Il tipo di comando spesso non si legge dalla foto. Se la tapparella c'e',
  // si procede comunque alla rimozione generica: se non c'e' niente da
  // togliere, non toglie niente.
  return opening.hasRollerShutter && (tipo === "unknown" || tipo === "none");
}
