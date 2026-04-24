import type {
  ConfigurazionePavimentoEsterno,
  ExteriorFloorImageOrientation,
  ExteriorFloorPhotoMeta,
  ExteriorFloorSceneAnalysis,
} from "./types.ts";

function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function list(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : fallback;
}

function orientation(meta?: ExteriorFloorPhotoMeta | null): ExteriorFloorImageOrientation {
  if (meta?.orientation) return meta.orientation;
  if (!meta?.width || !meta.height) return "unknown";
  if (meta.width === meta.height) return "square";
  return meta.width > meta.height ? "landscape" : "portrait";
}

export function normalizeExteriorFloorSceneAnalysis(
  config: ConfigurazionePavimentoEsterno,
  rawAnalysis?: unknown,
  photoMeta?: ExteriorFloorPhotoMeta | null,
): ExteriorFloorSceneAnalysis {
  const raw = (typeof rawAnalysis === "object" && rawAnalysis ? rawAnalysis : {}) as Record<string, unknown>;
  const area = config.inserimento.area_target.replace(/_/g, " ");
  const isPoolside = config.uso === "bordo_piscina" || config.inserimento.area_target === "bordo_piscina";
  const isVehicular = config.uso === "carrabile_leggera" || config.uso === "carrabile_intensa";

  return {
    version: "1.0",
    outdoorAreaType: str(raw.outdoorAreaType, area),
    propertyType: str(raw.propertyType, "residential or commercial outdoor property"),
    houseFacadeRelation: str(raw.houseFacadeRelation, config.inserimento.rapporto_con_casa || "house facade, doors and thresholds remain as photographed"),
    currentSurface: str(raw.currentSurface, "existing outdoor paving/surface visible in the photo"),
    surroundingSurfaces: str(raw.surroundingSurfaces, [
      config.inserimento.rapporto_con_prato || "adjacent lawn/garden if visible",
      isPoolside ? "pool edge and pool basin visible near target" : "adjacent non-target hardscape",
    ].join("; ")),
    stepsAndLevels: str(raw.stepsAndLevels, config.inserimento.rapporto_con_gradini || "visible steps/level changes preserved unless selected"),
    thresholdsAndHouseJunctions: str(raw.thresholdsAndHouseJunctions, "door thresholds, facade base and wall junctions require clean height alignment"),
    poolEdge: str(raw.poolEdge, isPoolside ? "pool edge/coping is in scope or directly adjacent" : "no pool edge in target unless visible"),
    wallsParapetsFences: str(raw.wallsParapetsFences, "walls, parapets, fences and fixed outdoor boundaries remain unchanged"),
    circulationFlows: str(raw.circulationFlows, isVehicular ? "driveway/vehicular circulation must remain usable and robust" : "pedestrian circulation paths remain clear"),
    outdoorFurniture: str(raw.outdoorFurniture, "outdoor furniture, pots and non-target objects remain in place"),
    lightAndShadows: str(raw.lightAndShadows, "preserve original sun direction, shadows, contact occlusion and outdoor light response"),
    currentWear: str(raw.currentWear, "existing surface wear as photographed; new surface should look professionally installed but not fake"),
    apparentSlopeAndLevels: str(raw.apparentSlopeAndLevels, config.inserimento.pendenza_apparente?.replace(/_/g, " ") || "preserve plausible outdoor slope/level logic"),
    obstacles: list(raw.obstacles, ["furniture legs", "pots", "walls/thresholds", "pool edge if visible", "steps if visible"]),
    untouchableElements: list(raw.untouchableElements, [
      "house facade",
      "windows and doors",
      "non-target lawn/garden",
      "non-target pool basin",
      "pergola if not in scope",
      "outdoor furniture unless selected",
    ]),
    contextToPreserve: list(raw.contextToPreserve, [
      "sky",
      "vegetation",
      "neighboring buildings",
      "walls/fences",
      "non-target hardscape",
      "image dimensions and perspective",
    ]),
    imageOrientation: orientation(photoMeta),
  };
}
