import type {
  ConfigurazioneRistrutturazione,
  GlobalSceneAnalysis,
  RenovationDomainId,
  RenovationSceneClass,
} from "./types";
import { RENOVATION_DOMAIN_IDS } from "./types";

export const SCENE_ALLOWED_DOMAINS: Record<RenovationSceneClass, RenovationDomainId[]> = {
  bathroom: ["bathroom", "floor"],
  room: ["room", "floor"],
  kitchen_room: ["room", "floor"],
  facade: ["facade", "windows", "shutters", "roof", "generic_openings"],
  roof: ["roof"],
  outdoor: ["pool", "pergola", "exterior_flooring", "garden"],
  mixed_exterior_envelope: ["facade", "windows", "shutters", "roof", "generic_openings"],
  mixed_interior_room: ["room", "floor"],
  unknown: ["bathroom", "room", "floor", "facade", "windows", "shutters", "roof", "pool", "pergola", "exterior_flooring", "garden", "generic_openings"],
};

const INTERIOR_DOMAINS: RenovationDomainId[] = ["bathroom", "room", "floor"];
const ENVELOPE_DOMAINS: RenovationDomainId[] = ["facade", "windows", "shutters", "roof", "generic_openings"];
const OUTDOOR_DOMAINS: RenovationDomainId[] = ["pool", "pergola", "exterior_flooring", "garden"];

