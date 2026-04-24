import type {
  ConfigurazionePergole,
  PergolaImageOrientation,
  PergolaPhotoMeta,
  PergolaSceneAnalysis,
} from "./types.ts";

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function arr(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : fallback;
}

function orientationFromMeta(photoMeta?: PergolaPhotoMeta | null): PergolaImageOrientation {
  if (!photoMeta?.width || !photoMeta.height) return "unknown";
  const ratio = photoMeta.width / photoMeta.height;
  if (ratio > 1.12) return "landscape";
  if (ratio < 0.88) return "portrait";
  return "square";
}

export function normalizePergolaSceneAnalysis(
  config: ConfigurazionePergole,
  rawAnalysis?: unknown,
  photoMeta?: PergolaPhotoMeta | null,
): PergolaSceneAnalysis {
  const analysis = rawAnalysis && typeof rawAnalysis === "object" && !Array.isArray(rawAnalysis)
    ? rawAnalysis as Record<string, unknown>
    : {};

  const zona = config.installazione.zona.replace(/_/g, " ");
  const wallMounted = config.installazione.addossata_si_no;
  const poolContext = config.installazione.zona === "bordo_piscina";
  const terraceContext = config.installazione.zona === "terrazzo";

  return {
    version: "1.0",
    outdoorAreaType: str(analysis.outdoorAreaType, poolContext ? "poolside outdoor area" : terraceContext ? "terrace / balcony outdoor area" : `${zona} outdoor area`),
    propertyType: str(analysis.propertyType, "residential or commercial property inferred from the uploaded photo"),
    facadeVisible: str(analysis.facadeVisible, wallMounted ? "facade visible and used as rear attachment plane" : "facade/building may be visible but not used as structural attachment"),
    doorsAndWindows: str(analysis.doorsAndWindows, "read all doors, windows, shutters and door-window clearances directly from the photo"),
    existingPaving: str(analysis.existingPaving, terraceContext ? "terrace paving / outdoor floor as photographed" : poolContext ? "pool deck / exterior paving as photographed" : "existing patio, garden path, deck, stone or outdoor floor as photographed"),
    existingShadingSystems: str(analysis.existingShadingSystems, "existing awnings, pergolas, canopies, umbrellas or shading systems visible in the photo"),
    parapetsAndBoundaries: str(analysis.parapetsAndBoundaries, terraceContext ? "terrace parapet, railing and edge constraints must be preserved" : "walls, fences, parapets, pool edges or boundaries as photographed"),
    outdoorFurniture: str(analysis.outdoorFurniture, "existing outdoor furniture and movable objects as photographed"),
    poolOrWater: str(analysis.poolOrWater, poolContext ? "pool edge or water area visible and must be preserved exactly" : "no pool/water interaction unless visible in photo"),
    obstacles: arr(analysis.obstacles, [
      "doors and windows must remain operable",
      "shutters, awnings, gutters, eaves, parapets and railings must not be collided with",
      "main circulation paths should remain plausible",
    ]),
    lightAndShadows: str(analysis.lightAndShadows, "preserve original light direction, sun/shade balance and outdoor contact shadows"),
    availableInstallationSpace: str(analysis.availableInstallationSpace, "infer available footprint from the target outdoor area without invading non-target areas"),
    untouchableElements: arr(analysis.untouchableElements, [
      "house facade",
      "doors and windows",
      "existing paving outside footprint",
      "pool/parapet/garden boundaries",
      "non-target furniture",
    ]),
    contextToPreserve: arr(analysis.contextToPreserve, [
      "sky",
      "garden",
      "neighboring buildings",
      "pool edge if present",
      "street / exterior context",
      "image dimensions and perspective",
    ]),
    imageOrientation: orientationFromMeta(photoMeta),
  };
}
