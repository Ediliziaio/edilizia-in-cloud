import type {
  ConfigurazionePortaInterna,
  InteriorDoorPhotoMeta,
  InteriorDoorSceneAnalysis,
} from "./types.ts";
import { CONTEXT_DESCRIPTIONS } from "./promptFragments.ts";

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

function inferOrientation(photoMeta?: InteriorDoorPhotoMeta | null): InteriorDoorSceneAnalysis["imageOrientation"] {
  if (photoMeta?.orientation) return photoMeta.orientation;
  if (!photoMeta?.width || !photoMeta.height) return "unknown";
  if (photoMeta.width === photoMeta.height) return "square";
  return photoMeta.width > photoMeta.height ? "landscape" : "portrait";
}

export function normalizeInteriorDoorSceneAnalysis(
  config: ConfigurazionePortaInterna,
  rawAnalysis?: unknown,
  photoMeta?: InteriorDoorPhotoMeta | null,
): InteriorDoorSceneAnalysis {
  return {
    version: "1.0",
    roomType: config.context,
    doorwayPosition: text(rawAnalysis, "doorwayPosition", `${config.apertura.vano_target} visible inside a ${CONTEXT_DESCRIPTIONS[config.context]}`),
    existingDoorPresence: text(rawAnalysis, "existingDoorPresence", "existing interior door or empty doorway visible"),
    existingDoorType: text(rawAnalysis, "existingDoorType", "standard hinged interior door/opening with conventional frame"),
    wallMaterialAndColor: text(rawAnalysis, "wallMaterialAndColor", "painted interior walls to preserve outside doorway junction"),
    floorMaterial: text(rawAnalysis, "floorMaterial", "existing floor perspective to preserve outside threshold/passage zone"),
    skirtingBaseboard: text(rawAnalysis, "skirtingBaseboard", "visible skirting/baseboard near the doorway"),
    ceilingRelation: text(rawAnalysis, "ceilingRelation", config.apertura.rapporto_con_soffitto),
    nearbyFurniture: stringArray(rawAnalysis, "nearbyFurniture", ["nearby furniture if visible and non-target"]),
    nearbyFixtures: stringArray(rawAnalysis, "nearbyFixtures", ["switches", "pictures", "radiators or nearby fixtures if visible"]),
    lightingAndShadows: text(rawAnalysis, "lightingAndShadows", "preserve photographed room lighting and doorway shadows"),
    apparentOpeningWidth: text(rawAnalysis, "apparentOpeningWidth", config.apertura.larghezza_apparente),
    apparentOpeningHeight: text(rawAnalysis, "apparentOpeningHeight", config.apertura.altezza_apparente),
    wallSlidingAvailableArea: text(rawAnalysis, "wallSlidingAvailableArea", config.apertura.spazio_scorrimento_parete),
    adjacentRoomVisibility: text(rawAnalysis, "adjacentRoomVisibility", "preserve any visible adjacent room through the doorway unless the new door/glass naturally changes view-through"),
    untouchableElements: stringArray(rawAnalysis, "untouchableElements", [
      "non-target walls",
      "non-target floor",
      "ceiling",
      "nearby furniture and fixtures",
    ]),
    contextToPreserve: stringArray(rawAnalysis, "contextToPreserve", [
      "same room identity",
      "same wall color and texture outside the doorway",
      "same floor perspective",
      "same camera angle and crop",
    ]),
    imageOrientation: inferOrientation(photoMeta),
  };
}