function uniq<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function textCorpus(config: ConfigurazioneRistrutturazione): string {
  return [
    config.notes,
    config.sceneHint,
    ...config.activeDomains,
    ...(config.requestedChanges ?? []).flatMap((change) => [
      change.domain,
      change.targetZone,
      change.object,
      change.specification,
      ...(change.preserve ?? []),
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function hasAny(config: ConfigurazioneRistrutturazione, domains: RenovationDomainId[]): boolean {
  return config.activeDomains.some((domain) => domains.includes(domain));
}

function inferSceneClass(config: ConfigurazioneRistrutturazione): RenovationSceneClass {
  if (config.sceneHint) return config.sceneHint;

  const corpus = textCorpus(config);
  if (config.activeDomains.includes("bathroom") || /bagno|bathroom|doccia|shower|vasca|sanitari|wc|bidet/.test(corpus)) {
    return "bathroom";
  }

  if (hasAny(config, OUTDOOR_DOMAINS) || /giardino|garden|patio|terrazzo|piscina|pool|pergola|outdoor/.test(corpus)) {
    return "outdoor";
  }

  const hasEnvelope = hasAny(config, ENVELOPE_DOMAINS);
  if (hasEnvelope && config.activeDomains.length > 1) return "mixed_exterior_envelope";
  if (config.activeDomains.includes("facade") || config.activeDomains.includes("windows") || config.activeDomains.includes("shutters")) {
    return "facade";
  }
  if (config.activeDomains.includes("roof")) return "roof";

  if (/cucina|kitchen|lavello|forno|piano cottura|pensili/.test(corpus)) return "kitchen_room";
  if (hasAny(config, INTERIOR_DOMAINS) || /stanza|soggiorno|camera|living|arredo|parete|soffitto/.test(corpus)) {
    return config.activeDomains.length > 1 ? "mixed_interior_room" : "room";
  }

  return "unknown";
}

function candidateZonesFor(sceneClass: RenovationSceneClass): string[] {
  switch (sceneClass) {
    case "bathroom":
      return ["shower/tub zone", "sanitary zone", "vanity zone", "bathroom floor", "tiled walls", "mirror and lighting zone"];
    case "room":
    case "mixed_interior_room":
    case "kitchen_room":
      return ["main wall", "accent wall", "secondary walls", "floor", "ceiling", "furniture groups", "curtain zone", "kitchen block if visible"];
    case "facade":
    case "mixed_exterior_envelope":
      return ["full facade", "ground floor band", "upper facade", "window openings", "window surrounds", "shutters", "roof planes if visible", "gutters and rails"];
    case "roof":
      return ["main roof slope", "secondary roof slope", "ridge", "eaves", "gutters", "skylights if visible"];
    case "outdoor":
      return ["lawn or garden zone", "pool insertion zone", "pergola installation zone", "deck or exterior paving", "patio furniture zone"];
    default:
      return ["visible target area", "primary surfaces", "fixed architecture", "non-target context"];
  }
}

function surfacesFor(sceneClass: RenovationSceneClass): string[] {
  switch (sceneClass) {
    case "bathroom":
      return ["bathroom floor", "tiled walls", "wet-area walls", "ceiling if visible", "door/window frame if visible"];
    case "facade":
    case "mixed_exterior_envelope":
      return ["facade plaster", "window reveals", "sills", "shutters", "roof edge if visible", "balconies/railings if visible"];
    case "roof":
      return ["roof covering", "ridge", "eaves", "gutters", "skylights/chimneys if visible"];
    case "outdoor":
      return ["ground plane", "lawn", "patio/deck", "facade edge", "pool/pergola candidate zones"];
    default:
      return ["floor", "walls", "ceiling", "openings", "furniture surfaces"];
  }
}

function propertyTypeFor(sceneClass: RenovationSceneClass): string {
  switch (sceneClass) {
    case "bathroom": return "bathroom interior";
    case "kitchen_room": return "kitchen or kitchen-living interior";
    case "facade":
    case "mixed_exterior_envelope": return "building facade / exterior envelope";
    case "roof": return "roof and upper building envelope";
    case "outdoor": return "residential outdoor space";
    case "room":
    case "mixed_interior_room": return "interior room";
    default: return "unknown photographed scene";
  }
}

function openingHints(sceneClass: RenovationSceneClass): string[] {
  if (sceneClass === "bathroom") return ["bathroom window if visible", "door if visible"];
  if (sceneClass === "facade" || sceneClass === "mixed_exterior_envelope") return ["all visible window/door openings", "non-target openings to preserve", "opening reveals if facade insulation is active"];
  if (sceneClass === "roof") return ["skylights/dormers only if visible", "facade openings below roof to preserve"];
  if (sceneClass === "outdoor") return ["doors/windows facing outdoor installation zone", "openings that pergola/pool must not obstruct"];
  return ["doors", "windows", "curtain zones", "kitchen/service openings if visible"];
}

function domainVisibility(config: ConfigurazioneRistrutturazione, sceneClass: RenovationSceneClass): {
  visibleSystems: RenovationDomainId[];
  nonVisibleDomains: RenovationDomainId[];
} {
  const allowed = SCENE_ALLOWED_DOMAINS[sceneClass];
  const visibleSystems = config.activeDomains.filter((domain) => allowed.includes(domain));
  const nonVisibleDomains = config.activeDomains.filter((domain) => !allowed.includes(domain));
  const roofConfig = config.domainConfigs?.roof;
  if (config.activeDomains.includes("roof") && allowed.includes("roof") && roofConfig?.visible === false) {
    return {
      visibleSystems: visibleSystems.filter((domain) => domain !== "roof"),
      nonVisibleDomains: uniq([...nonVisibleDomains, "roof"]),
    };
  }
  return { visibleSystems, nonVisibleDomains };
}

export function analyzeRistrutturazioneScene(
  config: ConfigurazioneRistrutturazione,
  rawAnalysis: Partial<GlobalSceneAnalysis> = {},
): GlobalSceneAnalysis {
  const sceneClass = rawAnalysis.sceneClass ?? inferSceneClass(config);
  const allowedDomains = rawAnalysis.allowedDomains ?? SCENE_ALLOWED_DOMAINS[sceneClass];
  const forbiddenDomains = rawAnalysis.forbiddenDomains ?? RENOVATION_DOMAIN_IDS.filter((domain) => !allowedDomains.includes(domain));
  const { visibleSystems, nonVisibleDomains } = domainVisibility({ ...config, activeDomains: uniq(config.activeDomains) }, sceneClass);
  const confidence = config.sceneHint ? "high" : (sceneClass === "unknown" ? "low" : "medium");

  return {
    version: "1.0",
    sceneClass,
    sceneConfidence: rawAnalysis.sceneConfidence ?? confidence,
    propertyOrRoomType: rawAnalysis.propertyOrRoomType ?? propertyTypeFor(sceneClass),
    architectureShell: rawAnalysis.architectureShell ?? "preserve the photographed architecture shell, proportions, openings and fixed geometry",
    cameraPerspective: rawAnalysis.cameraPerspective ?? "same camera angle, lens feel, crop, aspect ratio and perspective as the uploaded photo",
    visibleSurfaces: rawAnalysis.visibleSurfaces ?? surfacesFor(sceneClass),
    visibleOpenings: rawAnalysis.visibleOpenings ?? openingHints(sceneClass),
    fixedFunctionalAnchors: rawAnalysis.fixedFunctionalAnchors ?? [
      "structural walls",
      "doors and windows",
      "existing technical anchors visible in the photo",
    ],
    movableObjects: rawAnalysis.movableObjects ?? [
      "furniture and loose objects remain unless explicitly part of a selected domain action",
    ],
    structuralConstraints: rawAnalysis.structuralConstraints ?? [
      "single-photo scope",
      "no invisible-domain hallucination",
      "no unrelated architectural redesign",
    ],
    environmentContext: rawAnalysis.environmentContext ?? [
      "same surrounding context",
      "same light direction",
      "same shadows and reflections",
      "same image dimensions",
    ],
    lightingAndShadows: rawAnalysis.lightingAndShadows ?? "preserve photographed lighting direction, intensity, cast shadows and ambient occlusion",
    visibleSystems: rawAnalysis.visibleSystems ?? visibleSystems,
    allowedDomains,
    forbiddenDomains,
    nonVisibleDomains: rawAnalysis.nonVisibleDomains ?? nonVisibleDomains,
    candidateTargetZones: rawAnalysis.candidateTargetZones ?? candidateZonesFor(sceneClass),
    untouchableElements: rawAnalysis.untouchableElements ?? [
      "non-target architecture",
      "non-target surfaces",
      "non-target objects",
      "image crop and aspect ratio",
    ],
    sourceSignals: rawAnalysis.sourceSignals ?? [
      `scene classified as ${sceneClass}`,
      `active domains: ${config.activeDomains.join(", ") || "none"}`,
    ],
  };
}
