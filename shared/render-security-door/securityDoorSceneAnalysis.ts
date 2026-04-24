import type {
  ConfigurazionePortaBlindata,
  SecurityDoorPhotoMeta,
  SecurityDoorSceneAnalysis,
} from "./types.ts";
import { SIDE_CONTEXT_DESCRIPTIONS } from "./promptFragments.ts";

function recordValue(raw: unknown, key: string): unknown {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>)[key] : undefined;
}

function text(raw: unknown, key: string, fallback: string): string {
  const value = recordValue(raw, key);
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function stringArray(raw: unknown, key: string, fallback: string[]): string[] {
  const value = recordValue(raw, key);
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : fallback;
}

function inferOrientation(photoMeta?: SecurityDoorPhotoMeta | null): SecurityDoorSceneAnalysis["imageOrientation"] {
  if (photoMeta?.orientation) return photoMeta.orientation;
  if (!photoMeta?.width || !photoMeta.height) return "unknown";
  if (photoMeta.width === photoMeta.height) return "square";
  return photoMeta.width > photoMeta.height ? "landscape" : "portrait";
}

export function normalizeSecurityDoorSceneAnalysis(
  config: ConfigurazionePortaBlindata,
  rawAnalysis?: unknown,
  photoMeta?: SecurityDoorPhotoMeta | null,
): SecurityDoorSceneAnalysis {
  const sideContext = config.side_context;
  const interior = config.visible_side === "interno" || sideContext === "lato_interno" || sideContext === "corridoio_interno";
  const defaultEnvironment = interior
    ? "interior entrance / corridor with visible existing entrance door"
    : sideContext === "pianerottolo"
      ? "condominium landing with visible apartment entrance door"
      : "covered residential entrance with visible exterior door";

  return {
    version: "1.0",
    environmentType: text(rawAnalysis, "environmentType", defaultEnvironment),
    visibleSide: sideContext,
    entranceContext: text(rawAnalysis, "entranceContext", SIDE_CONTEXT_DESCRIPTIONS[sideContext]),
    existingDoorPresence: text(rawAnalysis, "existingDoorPresence", "existing door visible in the target opening"),
    existingDoorStyle: text(rawAnalysis, "existingDoorStyle", "simple existing entrance door with conventional frame/casing"),
    existingFrameAndCasing: text(rawAnalysis, "existingFrameAndCasing", "existing frame and trim visible around the door opening"),
    surroundingWalls: text(rawAnalysis, "surroundingWalls", "surrounding wall planes must remain unchanged outside the doorway junction"),
    floorAndThreshold: text(rawAnalysis, "floorAndThreshold", "visible floor and threshold at the base of the doorway"),
    skirtingOrBaseboards: text(rawAnalysis, "skirtingOrBaseboards", "baseboard/skirting near the doorway, preserve outside direct intervention"),
    apparentOpeningWidth: text(rawAnalysis, "apparentOpeningWidth", config.apertura.larghezza_apparente),
    apparentOpeningHeight: text(rawAnalysis, "apparentOpeningHeight", config.apertura.altezza_apparente),
    revealDepth: text(rawAnalysis, "revealDepth", config.apertura.profondita_spallette),
    adjacentFixtures: stringArray(rawAnalysis, "adjacentFixtures", ["intercom/switches if visible", "nearby wall details"]),
    lightingAndShadows: text(rawAnalysis, "lightingAndShadows", "preserve photographed lighting direction and local doorway shadows"),
    untouchableElements: stringArray(rawAnalysis, "untouchableElements", [
      "non-target walls",
      "non-target floor",
      "switches and intercom if present",
      "furniture or objects outside the door opening",
    ]),
    contextToPreserve: stringArray(rawAnalysis, "contextToPreserve", [
      "same entrance context",
      "same floor",
      "same wall color and texture outside the opening",
      "same camera perspective",
    ]),
    imageOrientation: inferOrientation(photoMeta),
  };
}
