import type {
  ConfigurazionePergole,
  PergolaInstallabilityEnvelope,
  PergolaSceneAnalysis,
  PergolaTargetAreaMap,
} from "./types.ts";

const ZONE_DESCRIPTIONS: Record<string, string> = {
  addossata_facciata: "wall-adjacent outdoor area directly in front of the facade / door-window line",
  patio_centrale: "main patio area, centered on the usable outdoor surface",
  terrazzo: "terrace area inside parapet/railing boundaries",
  bordo_piscina: "poolside lounge zone near the pool edge without invading the water or coping",
  giardino_relax: "garden relaxation zone with plausible post foundations",
  dining_outdoor: "outdoor dining area with circulation kept usable around table/chairs",
  custom: "user-described installation zone",
};

function isPergolaWallMounted(config: ConfigurazionePergole): boolean {
  return config.installazione.addossata_si_no || config.struttura.tipo.includes("addossata");
}

export function buildPergolaTargetAreaMap(
  config: ConfigurazionePergole,
  scene: PergolaSceneAnalysis,
): PergolaTargetAreaMap {
  const zone = config.installazione.zona;
  const custom = config.installazione.descrizione_zona?.trim();
  const zoneDescription = zone === "custom" && custom ? custom : ZONE_DESCRIPTIONS[zone];
  const wallMounted = isPergolaWallMounted(config);

  return {
    zone,
    targetDescription: zoneDescription,
    footprint: `${config.installazione.larghezza_apparente ?? "media"} width x ${config.installazione.profondita_apparente ?? "standard"} depth apparent footprint, scaled to the photographed patio/terrace/garden and never oversized`,
    rearAttachmentLine: wallMounted
      ? "rear beam/ledger follows the facade plane at a buildable height above doors/windows, without cutting frames, shutters or eaves"
      : "no rear wall attachment; structure stands independently inside the target footprint",
    frontEdge: "front beam line stays parallel to the perceived facade / patio edge and follows image perspective",
    leftRightLimits: "left and right pergola limits stay within the usable outdoor zone and do not collide with walls, railings, pool edges or circulation",
    clearances: [
      "doors and door-windows remain visually operable",
      "shutters, windows, handles, awnings and gutters are not blocked unless explicitly accepted",
      "walkable passages remain plausible",
      ...scene.obstacles,
    ],
    noOccupyZones: [
      "inside pool water",
      "outside terrace parapet/railing",
      "through facade openings",
      "over non-target neighboring property",
      "on top of movable furniture legs unless furniture is explicitly below the pergola",
    ],
  };
}

export function buildPergolaInstallabilityEnvelope(
  config: ConfigurazionePergole,
  scene: PergolaSceneAnalysis,
  target: PergolaTargetAreaMap,
): PergolaInstallabilityEnvelope {
  const wallMounted = isPergolaWallMounted(config);
  const postCount = config.installazione.numero_montanti ?? (wallMounted ? 2 : 4);
  const anchoring = config.installazione.ancoraggio_a_terra ?? (config.installazione.zona === "giardino_relax" ? "prato_con_plinti" : "pavimento");

  const postPositions = wallMounted
    ? ["front-left post on the target paving", "front-right post on the target paving"]
    : postCount === 6
      ? ["four corner posts plus two intermediate posts aligned to the long span"]
      : ["four corner posts, all visibly grounded and aligned to the perspective"];

  return {
    structuralHeight: config.installazione.altezza_apparente === "alta"
      ? "slightly taller outdoor living height, still proportional to facade openings"
      : config.installazione.altezza_apparente === "bassa_da_correggere"
        ? "correct to a comfortable buildable clear height; do not create a low, unusable pergola"
        : "standard buildable clear height around a real patio/pergola installation",
    beamDepth: "beam/profile depth proportional to span; not too thin to be structural and not oversized",
    postCount,
    postPositions,
    anchoringLogic: `${anchoring.replace(/_/g, " ")} anchoring: posts must have believable foot plates, concealed anchors or foundation/plinth logic as appropriate`,
    facadeRelation: wallMounted
      ? `wall-mounted relation: ${target.rearAttachmentLine}; relation with openings: ${config.installazione.rapporto_con_porte_finestre || scene.doorsAndWindows}`
      : "freestanding relation: no facade penetration, no fake wall brackets, independent lateral stability",
    openingClearance: "maintain usable clearance from door/window swing, shutters, handles, thresholds, gutters/eaves and parapets",
    drainageLogic: "integrated water management: perimeter gutter/profile or slight pitch must make rainwater runoff plausible; downpipe only if selected/visible and coherent",
    forbiddenPlacements: [
      "floating posts or beams",
      "posts inside pool water or through furniture",
      "rear beam cutting through windows, doors, shutters or facade ornaments",
      "roof slab with no drainage logic",
      "unbuildable span with unrealistically thin profiles",
    ],
  };
}
