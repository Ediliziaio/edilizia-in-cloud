import type {
  ConfigurazionePavimentoEsterno,
  ExteriorFloorBuildabilityEnvelope,
  ExteriorFloorSceneAnalysis,
  ExteriorFloorTargetSurfaceMap,
} from "./types.ts";

function targetLabel(config: ConfigurazionePavimentoEsterno): string {
  return config.inserimento.posizione_descrittiva?.trim() ||
    config.inserimento.area_target.replace(/_/g, " ");
}

export function buildExteriorFloorTargetSurfaceMap(
  config: ConfigurazionePavimentoEsterno,
  scene: ExteriorFloorSceneAnalysis,
): ExteriorFloorTargetSurfaceMap {
  const area = config.inserimento.area_target;
  const isPoolside = area === "bordo_piscina" || config.uso === "bordo_piscina";
  const targetsSteps = config.gradino !== "nessuno" || config.operazione === "change_steps_only";

  return {
    areaTarget: area,
    targetDescription: `target exterior surface: ${targetLabel(config)}; replace/refinish only the visibly selected outdoor hardscape zone`,
    apparentPerimeter: "lock the apparent perimeter to existing edges, walls, lawn, pool coping, thresholds and visible hardscape boundaries",
    frontBackLimits: "front/back limits follow photographed perspective and visible surface termination lines",
    leftRightLimits: "left/right limits follow adjacent walls, lawn edges, pool edges, parapets, steps or furniture occlusions",
    thresholds: [
      scene.thresholdsAndHouseJunctions,
      "door thresholds and facade base must remain clean with no impossible raised lip",
    ],
    steps: targetsSteps
      ? [scene.stepsAndLevels, "selected step treads/risers must be resolved with clear edges"]
      : ["steps remain unchanged unless selected"],
    poolEdges: isPoolside
      ? [scene.poolEdge, "pool basin geometry remains unchanged unless pool domain is explicitly active"]
      : ["no pool-edge modification unless visible and selected"],
    occludedZones: [
      "areas under furniture/pots remain occluded; infer continuity only where physically visible",
      "do not duplicate or move furniture legs to reveal floor",
    ],
    adjacentSurfacesToPreserve: [
      scene.surroundingSurfaces,
      "non-target lawn/garden/deck/hardscape remains unchanged",
      ...config.elementi_da_preservare ?? [],
    ],
    materialTransitionLines: [
      "transition lines must be crisp, architectural and perspective-correct",
      "no smudged AI blend between old and new materials",
      isPoolside ? "pool coping/deck transition must remain water-compatible and clean" : "",
    ].filter(Boolean),
  };
}

export function buildExteriorFloorBuildabilityEnvelope(
  config: ConfigurazionePavimentoEsterno,
  scene: ExteriorFloorSceneAnalysis,
  target: ExteriorFloorTargetSurfaceMap,
): ExteriorFloorBuildabilityEnvelope {
  const isDeck = config.materiale === "deck_wpc" || config.materiale === "deck_legno" || config.operazione === "convert_to_deck";
  const isPoolside = config.uso === "bordo_piscina" || config.inserimento.area_target === "bordo_piscina";
  const isVehicular = config.uso === "carrabile_leggera" || config.uso === "carrabile_intensa";
  const drainage = config.inserimento.drenaggio_percepito?.replace(/_/g, " ") || "subtle exterior runoff through slope and joints";
  const level = config.inserimento.quota_apparente?.replace(/_/g, " ") || "existing exterior level preserved";

  return {
    plausibleThickness: isDeck
      ? "deck boards show plausible board thickness and substructure shadow only where edges reveal it"
      : isPoolside
        ? "coping/paver thickness is visible at pool edge and perimeter cuts, not paper-thin"
        : "surface build-up thickness is plausible at visible edges, thresholds and cuts",
    finalLevelRelation: `final surface level: ${level}; do not create a floating slab or impossible step at thresholds`,
    thresholdCompatibility: `${target.thresholds.join("; ")}; preserve door operation and facade base geometry`,
    slopeLogic: config.inserimento.pendenza_apparente?.replace(/_/g, " ") || "very subtle exterior slope compatible with runoff and the photographed ground plane",
    drainageLogic: drainage,
    poolCompatibility: isPoolside
      ? "pool coping/deck must align to basin edge without altering waterline or basin geometry"
      : "if pool is visible but not targeted, preserve basin and coping exactly",
    lawnDeckFacadeCompatibility: "new paving must meet lawn, gravel, deck, wall, parapet and facade with buildable joints and crisp borders",
    usageCompatibility: isVehicular
      ? "vehicular surface must look robust, thick, stable and driveway-capable; no fragile decorative-only material logic"
      : "surface use must match pedestrian/poolside/relax context with exterior grip and scale",
    forbiddenPlacements: [
      "no floating outdoor surface",
      "no raised surface blocking doors or thresholds",
      "no impossible water-trapping basin unless a drain is visible/selected",
      "no coping invading pool water or deck as a fake overlay",
      "no pattern drifting across steps or walls",
    ],
  };
}
