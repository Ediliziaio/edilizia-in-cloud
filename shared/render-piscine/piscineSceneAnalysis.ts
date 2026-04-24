import type {
  ConfigurazionePiscine,
  PiscinaPhotoMeta,
  PiscinaSceneAnalysis,
} from "./types.ts";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function arrayOfStrings(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : fallback;
}

function inferOrientation(photoMeta?: PiscinaPhotoMeta | null): PiscinaSceneAnalysis["imageOrientation"] {
  if (!photoMeta?.width || !photoMeta.height) return "unknown";
  const ratio = photoMeta.width / photoMeta.height;
  if (ratio > 1.12) return "landscape";
  if (ratio < 0.88) return "portrait";
  return "square";
}

export function normalizePiscinaSceneAnalysis(
  config: ConfigurazionePiscine,
  rawAnalysis?: unknown,
  photoMeta?: PiscinaPhotoMeta | null,
): PiscinaSceneAnalysis {
  const raw = asRecord(rawAnalysis);
  const zone = config.inserimento.zona.replace(/_/g, " ");
  const isExistingPoolOperation = ["replace_existing_pool", "remove_existing_pool", "recolor_waterlook_or_liner_only", "change_coping_only"].includes(config.operazione);
  const hasPool = isExistingPoolOperation ? "existing pool visible or assumed in target area" : "no existing pool in target area unless detected in the image";

  return {
    version: "1.0",
    outdoorAreaType: text(raw.outdoorAreaType, `${zone} outdoor residential area`),
    propertyType: text(raw.propertyType, "residential property / private outdoor exterior"),
    houseAndFacade: text(raw.houseAndFacade, config.inserimento.rapporto_con_casa || "same visible house/facade, doors and windows preserved"),
    existingLawnAndHardscape: text(raw.existingLawnAndHardscape, "existing lawn, patio, deck or paving must be read from the source photo and preserved outside the target footprint"),
    topographyAndLevels: text(raw.topographyAndLevels, "infer ground levels, steps, terrace/parapet edges and slopes from the image; keep them credible"),
    existingPoolOrWater: text(raw.existingPoolOrWater, hasPool),
    outdoorFurniture: text(raw.outdoorFurniture, "preserve existing outdoor furniture unless selected for minimal addition or declutter"),
    boundariesAndWalls: text(raw.boundariesAndWalls, "preserve fences, walls, parapets, retaining walls and neighboring boundaries"),
    vegetationAndTrees: text(raw.vegetationAndTrees, "preserve important trees, hedges and vegetation outside target insertion logic"),
    pathsAndCirculation: text(raw.pathsAndCirculation, "preserve plausible walking paths and circulation around the pool"),
    lightAndShadows: text(raw.lightAndShadows, "preserve original sunlight direction, shadow softness and outdoor exposure"),
    availableInsertionSpace: text(raw.availableInsertionSpace, config.inserimento.posizione_descrittiva || "use only the visually available outdoor space; do not oversize the pool"),
    obstacles: arrayOfStrings(raw.obstacles, [
      "house/facade clearances",
      "trees and mature vegetation",
      "walls, fences, parapets, steps and paths",
      "existing furniture or hardscape outside target area",
    ]),
    untouchableElements: arrayOfStrings(raw.untouchableElements, [
      "house facade",
      "doors and windows",
      "non-target lawn and paving",
      "trees and boundaries",
      "camera perspective and image dimensions",
    ]),
    contextToPreserve: arrayOfStrings(raw.contextToPreserve, [
      "same house",
      "same garden / patio / outdoor space",
      "same sky and weather",
      "same neighboring buildings",
      "same non-target furniture and vegetation",
    ]),
    imageOrientation: inferOrientation(photoMeta),
  };
}
